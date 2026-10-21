"""Contrats de lecture communs et limites des données, sans services externes."""
import json
from datetime import date, datetime, timezone

from fastapi.testclient import TestClient
from pydantic import ValidationError
import pytest

from backend.app.catalog.common_schemas import CommonCatalog, SourceProduct
from backend.app.common.contracts import Price
from backend.app.common.public_data import DEFAULT_CATALOG, DEFAULT_RECIPES, load_catalog, load_recipes, promotion
from backend.app.main import create_app
from backend.cli.export_shared_contracts import OUTPUT, artifacts


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv('DATABASE_URL', '')
    monkeypatch.delenv('CATALOG_IMPORT_PATH', raising=False)
    monkeypatch.delenv('COMMON_CATALOG_PATH', raising=False)
    monkeypatch.delenv('RECIPE_SEED_PATH', raising=False)
    with TestClient(create_app()) as value:
        yield value


def test_ingredient_references_and_pagination(client):
    ingredients = client.get('/api/v1/ingredients?limit=100').json()
    ids = {i['id'] for i in ingredients['items']}
    assert len(ids) == ingredients['total'] == 31
    first = client.get('/api/v1/ingredients?limit=2').json()
    second = client.get('/api/v1/ingredients?limit=2&offset=2').json()
    assert len(first['items']) == len(second['items']) == 2
    assert {i['id'] for i in first['items']}.isdisjoint(i['id'] for i in second['items'])


def test_offers_namespace_raw_format_and_exact_prices(client):
    result = client.get('/api/v1/offers?limit=100&on_date=2026-10-06').json()
    assert result['total'] == 93
    for offer in result['items']:
        assert offer['price']['currency'] == 'CAD'
        assert isinstance(offer['price']['amount'], str)
        assert offer['store_id'] == offer['retailer'] + ':' + offer['external_store_id']
        detail = client.get('/api/v1/offers/' + offer['id'] + '?on_date=2026-10-06').json()
        assert detail['item'] == offer
    assert len({o['id'] for o in result['items']}) == 93
    filtered = client.get('/api/v1/offers?retailer=metro&ingredient_id=ing_tomate_fraiche').json()
    assert filtered['total'] == 1
    assert filtered['items'][0]['ingredient_id'] == 'ing_tomate_fraiche'
    assert client.get('/api/v1/offers?store_id=superc:605&limit=100').json()['total'] == 31


@pytest.mark.parametrize('query', ['limit=0', 'limit=101', 'offset=-1', 'retailer=inconnu',
                                  'ingredient_id=4', 'on_date=2026-02-30'])
def test_invalid_parameters_have_shared_errors(client, query):
    response = client.get('/api/v1/offers?' + query)
    assert response.status_code == 422
    assert response.json()['error']['code'] == 'VALIDATION_ERROR'
    assert response.json()['error']['details']


@pytest.mark.parametrize('path,code', [
    ('offers/missing', 'OFFER_NOT_FOUND'),
    ('offers?ingredient_id=ing_inconnu', 'INGREDIENT_NOT_FOUND'),
])
def test_missing_resources(client, path, code):
    response = client.get('/api/v1/' + path)
    assert response.status_code == 404
    assert response.json() == {'error': {'code': code, 'message': response.json()['error']['message'], 'details': []}}


def test_missing_catalog_does_not_break_health_or_legacy_errors(monkeypatch, tmp_path):
    monkeypatch.setenv('DATABASE_URL', '')
    monkeypatch.delenv('CATALOG_IMPORT_PATH', raising=False)
    monkeypatch.setenv('COMMON_CATALOG_PATH', str(tmp_path / 'missing.json'))
    with TestClient(create_app()) as client:
        assert client.get('/health').json() == {'status': 'ok'}
        assert client.get('/api/v1/offers').status_code == 503
        assert client.get('/api/v1/offers').json()['error']['code'] == 'CATALOG_UNAVAILABLE'
        assert client.get('/api/v1/recipes').status_code == 503
        assert client.get('/catalog').status_code == 503
        assert 'detail' in client.get('/catalog').json()



