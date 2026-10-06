"""Pipeline commun : détection du format, interprétation, contrôles et JSON."""
import re
from datetime import date
from decimal import Decimal
from statistics import median
from typing import Literal

from .schemas import OCRBlock, ReceiptExtraction, ReceiptItem, ReceiptSource
from .rules import generic, maxi, metro
from .rules.common import ADJUSTMENT, DETAIL, STOP, TOTAL, decimal, normalized, trailing_amount
from .validation import validate_totals


def prepare_tesseract_lines(lines: list[str]) -> tuple[list[str], dict[str, list[str]]]:
    """Retire seulement un préfixe OCR avant une structure Maxi reconnaissable.

    Tesseract ajoute parfois un glyphe ou quelques lettres avant une catégorie,
    un code produit, un détail quantité/prix ou un total. Les chiffres et la
    partie suivant la structure reconnue ne sont jamais changés.
    """
    patterns = (
        re.compile(r'\d{1,2}\s*[-–]\s*[A-Za-z]'),
        re.compile(r'(?:\(\d+\)\s*)?\d{4,14}\s+[A-Za-zÀ-ÿ]'),
        re.compile(r'\d+(?:[.,]\d+)?\s*(?:kg|lb)?\s*[@à]', re.I),
        re.compile(r'\b(?:SOUS[ \-–—]*TOTAL|SUBTOTAL|TOTAL)\b', re.I),
    )
    prepared, originals = [], {}
    for raw in lines:
        cleaned = raw
        for pattern in patterns:
            match = pattern.search(raw)
            if match and match.start() <= 4:
                cleaned = raw[match.start():]
                break
        prepared.append(cleaned)
        if cleaned != raw:
            originals[cleaned] = [raw]
    return prepared, originals


def discard_tesseract_maxi_noise(lines: list[str]) -> tuple[list[str], list[str]]:
    """Écarte seulement les fragments isolés impossibles dans une zone d'articles Maxi."""
    kept, discarded = [], []
    for raw in lines:
        if re.fullmatch(r'\s*(?:\d|[^\w\s]|[A-Za-zÀ-ÿ]{1,2})\s*', raw):
            discarded.append(raw)
        else:
            kept.append(raw)
    return kept, discarded


def group_rows(blocks: list[OCRBlock], use_tsv_lines: bool = True) -> list[str]:
    """Réunir les colonnes par proximité verticale, puis lire de gauche à droite.

    Les moteurs lisent parfois tous les noms puis toute la colonne de prix.
    Le seuil est relatif à la hauteur du texte, pas à la résolution de la photo.
    """
    # Conserver les lignes TSV lorsqu'elles existent ; Vision garde son
    # regroupement géométrique historique.
    if use_tsv_lines and blocks and all(block.line_key is not None for block in blocks):
        grouped: dict[str, list[OCRBlock]] = {}
        for block in blocks:
            grouped.setdefault(block.line_key, []).append(block)
        rows = sorted(grouped.values(), key=lambda row: median(b.y for b in row))
        return [' '.join(b.text for b in sorted(row, key=lambda b: b.x)) for row in rows]
    rows: list[list[OCRBlock]] = []
    for block in sorted(blocks, key=lambda b: b.y + b.height / 2):
        center = block.y + block.height / 2
        candidates = [(abs(center - median(b.y + b.height / 2 for b in row)), row)
                      for row in rows[-3:]]
        distance, closest = min(candidates, key=lambda pair: pair[0]) if candidates else (1, [])
        if closest and distance <= 0.5 * min(block.height, median(b.height for b in closest)):
            closest.append(block)
        else:
            rows.append([block])
    return [' '.join(b.text.strip() for b in sorted(row, key=lambda b: b.x)) for row in rows]


def purchase_date(lines: list[str], order: Literal['ymd', 'dmy']) -> tuple[date | None, list[str]]:
    for line in lines:
        if not re.search(r'DATE\s*TIME|DATE\s*:', normalized(line)):
            continue
        match = re.search(r'\b(\d{2}|\d{4})/(\d{2})/(\d{2}|\d{4})\b', line)
        if not match:
            continue
        a, month, c = map(int, match.groups())
        year, day = (a, c) if order == 'ymd' else (c, a)
        if year < 100:
            year += 2000  # Convention explicite de ce prototype pour les reçus modernes.
        try:
            result = date(year, month, day)
        except ValueError:
            return None, ['invalid_purchase_date']
        issues = ['purchase_date_order_requires_review']
        if result > date.today():
            issues.append('purchase_date_in_future')
        return result, issues
    return None, ['purchase_date_missing']


