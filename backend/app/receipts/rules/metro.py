"""Format Metro sans codes ; les économies positives ne sont pas soustraites."""
import re

from ..schemas import ReceiptAdjustment, ReceiptItem
from . import generic
from .common import AMOUNT, decimal, normalized, trailing_amount

def category(raw: str) -> bool:
    # L'OCR peut ajouter des espaces ou omettre les points de « POISS.FRAIS. ».
    # Correspondance complète pour ne pas absorber un article ou une ligne inconnue.
    return generic.category(raw) or bool(re.fullmatch(r'POISS\.?\s*FRAIS\.?', normalized(raw)))


def product(raw: str, line_id: int, category_raw: str | None, following: str = '') -> ReceiptItem | None:
    item = generic.product(raw, line_id, category_raw, following)
    if item:
        item.name = re.sub(r'\s+FP$', '', item.name).strip()
    return item


def adjustment(raw: str) -> ReceiptAdjustment | None:
    text = normalized(raw)
    if not text.startswith('RABAIS'):
        return None
    # Seul le rabais membre explicitement signé est traité comme déduction.
    signed = re.fullmatch(rf'RABAIS MEMBRE\s+[-−]\s*({AMOUNT})', text)
    if signed:
        return ReceiptAdjustment(amount=-decimal(signed[1]), effect='applied', source_line=raw)
    _, amount = trailing_amount(raw)
    if re.fullmatch(rf'RABAIS\s+{AMOUNT}', text) and amount is not None:
        return ReceiptAdjustment(amount=amount, effect='informational', source_line=raw)
    return ReceiptAdjustment(amount=None, effect='unknown', source_line=raw)
