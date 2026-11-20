"""Prix après limite : validation, bornes, persistance et lecture HTTP."""
from datetime import date
from decimal import Decimal
import json
from pathlib import Path

from alembic import command
from fastapi.testclient import TestClient
from pydantic import ValidationError
import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.catalog.common_schemas import SourceProduct
from backend.app.catalog.common_catalog import build_common_catalog
from backend.app.catalog.ingredient_import import read_ingredients, upsert_ingredients
from backend.app.catalog.models import ProductOffer
from backend.app.catalog.offer_import import read_offers, upsert_offers
from backend.app.catalog.pricing import purchase_total
from backend.app.common.public_data import DEFAULT_CATALOG, offer
from backend.app.main import create_app
from backend.app.config import Settings
from backend.tests.test_ingredient_import import postgres, alembic_config  # noqa: F401
from backend.tests.test_common_catalog import sources  # noqa: F401


def oil():
    # Offre fixe : les mises à jour hebdomadaires du catalogue ne doivent pas
    # modifier les conditions dont ces tests vérifient le calcul et la validation.
    return SourceProduct.model_validate({
        'id': 'maxi:8661:20105368_EA', 'retailer': 'maxi', 'store_id': '8661',
        'external_product_id': '20105368_EA', 'name': 'Extra Virgin Olive Oil',
        'price': None, 'promo_price': '7.77', 'quantity_limit': 4,
        'price_after_limit': '10.0', 'currency': 'CAD', 'unit': 'ml',
        'quantity': '1000', 'valid_from': '2026-11-12', 'valid_to': '2026-11-18',
        'retrieved_at': '2026-11-14', 'is_promotion': True, 'source': 'apify',
        'url': 'https://www.maxi.ca/en/extra-virgin-olive-oil/p/20105368_EA',
    })


@pytest.fixture
def limited_catalog(tmp_path):
    catalog = json.loads(DEFAULT_CATALOG.read_text())
    for ingredient in catalog['ingredients']:
        for index, product in enumerate(ingredient['products']):
            if product['id'] == oil().id:
                ingredient['products'][index] = oil().model_dump(mode='json')
    path = tmp_path / 'limited-catalog.json'
    path.write_text(json.dumps(catalog))
    return path


@pytest.mark.parametrize('units,total', [(1, '7.77'), (4, '31.08'), (5, '41.08'), (10, '91.08')])
@pytest.mark.parametrize('day', [date(2026, 11, 12), date(2026, 11, 18)])
def test_first_units_and_excess_use_separate_prices(units, total, day):
    assert purchase_total(oil(), units, day) == Decimal(total)


@pytest.mark.parametrize('day', [date(2026, 11, 11), date(2026, 11, 19)])
def test_after_limit_is_not_a_regular_price_outside_promotion(day):
    assert purchase_total(oil(), 5, day) is None
    product = SourceProduct.model_validate({**oil().model_dump(), 'price': '12.00'})
    assert purchase_total(product, 5, day) == Decimal('60.00')


@pytest.mark.parametrize('patch', [
    {'quantity_limit': 0}, {'quantity_limit': -1}, {'quantity_limit': True},
    {'quantity_limit': '4'}, {'quantity_limit': 1.5},
    {'price_after_limit': None}, {'quantity_limit': None},
    {'price_after_limit': '7.00'}, {'price_after_limit': 'NaN'},
    {'promo_price': None}, {'is_promotion': False}, {'is_promotion': None},
])
def test_incomplete_or_inconsistent_conditions_are_rejected(patch):
    with pytest.raises(ValidationError):
        SourceProduct.model_validate({**oil().model_dump(), **patch})


@pytest.mark.parametrize('units', [0, -1, True, 1.5])
def test_units_are_positive_whole_sale_units(units):
    with pytest.raises(ValueError):
        purchase_total(oil(), units, date(2026, 11, 14))


