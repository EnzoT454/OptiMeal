"""CLI : python -m backend.cli.extract_receipt IMAGE --output RESULTAT.json."""
import argparse
import hashlib
import json
import sys
import tempfile
import time
from pathlib import Path
from subprocess import TimeoutExpired
from typing import Literal

from pydantic import ValidationError

from backend.app.receipts.ocr import (
    TESSDATA_BEST_DIR,
    TESSDATA_LEGACY_DIR,
    crop_tesseract_columns,
    crop_tesseract_item_area,
    prepare_receipt_body,
    prepare_tesseract_image,
    recognize,
    reread_member_discount,
    reread_price_column,
    reread_text_column,
    validate_blocks,
)
from backend.app.receipts.parser import group_rows, parse_receipt
from backend.app.receipts.layout import align_price_column
from backend.app.receipts.schemas import OCRBlock, ReceiptExtraction, ReceiptSource


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def extraction_ready(result: ReceiptExtraction) -> bool:
    totals = result.totals
    return (totals.arithmetic_status == 'matches' and totals.total is not None
            and totals.subtotal is not None and totals.total >= totals.subtotal
            and totals.tax_check_status != 'mismatch')


def improves_extraction(candidate: ReceiptExtraction, current: ReceiptExtraction) -> bool:
    """Évite qu'un candidat plus propre mais moins complet remplace l'original."""
    if extraction_ready(candidate) != extraction_ready(current):
        return extraction_ready(candidate)
    if (candidate.totals.arithmetic_status == 'matches') != (current.totals.arithmetic_status == 'matches'):
        return candidate.totals.arithmetic_status == 'matches'
    candidate_totals = sum(value is not None for value in (candidate.totals.subtotal, candidate.totals.total))
    current_totals = sum(value is not None for value in (current.totals.subtotal, current.totals.total))
    if candidate_totals != current_totals:
        return candidate_totals > current_totals
    candidate_known = sum(item.line_total is not None for item in candidate.items)
    current_known = sum(item.line_total is not None for item in current.items)
    if candidate_known != current_known:
        return candidate_known > current_known
    if (candidate.totals.tax_check_status == 'matches') != (current.totals.tax_check_status == 'matches'):
        return candidate.totals.tax_check_status == 'matches'
    if len(candidate.items) != len(current.items):
        return len(candidate.items) > len(current.items)
    return False


def extract_from_blocks(
    candidate_blocks: list[OCRBlock], source: ReceiptSource,
    date_order: Literal['ymd', 'dmy'] = 'ymd',
    profile: Literal['auto', 'maxi', 'metro', 'superc', 'generic'] = 'auto',
) -> ReceiptExtraction:
    """Comparer les reconstructions géométriques sans relancer un moteur OCR."""
    candidate = parse_receipt(group_rows(candidate_blocks), source, date_order, profile)
    if source.engine.startswith('tesseract'):
        geometric = parse_receipt(group_rows(candidate_blocks, use_tsv_lines=False), candidate.source,
                                  date_order, profile)
        if improves_extraction(geometric, candidate):
            candidate = geometric
    aligned = parse_receipt(group_rows(candidate_blocks, deskew=True), candidate.source,
                            date_order, profile)
    if improves_extraction(aligned, candidate):
        candidate = aligned
    column_rows = align_price_column(candidate_blocks, candidate.parsing_profile)
    if column_rows:
        column_result = parse_receipt(column_rows, candidate.source, date_order, profile)
        if improves_extraction(column_result, candidate):
            candidate = column_result
            candidate.warnings.append('price_column_alignment_requires_review')
    if any(b.line_key and b.line_key.startswith('price-column-best:') for b in candidate_blocks):
        candidate.warnings.append('tesseract_best_price_model')
    if any(b.line_key and b.line_key.startswith('price-column-legacy:') for b in candidate_blocks):
        candidate.warnings.append('tesseract_legacy_price_model')
    return candidate