def detect_profile(lines: list[str], requested: str) -> tuple[str | None, str, list[str]]:
    # Un OCR peut produire plusieurs lignes de bruit avant l'en-tête. Dès qu'un
    # premier rayon est trouvé, tout ce qui le précède est l'en-tête pertinent.
    first_category = next((index for index, line in enumerate(lines)
                           if maxi.category(line) or generic.category(line)), 10)
    header = ' '.join(normalized(line) for line in lines[:first_category])
    full = ' '.join(normalized(line) for line in lines)
    brands = []
    if re.search(r'\bMAXI\b', header):
        brands.append('maxi')
    if re.search(r'\bMETRO\b', header) or re.search(r'\bMETROSONDAGE\s*\.\s*CA\b|RABAIS METRO&MOI', full):
        brands.append('metro')
    retailer = brands[0] if len(brands) == 1 else None
    numbered = any(maxi.category(line) for line in lines)
    named = any(generic.category(line) for line in lines)
    issues = []
    if requested != 'auto':
        issues.append('parsing_profile_forced')
        if retailer and requested not in (retailer, 'generic'):
            issues.append('retailer_profile_conflict')
        return retailer, requested, issues
    if retailer == 'maxi' and numbered:
        return retailer, 'maxi', issues
    if retailer == 'metro' and named:
        return retailer, 'metro', issues
    if len(brands) > 1:
        issues.append('ambiguous_retailer')
    issues.append('generic_profile_requires_review')
    return retailer, 'generic', issues


def apply_detail(item: ReceiptItem, raw: str, detail: re.Match) -> None:
    item.source_lines.append(raw)
    quantity = decimal(detail['quantity'])
    unit = (detail['unit'] or 'unit').lower()
    if quantity <= 0:
        item.warnings.append('invalid_quantity')
        return
    if detail['basis'] and detail['basis'].lower() != unit:
        item.warnings.append('incompatible_quantity_and_price_units')
        return
    if item.quantity is not None and item.quantity != quantity:
        item.warnings.append('conflicting_quantities')
        return
    item.quantity, item.unit, item.quantity_source = quantity, unit, 'explicit'
    item.unit_price = decimal(detail['price'])
    if detail['total']:
        amount = decimal(detail['total'])
        if item.line_total is not None and item.line_total != amount:
            item.warnings.append('conflicting_line_totals')
        else:
            item.line_total = amount