def test_legacy_products_keep_defaults_and_public_identity():
    product = SourceProduct.model_validate({**oil().model_dump(), 'quantity_limit': None, 'price_after_limit': None})
    before = product.model_dump_json(exclude={'image_url', 'image_source', 'quantity_limit', 'price_after_limit'})
    import hashlib
    expected = hashlib.sha256(('ing_huile_olive\n' + before).encode()).hexdigest()[:24]
    assert offer('ing_huile_olive', product, date(2026, 11, 14)).id == 'offer_' + expected


def test_source_fields_survive_assembly_and_missing_pair_is_rejected(sources):
    mapping = json.loads((sources / 'data/catalog/baseCommune/ingredient_mapping.json').read_text())
    path = sources / mapping['sources']['maxi']
    data = json.loads(path.read_text())
    product = next(p for i in data for p in i['Produits'] if p['Id'] == '20105368_EA')
    # Modifier uniquement la copie temporaire des sources pour tester une offre limitée.
    product.update(Prix=None, PrixPromo=7.77, LimiteQuantite=4, PrixApresLimite=10.0,
                   IsPromotion=True, DateDebut='2026-11-12', DateFin='2026-11-18')
    path.write_text(json.dumps(data))
    catalog = build_common_catalog(sources, Path('data/catalog/baseCommune/ingredient_mapping.json'))
    actual = next(p for i in catalog['ingredients'] for p in i['products'] if p['id'] == 'maxi:8661:20105368_EA')
    assert actual['quantity_limit'] == 4 and Decimal(actual['price_after_limit']) == Decimal('10')
    del product['PrixApresLimite']
    path.write_text(json.dumps(data))
    with pytest.raises(ValueError):
        build_common_catalog(sources, Path('data/catalog/baseCommune/ingredient_mapping.json'))


def test_postgres_import_api_parity_constraints_and_downgrade(postgres, limited_catalog):
    upsert_ingredients(postgres, read_ingredients(limited_catalog))
    categories, rows = read_offers(limited_catalog)
    first = upsert_offers(postgres, categories, rows)
    assert first.processed == 93
    assert upsert_offers(postgres, categories, rows).changed == 0
    row = next(r for r in rows if r['id'] == 'maxi:8661:20105368_EA')
    stored = postgres.execute(select(ProductOffer.__table__).where(ProductOffer.id == row['id'])).mappings().one()
    assert stored['quantity_limit'] == 4 and stored['price_after_limit'] == Decimal('10')
    assert stored['price'] is None
    app = create_app(settings=Settings(offers_source='database'))
    with TestClient(app) as client:
        app.state.database.session_factory = lambda: Session(bind=postgres, join_transaction_mode='create_savepoint')
        for day, active in [('2026-11-11', False), ('2026-11-12', True), ('2026-11-18', True), ('2026-11-19', False)]:
            response = client.get('/api/v1/offers?retailer=maxi&on_date=' + day + '&limit=100')
            assert response.status_code == 200
            actual = next(o for o in response.json()['items'] if o['external_product_id'] == '20105368_EA')
            expected = offer('ing_huile_olive', oil(), date.fromisoformat(day), row['category_id'])
            assert actual == expected.model_dump(mode='json')
            assert actual['quantity_limit'] == 4 and actual['price_after_limit'] == '10.0'
            filtered = client.get('/api/v1/offers?retailer=maxi&promotion_only=true&on_date=' + day + '&limit=100').json()
            assert any(o['external_product_id'] == '20105368_EA' for o in filtered['items']) is active
    for patch in [dict(quantity_limit=0), dict(price_after_limit=None), dict(price_after_limit=Decimal('7')),
                  dict(promo_price=None), dict(is_promotion=None), dict(quantity_limit=None)]:
        with pytest.raises(IntegrityError), postgres.begin_nested():
            postgres.execute(ProductOffer.__table__.update().where(ProductOffer.id == row['id']).values(**patch))
    command.check(alembic_config(postgres))
    command.downgrade(alembic_config(postgres), '0015_permanent_public_recipes')
    command.upgrade(alembic_config(postgres), 'head')
    assert postgres.scalar(select(ProductOffer.quantity_limit).where(ProductOffer.id == row['id'])) is None
    assert upsert_offers(postgres, categories, rows).changed == 1