@pytest.mark.parametrize('declared,start,end,day,expected', [
    (True, '2026-10-01', '2026-10-07', '2026-10-01', 'active'),
    (True, '2026-10-01', '2026-10-07', '2026-10-07', 'active'),
    (True, '2026-10-01', '2026-10-07', '2026-10-08', 'expired'),
    (True, '2026-10-01', '2026-10-07', '2026-09-30', 'upcoming'),
    (True, '2026-10-01', None, '2026-10-02', 'unverifiable'),
    (True, None, None, '2026-10-02', 'unverifiable'),
    (False, None, None, '2026-10-02', 'not_promotion'),
    (None, '2026-10-01', '2026-10-07', '2026-10-02', 'unknown'),
])
def test_promotion_dates_are_inclusive_and_never_invented(declared, start, end, day, expected):
    raw = json.loads(DEFAULT_CATALOG.read_text(encoding='utf-8'))['ingredients'][0]['products'][0]
    raw.update(is_promotion=declared, valid_from=start, valid_to=end)
    product = SourceProduct.model_validate(raw)
    assert promotion(product, date.fromisoformat(day)).status == expected


def test_promotion_filter_rejects_expired_and_unverifiable(client):
    today = client.get('/api/v1/offers?promotion_only=true&on_date=2099-01-01').json()
    assert today['total'] == 0
    historical = client.get('/api/v1/offers?promotion_only=true&on_date=2026-10-06&limit=100').json()
    assert historical['items']
    assert all(o['promotion']['declared'] is True and o['promotion']['status'] == 'active'
               for o in historical['items'])


def test_default_promotion_day_is_toronto_even_after_midnight_utc(monkeypatch):
    from backend.app.common import public_data

    class FixedDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return datetime(2026, 10, 7, 2, tzinfo=timezone.utc).astimezone(tz)

    monkeypatch.setattr(public_data, 'datetime', FixedDatetime)
    assert public_data.today() == date(2026, 10, 6)


@pytest.mark.parametrize('value', [0.1, 2, True, 'NaN', '-1', '1,50', '1e2'])
def test_price_rejects_inexact_or_invalid_json_amounts(value):
    with pytest.raises(ValidationError):
        Price(kind='commercial', amount=value)


def test_unknown_zero_and_estimated_prices_have_distinct_meanings():
    assert Price(kind='unknown').model_dump()['amount'] is None
    assert Price(kind='commercial', amount='0').amount == '0'
    assert Price(kind='estimated', min_amount='1.10', max_amount='2.20').amount is None
    with pytest.raises(ValidationError):
        Price(kind='estimated', min_amount='2', max_amount='1')
    with pytest.raises(ValidationError):
        Price(kind='unknown', amount='0')


@pytest.mark.parametrize('change', ['quantity', 'unit_count', 'duration', 'step_order', 'duplicate', 'reference'])
def test_invalid_seed_is_rejected(change, tmp_path):
    data = json.loads(DEFAULT_RECIPES.read_text(encoding='utf-8'))
    recipe = data['recipes'][0]
    if change == 'quantity':
        recipe['ingredients'][0]['quantity'] = '0'
    elif change == 'unit_count':
        recipe['ingredients'][0].update(quantity='0.5', unit='unit')
    elif change == 'duration':
        recipe['total_time_minutes'] = 1
    elif change == 'step_order':
        recipe['instructions'][0]['position'] = 2
    elif change == 'duplicate':
        data['recipes'].append(recipe)
    else:
        recipe['ingredients'][0]['ingredient_id'] = 'ing_inconnu'
    path = tmp_path / 'bad.json'
    path.write_text(json.dumps(data), encoding='utf-8')
    with pytest.raises(ValueError):
        load_recipes(path, load_catalog(DEFAULT_CATALOG))


def test_catalog_rejects_invalid_counts_and_dates():
    data = json.loads(DEFAULT_CATALOG.read_text(encoding='utf-8'))
    data['ingredient_count'] = 30
    with pytest.raises(ValidationError):
        CommonCatalog.model_validate(data)
    data['ingredient_count'] = 31
    data['ingredients'][0]['products'][0].update(valid_from='2026-10-07', valid_to='2026-10-01')
    with pytest.raises(ValidationError):
        CommonCatalog.model_validate(data)


def test_exports_are_current_and_schema_decimals_are_strings():
    for name, content in artifacts().items():
        assert json.loads((OUTPUT / name).read_text(encoding='utf-8')) == content
    price = Price.model_json_schema()['properties']['amount']
    assert {item['type'] for item in price['anyOf']} == {'string', 'null'}
