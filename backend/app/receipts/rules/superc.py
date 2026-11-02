"""Reçus Super C : économies informatives, prix de lot et consignes séparées."""
import re

from ..schemas import ReceiptAdjustment, ReceiptItem
from . import generic, metro
from .common import AMOUNT, decimal, normalized, trailing_amount


def category(raw: str) -> bool:
    text = normalized(raw).rstrip(' |:;')
    return generic.category(raw) or bool(re.fullmatch(
        r'FRUIT\s*/\s*LEGU[MN]E|VIANDE|SURGELE EPIC|BOUL CO[MNHR]{2}ERC|NON-ALIM\.\s*TX|MET CUIS\.\s*TX', text))


def prepare_lines(lines: list[str]) -> tuple[list[str], dict[str, list[str]]]:
    prepared, originals = [], {}
    for raw in lines:
        cleaned = re.sub(r'^(Rabals|Rebais)\b', 'Rabais', raw.strip(' |:;'), flags=re.I)
        cleaned = re.sub(r'^S*SOUSS?[ \-–—]*TOT\s*AL\b', 'SOUS-TOTAL', cleaned, flags=re.I)
        cleaned = re.sub(r'^["“”\u2018\u2019]?OTAL\b|^TOT\s+AL\b', 'TOTAL', cleaned, flags=re.I)
        if re.match(r'^(?:RABAIS|CONSIGNE|PRIX)\b', normalized(cleaned)):
            cleaned = cleaned.rstrip(' |:;')
            cleaned = re.sub(r'(?<=\d)\s+(?=[.,])', '', cleaned)
        # Le gros point des totaux est parfois reconnu comme un tiret.
        # On garde tous les chiffres et la ligne source ; aucun montant n'est déduit.
        if re.match(r'^(?:SOUS[ \-–—]*TOTAL|TOTAL)\b', normalized(cleaned)):
            cleaned = re.sub(r'(\d+)\s*[-–—]\s*(\d{2})\s*$', r'\1.\2', cleaned)
        prepared.append(cleaned)
        if cleaned != raw:
            originals[cleaned] = [raw]
    return prepared, originals


def product(raw: str, line_id: int, category_raw: str | None,
            following: str = '') -> ReceiptItem | None:
    if weight_line(following) and re.match(r'^[A-Za-zÀ-ÿ]', raw):
        return ReceiptItem(line_id=line_id, name=raw.strip(), category_raw=category_raw,
                           source_lines=[raw])
    return metro.product(raw, line_id, category_raw, following)


def adjustment(raw: str) -> ReceiptAdjustment | None:
    text = normalized(raw)
    # Le prix de l'article comprend déjà le Rabais positif imprimé dessous.
    if re.fullmatch(rf'RABAIS\s+{AMOUNT}', text):
        return metro.adjustment(raw)
    if re.match(r'^CONSIGNE\b', text):
        _, amount = trailing_amount(raw)
        return ReceiptAdjustment(amount=amount, effect='applied' if amount is not None else 'unknown',
                                 source_line=raw)
    if re.match(r'^PRIX\b', text):
        signed = re.fullmatch(rf'PRIX\s+[-−]\s*\$?\s*({AMOUNT})', text)
        return ReceiptAdjustment(amount=-decimal(signed[1]) if signed else None,
                                 effect='applied' if signed else 'unknown', source_line=raw)
    return None


def weight_line(raw: str) -> bool:
    """Poids brut et tare accompagnent le poids net, sans être des articles."""
    return bool(re.fullmatch(r'[-−]?\d+[.,]\d+\s*kg\s+(?:Brut|Tare)\s*=?', raw, re.I))


def detail(raw: str):
    # Le poids net est explicite ; aucun calcul brut moins tare n'est nécessaire.
    cleaned = re.sub(r'(\bkg)\s+Net\s*', r'\1 ', raw, flags=re.I)
    cleaned = re.sub(r'([@à])\s*I\s*(?=\$)', r'\1 ', cleaned)
    return generic.detail(cleaned)