def main() -> int:
    parser = argparse.ArgumentParser(description='Extraire un reçu localement : Maxi, Metro, Super C ou règles génériques.')
    parser.add_argument('image', type=Path, nargs='?')
    parser.add_argument('-o', '--output', type=Path, help='Sans cette option, écrit le JSON sur stdout.')
    parser.add_argument('--engine', choices=['auto', 'vision', 'tesseract'], default='auto')
    parser.add_argument('--profile', choices=['auto', 'maxi', 'metro', 'superc', 'generic'], default='auto',
                        help='Format du reçu ; détection automatique par défaut.')
    parser.add_argument('--languages', default='fra+eng', help='Langues Tesseract installées.')
    parser.add_argument('--tesseract-psm', type=int, default=4,
                        help='Segmentation Tesseract : 4 par défaut pour un reçu en colonne.')
    parser.add_argument('--tesseract-preprocess', choices=['auto', 'none'], default='auto',
                        help='Tesseract : comparer le reçu entier et son recadrage d’articles.')
    parser.add_argument('--price-tessdata-dir', type=Path,
                        default=TESSDATA_BEST_DIR,
                        help='Dossier du modèle eng tessdata_best pour relire les rabais Metro.')
    parser.add_argument('--date-order', choices=['ymd', 'dmy'], default='ymd', help='Maxi : AA/MM/JJ par défaut.')
    parser.add_argument('--save-ocr', type=Path, help='Sauvegarder les blocs OCR bruts (contiennent des données privées).')
    parser.add_argument('--ocr-json', type=Path, help='Rejouer des blocs OCR sauvegardés, sans moteur OCR.')
    parser.add_argument('--schema', type=Path, help='Exporter le JSON Schema ; peut être utilisé sans image.')
    args = parser.parse_args()
    if args.image is None and args.schema is None:
        parser.error('Indiquer une image ou --schema.')
    inputs = [p.resolve() for p in (args.image, args.ocr_json) if p]
    outputs = [p.resolve() for p in (args.output, args.save_ocr, args.schema) if p]
    if len(set(outputs)) != len(outputs) or set(inputs) & set(outputs):
        parser.error('Les fichiers de sortie doivent être distincts entre eux et des entrées.')
    started = time.perf_counter()
    try:
        if args.schema:
            write_json(args.schema, ReceiptExtraction.model_json_schema(mode='serialization'))
        if args.image is None:
            return 0
        image_bytes = args.image.read_bytes()
        if args.ocr_json:
            archive = json.loads(args.ocr_json.read_text(encoding='utf-8'))
            if isinstance(archive, dict):
                if archive.get('image_sha256') != hashlib.sha256(image_bytes).hexdigest():
                    raise ValueError('La capture OCR ne correspond pas à cette image.')
                blocks = validate_blocks(archive['blocks'])
                engine = archive['engine']
            else:
                blocks = validate_blocks(archive)
                engine = 'tesseract-replay' if any(b.line_key for b in blocks) else 'saved_ocr_replay'
        else:
            blocks, engine = recognize(args.image, args.engine, args.languages, args.tesseract_psm)
        source_hash = hashlib.sha256(image_bytes).hexdigest()
        body_profile = archive.get('parsing_profile', args.profile) if args.ocr_json and isinstance(archive, dict) else args.profile

        def parse_candidate(candidate_blocks, candidate_engine):
            requested_profile = (body_profile if ('-body-' in candidate_engine or '-text-column' in candidate_engine)
                                 and args.profile == 'auto' else args.profile)
            return extract_from_blocks(candidate_blocks, ReceiptSource(
                filename=args.image.name, sha256=source_hash, engine=candidate_engine,
                elapsed_seconds=round(time.perf_counter() - started, 3),
            ), args.date_order, requested_profile)

        result = parse_candidate(blocks, engine)
        full_result = result
        body_profile = result.parsing_profile
        selected_blocks = blocks
        selected_psm = args.tesseract_psm
        if (not args.ocr_json and engine == 'tesseract' and args.tesseract_preprocess == 'auto'
                and result.parsing_profile in ('maxi', 'superc') and not extraction_ready(result)):
            with tempfile.TemporaryDirectory(prefix='optimeal-text-') as temporary:
                text_blocks = reread_text_column(args.image, blocks, engine, Path(temporary))
                if text_blocks:
                    text_result = parse_candidate(text_blocks, 'tesseract-text-column')
                    if improves_extraction(text_result, result):
                        result, selected_blocks = text_result, text_blocks
                    best_available = (TESSDATA_BEST_DIR / 'eng.traineddata').is_file()
                    legacy_available = (TESSDATA_LEGACY_DIR / 'eng.traineddata').is_file()
                    models = (['legacy'] if legacy_available else []) + ['standard'] + (['best'] if best_available else [])
                    for model_name in models:
                        for variant in ('gray', 'normalized', 'binary', 'gray-psm4', 'normalized-psm4', 'binary-psm4'):
                            prices = reread_price_column(args.image, text_blocks, engine, Path(temporary),
                                                         variant, use_best_model=model_name == 'best',
                                                         use_legacy_model=model_name == 'legacy')
                            if prices:
                                price_result = parse_candidate(prices, f'tesseract-text-column-{model_name}-' + variant)
                                if improves_extraction(price_result, result):
                                    result, selected_blocks = price_result, prices
                            if extraction_ready(result):
                                break
                        if extraction_ready(result):
                            break

        if (not args.ocr_json and result.parsing_profile in ('maxi', 'superc')
                and not extraction_ready(result)
                and (engine == 'vision' or args.tesseract_preprocess == 'auto')):
            with tempfile.TemporaryDirectory(prefix='optimeal-prices-') as temporary:
                for variant in ('gray', 'normalized', 'binary', 'gray-psm4', 'normalized-psm4', 'binary-psm4'):
                    price_blocks = reread_price_column(args.image, blocks, engine, Path(temporary), variant)
                    if price_blocks:
                        price_result = parse_candidate(price_blocks, f'{engine}-price-column-{variant}')
                        if improves_extraction(price_result, result):
                            result, selected_blocks = price_result, price_blocks
                    if extraction_ready(result):
                        break
        if (not args.ocr_json and result.parsing_profile in ('maxi', 'superc')
                and not extraction_ready(result)
                and (engine == 'vision' or args.tesseract_preprocess == 'auto')):
            with tempfile.TemporaryDirectory(prefix='optimeal-body-') as temporary:
                for variant in ('gray', 'normalized', 'binary'):
                    body = Path(temporary) / f'body-{variant}.png'
                    if not prepare_receipt_body(args.image, blocks, body, variant):
                        break
                    for psm in ((6, 4) if engine == 'tesseract' else (6,)):
                        body_blocks, _ = recognize(body, engine, args.languages, psm)
                        body_engine = f'{engine}-body-{variant}-psm{psm}'
                        body_result = parse_candidate(body_blocks, body_engine)
                        if improves_extraction(body_result, result):
                            result, selected_blocks = body_result, body_blocks
                        if not extraction_ready(body_result):
                            for price_variant in ('gray', 'normalized', 'binary'):
                                prices = reread_price_column(body, body_blocks, engine,
                                                              Path(temporary), price_variant)
                                if prices:
                                    price_result = parse_candidate(prices, body_engine + '-prices-' + price_variant)
                                    if improves_extraction(price_result, result):
                                        result, selected_blocks = price_result, prices
                                if extraction_ready(result):
                                    break
                        if extraction_ready(result):
                            break
                    if extraction_ready(result):
                        break
        # Les tickets génériques étroits alternent texte dense et lignes
        # dispersées. Comparer les segmentations seulement si PSM 4 reste
        # non vérifiable évite ce coût aux reçus déjà corrects.
        if (not args.ocr_json and engine == 'tesseract' and args.tesseract_psm == 4
                and args.tesseract_preprocess == 'auto'
                and result.parsing_profile == 'generic'
                and not extraction_ready(result)):
            for alternate_psm in (3, 6, 11, 12):
                alternate_blocks, _ = recognize(args.image, 'tesseract', args.languages, alternate_psm)
                alternate_result = parse_candidate(alternate_blocks, f'tesseract-psm{alternate_psm}')
                if improves_extraction(alternate_result, result):
                    result, selected_blocks, selected_psm = alternate_result, alternate_blocks, alternate_psm
        if not args.ocr_json and engine == 'tesseract' and args.tesseract_preprocess == 'auto':
            with tempfile.TemporaryDirectory(prefix='optimeal-tesseract-') as temporary:
                if result.parsing_profile == 'metro' and not extraction_ready(result):
                    # Une autre segmentation peut aussi récupérer les taxes.
                    # Chaque relecture utilise les pixels de sa propre image.
                    metro_prepared = Path(temporary) / 'metro-prepared.png'
                    prepare_tesseract_image(args.image, metro_prepared)
                    metro_blocks, _ = recognize(metro_prepared, 'tesseract', args.languages, 6)
                    for candidate_image, candidate_blocks, candidate_engine in (
                            (args.image, blocks, 'tesseract'),
                            (metro_prepared, metro_blocks, 'tesseract-prepared-psm6')):
                        reread_blocks, changed = reread_member_discount(
                            candidate_image, candidate_blocks, args.price_tessdata_dir, Path(temporary))
                        reread_result = parse_candidate(
                            reread_blocks, candidate_engine + ('-discount-reread' if changed else ''))
                        if changed:
                            reread_result.warnings.append('member_discount_reread_requires_review')
                        if improves_extraction(reread_result, result):
                            result, selected_blocks = reread_result, reread_blocks
                if result.parsing_profile in ('generic', 'maxi') and not extraction_ready(result):
                    prepared = Path(temporary) / 'prepared.png'
                    prepare_tesseract_image(args.image, prepared)
                    column_blocks = []
                    for prepared_psm in (4, 6, 11):
                        prepared_blocks, _ = recognize(prepared, 'tesseract', args.languages, prepared_psm)
                        if prepared_psm == 4:
                            column_blocks = prepared_blocks
                        prepared_result = parse_candidate(prepared_blocks, f'tesseract-prepared-psm{prepared_psm}')
                        if improves_extraction(prepared_result, result):
                            result, selected_blocks = prepared_result, prepared_blocks
                        if result.parsing_profile == 'maxi' and extraction_ready(result):
                            break
                    columns = Path(temporary) / 'columns.png'
                    if (not extraction_ready(result)
                            and crop_tesseract_columns(prepared, column_blocks, columns)):
                        for column_psm in (4, 6):
                            column_blocks, _ = recognize(columns, 'tesseract', args.languages, column_psm)
                            column_result = parse_candidate(column_blocks, f'tesseract-prepared-columns-psm{column_psm}')
                            if improves_extraction(column_result, result):
                                result, selected_blocks = column_result, column_blocks
                            if extraction_ready(result):
                                break
                cropped = Path(temporary) / 'items.png'
                if (not extraction_ready(result)
                        and not result.source.engine.startswith('tesseract-prepared')
                        and crop_tesseract_item_area(args.image, selected_blocks, cropped)):
                    cropped_blocks, _ = recognize(cropped, 'tesseract', args.languages, selected_psm)
                    cropped_result = parse_candidate(cropped_blocks, 'tesseract-cropped')
                    if improves_extraction(cropped_result, result):
                        result, selected_blocks = cropped_result, cropped_blocks
        if args.save_ocr:
            root = Path(__file__).resolve().parents[2]
            models = {}
            for model, marker in (('legacy', 'price-column-legacy:'), ('best', 'price-column-best:')):
                model_path = root / '.cache' / f'receipt-tessdata-{model}' / 'eng.traineddata'
                if model_path.is_file() and any(b.line_key and b.line_key.startswith(marker) for b in selected_blocks):
                    models[f'tessdata_{model}_eng_sha256'] = hashlib.sha256(model_path.read_bytes()).hexdigest()
            write_json(args.save_ocr, {
                'schema_version': 'receipt-ocr-2', 'image_sha256': source_hash,
                'engine': result.source.engine,
                'parsing_profile': result.parsing_profile,
                'models': models,
                'blocks': [block.model_dump() for block in selected_blocks],
                'full_blocks': [block.model_dump() for block in blocks],
                'full_engine': engine,
                'ocr_warnings': [w for w in result.warnings if w == 'member_discount_reread_requires_review'],
            })
        if args.ocr_json and isinstance(archive, dict) and archive.get('full_blocks'):
            full_result = parse_candidate(validate_blocks(archive['full_blocks']), archive['full_engine'])
            result.warnings.extend(w for w in archive.get('ocr_warnings', []) if w not in result.warnings)
        if result.purchase_date is None and full_result.purchase_date is not None:
            result.purchase_date = full_result.purchase_date
            result.warnings = [w for w in result.warnings if w != 'purchase_date_missing']
            result.warnings.append('purchase_date_from_full_image')
        if result.retailer is None and full_result.retailer is not None:
            result.retailer = full_result.retailer
            result.store_id = full_result.store_id
        if (result.totals.taxes is None and full_result.totals.tax_check_status == 'matches'
                and result.totals.subtotal == full_result.totals.subtotal
                and result.totals.total == full_result.totals.total):
            # Réutiliser les taxes explicitement lues, jamais une différence de totaux.
            result.totals.taxes = full_result.totals.taxes
            result.totals.tax_check_status = 'matches'
            result.warnings.append('taxes_from_full_image')
        if args.ocr_json:
            result.source.engine += '-replay'
        result.source.elapsed_seconds = round(time.perf_counter() - started, 3)
        # Valider également la sérialisation, notamment les décimaux sous forme de chaînes.
        payload = result.model_dump_json(indent=2)
        ReceiptExtraction.model_validate_json(payload)
        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(payload + '\n', encoding='utf-8')
        else:
            print(payload)
        print(f'{len(result.items)} lignes ; somme {result.totals.items_sum} CAD ; '
              f'contrôle {result.totals.arithmetic_status} ; vérification humaine requise.', file=sys.stderr)
        return 0 if result.items else 2
    except (OSError, ValueError, ValidationError, TimeoutExpired) as exc:
        print(f'Extraction impossible : {exc}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
