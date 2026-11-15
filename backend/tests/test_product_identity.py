"""L'identité commerciale survit au renouvellement d'un relevé d'offre."""
from datetime import date
from urllib.parse import quote

import pytest

from backend.app.catalog.common_schemas import SourceProduct
from backend.app.common.public_data import offer


def product(**changes):
    values = dict(retailer='maxi', store_id='42', external_product_id='123', name='Huile',
                  price='10.00', currency='CAD', unit='ml', quantity='1000',
                  valid_from=None, valid_to=None, retrieved_at=date(2026, 11, 12),
                  is_promotion=False, source='maxi', url='https://example.test/product/123')
    values.update(changes)
    values['id'] = ':'.join(quote(v, safe='') for v in
                            (values['retailer'], values['store_id'] or '', values['external_product_id']))
    return SourceProduct(**values)


@pytest.mark.parametrize('changes', [
    {'retrieved_at': date(2026, 11, 15)}, {'price': '12.00'},
    {'is_promotion': True, 'promo_price': '7.77', 'valid_from': date(2026, 11, 12),
     'valid_to': date(2026, 11, 18), 'quantity_limit': 4, 'price_after_limit': '10'},
    {'name': 'Nouveau libellé', 'quantity': '750'},
])
def test_price_observation_changes_but_product_identity_does_not(changes):
    before = offer('ing_huile', product(), date(2026, 11, 14))
    after = offer('ing_huile', product(**changes), date(2026, 11, 14))
    assert before.id != after.id
    assert before.product_id == after.product_id == 'maxi:42:123'


@pytest.mark.parametrize('changes', [
    {'retailer': 'metro'}, {'store_id': '43'}, {'external_product_id': '456'},
])
def test_commercial_identity_distinguishes_retailer_store_and_reference(changes):
    assert product().id != product(**changes).id
