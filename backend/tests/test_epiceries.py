import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from backend.app.main import create_app
from backend.app.price_sources.epiceries_ca import EpiceriesClient, Snapshot
from backend.app.price_sources.normalize import normalize
from backend.app.price_sources.schemas import Categories

FIXTURES = Path(__file__).parent / 'fixtures'


def fixture(name):
    return json.loads((FIXTURES / f'{name}.json').read_text())


def client(handler, enabled=True):
    return TestClient(create_app(enabled, httpx.MockTransport(handler), interval=0))


def test_health_and_disabled_source_never_contact_provider():
    def unexpected(request):
        pytest.fail('Appel fournisseur inattendu')
    with client(unexpected, False) as api:
        assert api.get('/health').json() == {'status': 'ok'}
        assert api.get('/sources/epiceries/categories').status_code == 503


@pytest.mark.parametrize('path', [
    '/search', '/search?q=a', '/search?q=%20%20', '/search?store=invalid',
    '/search?q=lait&limit=101', '/search?q=lait&offset=-1',
    '/search?category=0', '/search?q=lait&sort=bad', '/products/bad_id',
])
def test_input_validation(path):
    def unexpected(request):
        pytest.fail('Entrée invalide envoyée au fournisseur')
    with client(unexpected) as api:
        assert api.get('/sources/epiceries' + path).status_code == 422


def test_search_preserves_pagination_and_filters():
    def handler(request):
        assert request.url.params['endpoint'] == 'search'
        assert request.url.params['store'] == 'maxi'
        assert request.url.params['discounted'] == 'false'
        assert request.url.params['offset'] == '0'
        return httpx.Response(200, json=fixture('rice-maxi'))
    with client(handler) as api:
        response = api.get('/sources/epiceries/search?category=26&store=maxi&discounted=false')
        assert response.status_code == 200
        assert response.json()['data'] == fixture('rice-maxi')['data']
        assert response.json()['filter']['food_only'] is False


def test_search_excludes_non_food_categories_and_ranks_direct_names():
    body = {
        'ok': True,
        'data': {
            'count': 4, 'limit': 20, 'offset': 0, 'hasMore': False,
            'results': [
                {'id': 'shampoo', 'name': 'Shampooing au miel', 'price': 5, 'store': 'maxi', 'category': 70},
                {'id': 'cereal', 'name': 'Céréales au miel', 'price': 4, 'store': 'maxi', 'category': 28},
                {'id': 'honey', 'name': 'Miel pur', 'price': 6, 'store': 'maxi', 'category': 32},
                {'id': 'cleaner', 'name': 'Nettoyant au miel', 'price': 3, 'store': 'maxi', 'category': 65},
            ],
        },
    }
    with client(lambda _: httpx.Response(200, json=body)) as api:
        result = api.get('/sources/epiceries/search?q=miel').json()
    assert [item['id'] for item in result['data']['results']] == ['honey', 'cereal']
    assert result['data']['count'] == 2
    assert result['filter'] == {
        'food_only': True,
        'excluded_category_ids': [65, 66, 67, 68, 69, 70],
        'provider_count': 4,
        'excluded_count': 2,
        'ranking': 'query_name_relevance',
    }


def test_search_can_include_non_food_results_on_request():
    body = {
        'ok': True,
        'data': {
            'count': 2, 'limit': 20, 'offset': 0, 'hasMore': False,
            'results': [
                {'id': 'honey', 'name': 'Miel pur', 'price': 6, 'store': 'maxi', 'category': 32},
                {'id': 'shampoo', 'name': 'Shampooing au miel', 'price': 5, 'store': 'maxi', 'category': 70},
            ],
        },
    }
    with client(lambda _: httpx.Response(200, json=body)) as api:
        result = api.get('/sources/epiceries/search?q=miel&food_only=false').json()
    assert {item['id'] for item in result['data']['results']} == {'honey', 'shampoo'}
    assert result['filter']['excluded_count'] == 0


def test_product_normalization_keeps_raw_and_dates():
    body = fixture('storeproduct-example')
    with client(lambda _: httpx.Response(200, json=body)) as api:
        result = api.get('/sources/epiceries/products/' + body['data']['id']).json()
    assert result['raw'] == body['data']
    offer = result['offers'][0]
    assert offer['price']['amount'] == '8.16'
    assert offer['format'] == {'raw': '4l', 'quantity': '4', 'unit': 'l'}
    assert offer['valid_to'] is None and offer['store_id'] is None
    assert offer['observed_at'] != offer['source']['product_updated_at']
    assert offer['retrieved_at'] == result['source']['retrieved_at']
    assert offer['quality']['status'] == 'review_required'


