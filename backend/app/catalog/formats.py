"""Petits formats déterministes ; une plage ou un format ambigu reste inconnu."""
import re
from decimal import Decimal

from .schemas import ProductFormat


def validated_barcode(raw: object) -> str | None:
    """Vérifier la structure d'un GTIN fourni, sans l'inférer d'un nom ou d'une URL."""
    if not isinstance(raw, str):
        return None
    code = ''.join(raw.split())
    if len(code) not in (8, 12, 13, 14) or not code.isascii() or not code.isdigit():
        return None
    total = sum(int(digit) * (3 if index % 2 == 0 else 1)
                for index, digit in enumerate(reversed(code[:-1])))
    return code if (10 - total % 10) % 10 == int(code[-1]) else None


def parse_format(raw: str | None) -> ProductFormat:
    text = (raw or '').strip().casefold()
    if text in ('vendu au poids', 'poids variable', 'au kg', '/kg', 'per kg'):
        return ProductFormat(raw=raw, kind='variable_weight')
    match = re.fullmatch(r'(?:(\d+)\s*[x×]\s*)?(\d+(?:[.,]\d+)?)\s*'
                         r'(kg|g|ml|l|lb|unites?|unités?|units?|un|ea)', text)
    if not match:
        return ProductFormat(raw=raw, kind='unknown', warnings=['format_unparsed'])
    count = int(match[1] or 1)
    value = Decimal(match[2].replace(',', '.'))
    if count <= 0 or value <= 0:
        return ProductFormat(raw=raw, kind='unknown', warnings=['invalid_format_quantity'])
    unit = match[3]
    if unit in ('g', 'kg', 'lb'):
        factor, normalized_unit = {'g': '1', 'kg': '1000', 'lb': '453.59237'}[unit], 'g'
    elif unit in ('ml', 'l'):
        factor, normalized_unit = ('1000' if unit == 'l' else '1'), 'ml'
    else:
        factor, normalized_unit = '1', 'unit'
    return ProductFormat(raw=raw, kind='fixed', quantity=value * count * Decimal(factor),
                         unit=normalized_unit, package_count=count)
