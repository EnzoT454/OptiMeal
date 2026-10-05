"""Format Maxi avec rayons numérotés et codes produits."""
import re
from decimal import Decimal

from ..schemas import ReceiptItem
from .common import normalized, trailing_amount

PRODUCT = re.compile(r'^\s*(?:\((?P<count>\d+)\)\s*)?(?P<code>\d{4,14})\s+(?P<name>\S.*)$')


def category(raw: str) -> bool:
    return bool(re.match(r'^\d{1,2}\s*[-–]\s*[A-Z]', normalized(raw)))


def product(raw: str, line_id: int, category_raw: str | None, following: str = '') -> ReceiptItem | None:
    match = PRODUCT.match(raw)
    if not match:
        return None
    name, amount = trailing_amount(match['name'])
    name = re.sub(r'\s+MRJ\s*$', '', name).strip()
    quantity = Decimal(match['count']) if match['count'] else None
    if not name or (quantity is not None and quantity <= 0):
        return None
    return ReceiptItem(line_id=line_id, product_code=match['code'], name=name,
                       category_raw=category_raw, line_total=amount, source_lines=[raw],
                       quantity=quantity, unit='unit' if quantity else None,
                       quantity_source='explicit' if quantity else 'unknown')
