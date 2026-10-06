"""CLI : python -m backend.cli.extract_receipt IMAGE --output RESULTAT.json."""
import argparse
import hashlib
import json
import sys
import tempfile
import time
from pathlib import Path
from subprocess import TimeoutExpired

from pydantic import ValidationError

from backend.app.receipts.ocr import crop_tesseract_item_area, prepare_tesseract_image, recognize, reread_member_discount, validate_blocks
from backend.app.receipts.parser import group_rows, parse_receipt
from backend.app.receipts.schemas import ReceiptExtraction, ReceiptSource


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def improves_extraction(candidate: ReceiptExtraction, current: ReceiptExtraction) -> bool:
    """Évite qu'un candidat plus propre mais moins complet remplace l'original."""
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


def main() -> int:
    parser = argparse.ArgumentParser(description='Extraire un reçu localement : Maxi, Metro ou règles génériques.')
    parser.add_argument('image', type=Path, nargs='?')
    parser.add_argument('-o', '--output', type=Path, help='Sans cette option, écrit le JSON sur stdout.')
    parser.add_argument('--engine', choices=['auto', 'vision', 'tesseract'], default='auto')
    parser.add_argument('--profile', choices=['auto', 'maxi', 'metro', 'generic'], default='auto',
                        help='Format du reçu ; détection automatique par défaut.')
    parser.add_argument('--languages', default='fra+eng', help='Langues Tesseract installées.')
    parser.add_argument('--tesseract-psm', type=int, default=4,
                        help='Segmentation Tesseract : 4 par défaut pour un reçu en colonne.')
    parser.add_argument('--tesseract-preprocess', choices=['auto', 'none'], default='auto',
                        help='Tesseract : comparer le reçu entier et son recadrage d’articles.')
    parser.add_argument('--price-tessdata-dir', type=Path,
                        default=Path(__file__).resolve().parents[2] / '.cache' / 'receipt-tessdata-best',
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

        def parse_candidate(candidate_blocks, candidate_engine):
            candidate = parse_receipt(group_rows(candidate_blocks), ReceiptSource(
                filename=args.image.name, sha256=source_hash, engine=candidate_engine,
                elapsed_seconds=round(time.perf_counter() - started, 3),
            ), args.date_order, args.profile)
            if candidate_engine.startswith('tesseract'):
                geometric = parse_receipt(group_rows(candidate_blocks, use_tsv_lines=False), candidate.source,
                                          args.date_order, args.profile)
                if improves_extraction(geometric, candidate):
                    candidate = geometric
            return candidate

        result = parse_candidate(blocks, engine)
        full_result = result
        selected_blocks = blocks
        selected_psm = args.tesseract_psm
        # Les tickets génériques étroits alternent texte dense et lignes
        # dispersées. Comparer les segmentations seulement si PSM 4 reste
        # non vérifiable évite ce coût aux reçus déjà corrects.
        if (not args.ocr_json and engine == 'tesseract' and args.tesseract_psm == 4
                and args.tesseract_preprocess == 'auto'
                and result.parsing_profile == 'generic'
                and result.totals.arithmetic_status != 'matches'):
            for alternate_psm in (3, 6, 11, 12):
                alternate_blocks, _ = recognize(args.image, 'tesseract', args.languages, alternate_psm)
                alternate_result = parse_candidate(alternate_blocks, f'tesseract-psm{alternate_psm}')
                if improves_extraction(alternate_result, result):
                    result, selected_blocks, selected_psm = alternate_result, alternate_blocks, alternate_psm
        if not args.ocr_json and engine == 'tesseract' and args.tesseract_preprocess == 'auto':
            with tempfile.TemporaryDirectory(prefix='optimeal-tesseract-') as temporary:
                if result.parsing_profile == 'metro' and result.totals.arithmetic_status != 'matches':
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
                if result.parsing_profile == 'generic' and result.totals.arithmetic_status != 'matches':
                    prepared = Path(temporary) / 'prepared.png'
                    prepare_tesseract_image(args.image, prepared)
                    for prepared_psm in (4, 6, 11):
                        prepared_blocks, _ = recognize(prepared, 'tesseract', args.languages, prepared_psm)
                        prepared_result = parse_candidate(prepared_blocks, f'tesseract-prepared-psm{prepared_psm}')
                        if improves_extraction(prepared_result, result):
                            result, selected_blocks = prepared_result, prepared_blocks
                cropped = Path(temporary) / 'items.png'
                if (result.totals.arithmetic_status != 'matches'
                        and not result.source.engine.startswith('tesseract-prepared')
                        and crop_tesseract_item_area(args.image, selected_blocks, cropped)):
                    cropped_blocks, _ = recognize(cropped, 'tesseract', args.languages, selected_psm)
                    cropped_result = parse_candidate(cropped_blocks, 'tesseract-cropped')
                    if improves_extraction(cropped_result, result):
                        result, selected_blocks = cropped_result, cropped_blocks
        if args.save_ocr:
            write_json(args.save_ocr, {
                'schema_version': 'receipt-ocr-2', 'image_sha256': source_hash,
                'engine': result.source.engine,
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
