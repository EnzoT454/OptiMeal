"""Candidats prudents : nom et montant, ou nom suivi d'une quantité explicite."""
import re
from decimal import Decimal

from ..schemas import ReceiptItem
from .common import ADJUSTMENT, DETAIL, STOP, TOTAL, normalized, trailing_amount

CATEGORIES = {'EPICERIE', 'GROCERY', 'FRUITS LEGUM', 'FRUITS LEGUMES', 'FRUITS ET LEGUMES',
              'PRODUIT LAIT', 'PRODUITS LAITIERS', 'SANTE BEAUT', 'SANTE BEAUTE', 'MICHE',
              'BOULANGERIE', 'BOULANGERIE COMMERCIALE', 'VIANDES', 'POISSONNERIE', 'SURGELES'}


def category(raw: str) -> bool:
    return normalized(raw) in CATEGORIES


def product(raw: str, line_id: int, category_raw: str | None, following: str = '') -> ReceiptItem | None:
    text = normalized(raw)
    if (STOP.match(text) or TOTAL.match(text) or ADJUSTMENT.search(text)
            or re.search(r'\b(POINTS|PTS|TAXES?|TPS|TVQ|GST|QST|HST|SOLDE|BALANCE)\b', text)
            or re.search(r'T\.P\.S|T\.V\.Q', text)
            or re.match(r'^(TEL|DATE|CARTE|NUMERO|BIENVENUE|MERCI|ADRESSE)\b', text)):
        return None
    name, amount = trailing_amount(raw)
    if detail_candidate(raw) or re.match(r'^\s*\d+\s+pour\b', raw, re.I):
        return None
    if amount is None and not (detail(following)[0] or detail_candidate(following)):
        return None
    match = re.match(r'^\((\d+)\)\s*(.*)$', name)
    quantity = Decimal(match[1]) if match else None
    name = match[2] if match else name
    if quantity is not None and quantity <= 0:
        return None
    if not re.match(r'^[A-Za-zÀ-ÿ]', name) or not name.strip():
        return None
    return ReceiptItem(line_id=line_id, name=name.strip(), category_raw=category_raw,
                       quantity=quantity, unit='unit' if quantity else None,
                       quantity_source='explicit' if quantity else 'unknown',
                       line_total=amount, source_lines=[raw])


def detail_candidate(raw: str) -> bool:
    """Structure quantité/prix ; ne répare aucun chiffre illisible."""
    return bool(re.match(r'^\s*(?:\d+(?:[.,]\d+)?|[bB])\s*(?:kg|lb)?\s*[@àeEG0(&©]', raw)
                # Les reçus Maxi impriment parfois le total sans second signe $ :
                # "4 G $1.89 7.56". Deux montants restent requis afin de ne pas
                # prendre une ligne de quantité seule pour un détail de prix.
                and (raw.count('$') >= 2 or len(re.findall(r'\d+[.,]\s*\d{2}', raw)) >= 2))


def detail(raw: str):
    result = DETAIL.match(raw)
    if result:
        return result, []
    # Tolérer un glyphe de séparation mal lu seulement dans une ligne quantité/prix.
    if not detail_candidate(raw):
        return None, []
    cleaned = re.sub(r'^(\s*\d+(?:[.,]\d+)?\s*(?:kg|lb)?\s*)[eEG0(&©]', r'\1@', raw)
    result = DETAIL.match(cleaned)
    return result, ['ocr_quantity_separator_requires_review'] if result else []


def bundle_adjustment(raw: str):
    """Un rabais de lot signé est appliqué ; un chiffre illisible reste inconnu."""
    from ..schemas import ReceiptAdjustment
    from .common import AMOUNT, decimal
    if not re.match(r'^\s*\d+\s+pour\b', raw, re.I):
        return None
    match = re.search(rf'[-−]\s*\$?\s*({AMOUNT})\s*(?:RT)?\s*$', raw, re.I)
    return ReceiptAdjustment(amount=-decimal(match[1]) if match else None,
                             effect='applied' if match else 'unknown', source_line=raw)


def prepare_lines(lines: list[str]) -> tuple[list[str], dict[str, list[str]]]:
    """Assembler les descriptions coupées, en conservant chaque ligne originale."""
    result, originals = [], {}
    index = 0
    while index < len(lines):
        raw = lines[index]
        parts = [raw]
        next_line = lines[index + 1] if index + 1 < len(lines) else ''
        after = lines[index + 2] if index + 2 < len(lines) else ''
        # Deux lignes de description avant la ligne quantité × prix.
        if (re.match(r'^[A-Za-zÀ-ÿ]', raw) and trailing_amount(raw)[1] is None
                and not category(raw) and not TOTAL.match(normalized(raw))
                and re.match(r'^[A-Za-zÀ-ÿ]', next_line)
                and next_line[0].islower()
                and trailing_amount(next_line)[1] is None
                and (detail(after)[0] or detail_candidate(after))):
            parts.append(next_line)
        # Complément de format sur la ligne suivante après un produit tarifé.
        elif (trailing_amount(raw)[1] is not None and not TOTAL.match(normalized(raw))
              and not STOP.match(normalized(raw))
              and re.search(r'\d\s*(?:g|gr|gг|kg|ml|lt|lb)\s*$', next_line, re.I)
              and '$' not in next_line):
            parts.append(next_line)
        if len(parts) > 1:
            name, amount = trailing_amount(raw)
            combined = (' '.join([name, parts[1]]) + f' ${amount}'
                        if amount is not None else ' '.join(parts))
            result.append(combined)
            originals[combined] = parts
        else:
            result.append(raw)
        index += len(parts)
    return result, originals