def parse_receipt(lines: list[str], source: ReceiptSource,
                  date_order: Literal['ymd', 'dmy'] = 'ymd',
                  profile: Literal['auto', 'maxi', 'metro', 'generic'] = 'auto') -> ReceiptExtraction:
    if profile not in ('auto', 'maxi', 'metro', 'generic'):
        raise ValueError('Profil de reçu inconnu.')
    original_lines = {}
    if source.engine.startswith('tesseract'):
        lines, original_lines = prepare_tesseract_lines(lines)
    retailer, chosen, issues = detect_profile(lines, profile)
    discarded_tesseract_noise = []
    if source.engine.startswith('tesseract') and chosen == 'maxi':
        lines, discarded_tesseract_noise = discard_tesseract_maxi_noise(lines)
    if chosen == 'generic':
        lines, generic_originals = generic.prepare_lines(lines)
        original_lines = {
            combined: [source for part in parts for source in original_lines.get(part, [part])]
            for combined, parts in generic_originals.items()
        } | original_lines
    rules = {'maxi': maxi, 'metro': metro, 'generic': generic}[chosen]
    warnings = ['unconfirmed_ocr_not_a_price_observation', 'package_formats_not_inferred', *issues]
    if source.engine.startswith('tesseract') and original_lines:
        warnings.append('tesseract_ocr_prefix_removed_requires_review')
    if discarded_tesseract_noise:
        warnings.append('tesseract_noise_lines_ignored_requires_review')
    store_id = None
    if retailer == 'maxi':
        for line in lines[:10]:
            if 'MAXI' in normalized(line) and (match := re.search(r'\((\d{3,6})\)', line)):
                store_id = match[1]
    bought_on, date_warnings = purchase_date(lines, date_order)
    warnings.extend(date_warnings)
    items, adjustments, unparsed = [], [], []
    category = None
    in_items = False
    ended = False
    payment = False
    subtotal = total = None
    tax_values = {}
    tax_ambiguous = False
    pending = None
    # Sans rayon reconnu, le repli générique demande une borne de fin lisible.
    has_end = any(TOTAL.match(normalized(line)) for line in lines)
    has_category = any(rules.category(line) for line in lines)
    tesseract_generic_without_end = source.engine.startswith('tesseract') and chosen == 'generic' and not has_end
    for index, raw in enumerate(lines):
        text = normalized(raw)
        if payment:
            continue
        if STOP.match(text):
            payment = True
            pending = None
            continue
        if TOTAL.match(text):
            ended, pending = True, None
            _, value = trailing_amount(raw)
            if text.startswith('TOTAL'):
                if total is None:
                    total = value
            elif subtotal is None:
                subtotal = value
            continue
        if ended:
            # Lire uniquement les taxes explicites entre sous-total et total/paiement.
            compact = text.replace('.', '').replace(' ', '')
            tax = next((label for label in ('TPS', 'TVQ', 'GST', 'QST', 'HST') if label in compact), None)
            if tax and total is None:
                _, value = trailing_amount(raw)
                if value is None or tax in tax_values:
                    tax_ambiguous = True
                else:
                    tax_values[tax] = value
            continue
        if rules.category(raw):
            category, in_items, pending = raw, True, None
            continue
        following = lines[index + 1] if index + 1 < len(lines) else ''
        if not in_items:
            if chosen != 'generic' or has_category or (not has_end and not tesseract_generic_without_end):
                continue
            if generic.product(raw, 1, None, following) is None:
                continue
            in_items = True
        if ADJUSTMENT.search(text):
            adjustment = metro.adjustment(raw) if chosen == 'metro' else None
            if adjustment:
                adjustments.append(adjustment)
            else:
                unparsed.append(raw)
            pending = None
            continue
        if chosen == 'generic' and (adjustment := generic.bundle_adjustment(raw)):
            adjustments.append(adjustment)
            pending = None
            continue
        # Les OCR peuvent confondre @ avec G, e ou 0. Cette tolérance est
        # commune aux profils : elle ne s'applique qu'à une ligne complète
        # quantité + prix unitaire + montant final, déjà rattachée à un article.
        detail, detail_warnings = generic.detail(raw)
        if detail and pending:
            apply_detail(pending, raw, detail)
            pending.warnings.extend(detail_warnings)
            continue
        if pending and generic.detail_candidate(raw):
            # Un montant final lisible reste utile même si le détail quantité/prix est illisible.
            _, amount = trailing_amount(raw)
            pending.source_lines.append(raw)
            pending.warnings.append('quantity_detail_unreadable')
            if pending.line_total is None:
                pending.line_total = amount
            elif amount != pending.line_total:
                pending.warnings.append('conflicting_line_totals')
            continue
        if re.search(r'\bPTS\b|\bPOINTS\b', text):
            pending = None
            continue
        item = rules.product(raw, len(items) + 1, category, following)
        if item:
            if chosen == 'generic':
                item.warnings.append('generic_candidate_requires_review')
            items.append(item)
            pending = item
        elif raw.strip():
            unparsed.append(raw)
            pending = None
    for item in items:
        item.source_lines = [part for line in item.source_lines for part in original_lines.get(line, [line])]
    unparsed = [part for line in unparsed for part in original_lines.get(line, [line])]
    taxes = sum(tax_values.values(), Decimal('0.00')) if tax_values and not tax_ambiguous else None
    totals = validate_totals(items, adjustments, subtotal, total, taxes, unparsed)
    if totals.arithmetic_status != 'matches':
        warnings.append('items_subtotal_' + totals.arithmetic_status)
    if totals.tax_check_status == 'mismatch':
        warnings.append('subtotal_plus_taxes_mismatch')
    if tax_ambiguous:
        warnings.append('ambiguous_tax_lines')
    if adjustments:
        warnings.append('receipt_adjustments_require_review')
    if unparsed:
        warnings.append('unparsed_lines_require_review')
    if tesseract_generic_without_end and items:
        warnings.append('tesseract_purchase_boundary_unverified')
    if not items:
        warnings.append('no_items_found')
    if total is None:
        warnings.append('receipt_total_missing')
    return ReceiptExtraction(
        parsing_profile=chosen, retailer=retailer, store_id=store_id, purchase_date=bought_on,
        date_order=date_order, source=source, items=items, adjustments=adjustments,
        unparsed_lines=unparsed, warnings=warnings, totals=totals,
    )
