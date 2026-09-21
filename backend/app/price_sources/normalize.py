"""Conserver les observations commerciales sans inventer leur validité."""
import re
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from backend.app.price_sources.epiceries_ca import Snapshot
from backend.app.price_sources.schemas import Product


def parse_size(raw: str | None) -> tuple[Decimal, str] | None:
    match = re.fullmatch(r'\s*(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l|lb)\s*', raw or '', re.I)
    if not match or Decimal(match[1].replace(',', '.')) <= 0:
        return None
    return Decimal(match[1].replace(',', '.')), match[2].lower()


def normalize(snapshot: Snapshot, stale_days: int, now: datetime | None = None) -> list[dict]:
    product = Product.model_validate(snapshot.data)
    now = now or datetime.now(timezone.utc)
    offers = []
    for price in product.prices:
        warnings = ['validity_unknown', 'branch_unknown', 'not_verified']
        size = parse_size(price.size)
        if size is None:
            warnings.append('format_unparsed')
        if now - price.date > timedelta(days=stale_days):
            warnings.append('stale_observation')
        if price.date > now:
            warnings.append('future_observation')
        if abs(price.date.timestamp() - price.timestamp) > 1:
            warnings.append('timestamp_conflict')
        if price.store == product.store and (price.price != product.price or
                price.discounted != product.discounted or price.size != product.size):
            warnings.append('summary_detail_conflict')
        unit = price.unitPrice
        if unit:
            raw_value = re.match(r'\s*(\d+(?:[.,]\d+)?)\s*/', unit.raw)
            if raw_value and unit.value is not None and Decimal(raw_value[1].replace(',', '.')) != unit.value:
                warnings.append('unit_price_raw_conflict')
            basis = unit.unit.lower().replace(' ', '')
            if size and basis in ('100g', '100ml'):
                quantity, measure = size
                mass = measure in ('g', 'kg', 'lb')
                if mass != (basis == '100g'):
                    warnings.append('incompatible_units')
                elif unit.value is not None:
                    factors = {'g': '1', 'kg': '1000', 'lb': '453.59237', 'ml': '1', 'l': '1000'}
                    expected = price.price * 100 / (quantity * Decimal(factors[measure]))
                    if abs(expected - unit.value) > Decimal('0.0051'):
                        warnings.append('unit_price_conflict')
        offers.append({
            'product_id': f'epiceries:{product.id}', 'store': price.store, 'store_id': None,
            'name': product.name, 'brand': product.brand,
            'category': {'source': 'epiceries_api', 'id': product.category},
            'format': {'raw': price.size, 'quantity': str(size[0]) if size else None,
                       'unit': size[1] if size else None},
            'price': {'amount': str(price.price), 'currency': 'CAD', 'kind': 'commercial',
                      'basis': 'unknown', 'discounted': price.discounted,
                      'unit_price_reported': unit.model_dump(mode='json') if unit else None,
                      'loyalty_required': None, 'taxes_included': None, 'deposit': None},
            'observed_at': price.date, 'retrieved_at': snapshot.retrieved_at,
            'valid_from': None, 'valid_to': None,
            'source': {'type': 'epiceries_api', 'product_id': product.id,
                       'url': product.url, 'retailer_url': price.link,
                       'product_updated_at': product.updated},
            'quality': {'status': 'review_required', 'warnings': warnings},
        })
    return offers