def normalized(body):
    now = datetime(2026, 9, 14, tzinfo=timezone.utc)
    return normalize(Snapshot(body['data'], now, 'https://epiceries.ca/api'), 7, now)[0]


def test_recorded_summary_conflict_and_staleness():
    offer = normalized(fixture('detail-carrots-superc'))
    assert offer['price']['amount'] == '3.99'
    assert offer['price']['discounted'] is False
    assert {'summary_detail_conflict', 'stale_observation'} <= set(offer['quality']['warnings'])


@pytest.mark.parametrize(('change', 'warning'), [
    ({'size': None}, 'format_unparsed'),
    ({'size': '453g'}, 'incompatible_units'),
    ({'timestamp': 0}, 'timestamp_conflict'),
    ({'date': '2030-01-01T00:00:00Z'}, 'future_observation'),
    ({'unitPrice': {'value': 9, 'unit': '100ml', 'raw': '0.20/100ml'}}, 'unit_price_raw_conflict'),
    ({'unitPrice': {'value': 9, 'unit': '100ml', 'raw': '9/100ml'}}, 'unit_price_conflict'),
])
def test_quality_controls(change, warning):
    body = fixture('storeproduct-example')
    body['data']['prices'][0].update(change)
    assert warning in normalized(body)['quality']['warnings']


@pytest.mark.parametrize(('status', 'body', 'expected'), [
    (404, {}, 404), (429, {}, 503), (500, {}, 502),
    (200, {'ok': False}, 502), (200, {'ok': True, 'data': {}}, 502),
    (200, [], 502),
])
def test_provider_errors(status, body, expected):
    with client(lambda _: httpx.Response(status, json=body)) as api:
        assert api.get('/sources/epiceries/categories').status_code == expected


def test_invalid_json():
    with client(lambda _: httpx.Response(200, text='<html>error</html>')) as api:
        assert api.get('/sources/epiceries/categories').status_code == 502


def test_timeout():
    def timeout(request):
        raise httpx.ReadTimeout('timeout', request=request)
    with client(timeout) as api:
        assert api.get('/sources/epiceries/categories').status_code == 504


def test_negative_price_rejected():
    body = fixture('storeproduct-example')
    body['data']['prices'][0]['price'] = -1
    with client(lambda _: httpx.Response(200, json=body)) as api:
        assert api.get('/sources/epiceries/products/' + body['data']['id']).status_code == 502


def test_wrong_product_rejected():
    with client(lambda _: httpx.Response(200, json=fixture('storeproduct-example'))) as api:
        assert api.get('/sources/epiceries/products/wrong').status_code == 502


def test_cache_coalesces_concurrent_requests_and_expires(monkeypatch):
    calls = []
    clock = [1000.0]
    monkeypatch.setattr('backend.app.price_sources.epiceries_ca.monotonic', lambda: clock[0])
    def handler(request):
        calls.append(request)
        return httpx.Response(200, json=fixture('categories'))
    async def scenario():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
            source = EpiceriesClient(http, True, interval=0)
            first, second = await asyncio.gather(*[
                source.get('categories', {}, Categories) for _ in range(2)])
            assert len(calls) == 1
            assert first[1] is False and second[1] is True
            assert first[0].retrieved_at == second[0].retrieved_at
            clock[0] += 301
            assert (await source.get('categories', {}, Categories))[1] is False
            assert len(calls) == 2
    asyncio.run(scenario())


def test_rate_limit_between_uncached_requests(monkeypatch):
    clock = [1000.0]
    starts = []
    monkeypatch.setattr('backend.app.price_sources.epiceries_ca.monotonic', lambda: clock[0])
    async def sleep(delay):
        clock[0] += delay
    monkeypatch.setattr('backend.app.price_sources.epiceries_ca.asyncio.sleep', sleep)
    def handler(request):
        starts.append(clock[0])
        return httpx.Response(200, json=fixture('categories'))
    async def scenario():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
            source = EpiceriesClient(http, True, interval=1, ttl=0)
            for _ in range(3):
                await source.get('categories', {}, Categories)
    asyncio.run(scenario())
    assert starts == [1000, 1001, 1002]


def test_cache_bounded_and_errors_not_cached():
    calls = []
    def handler(request):
        calls.append(request)
        return httpx.Response(500) if len(calls) == 1 else httpx.Response(200, json=fixture('categories'))
    async def scenario():
        from fastapi import HTTPException
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
            source = EpiceriesClient(http, True, interval=0)
            with pytest.raises(HTTPException):
                await source.get('categories', {}, Categories)
            assert not source.cache
            await source.get('categories', {}, Categories)
            for offset in range(129):
                await source.get('categories', {'offset': offset}, Categories)
            assert len(source.cache) == 128
    asyncio.run(scenario())
