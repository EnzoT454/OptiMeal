"""Intégration Apify simulée, aucun appel payant ni secret réel."""
import asyncio
import copy
import json
from decimal import Decimal

import httpx
import pytest
from fastapi.testclient import TestClient

from backend.app.catalog.apify_ingestion import capture, normalize_archive
from backend.app.catalog.schemas import CatalogExport
from backend.app.main import create_app
from backend.app.price_sources.apify_loblaws import ACTOR, ApifyClient, ApifyError
from backend.cli.ingest_catalog import CONFIG, main, read_json


def archive():
    return {'schema_version': 'apify-capture-1.0', 'actor': ACTOR, 'dataset_kind': 'demo',
            'evaluated_at': '2026-09-28T15:00:00+00:00',
            'ingredients': read_json(CONFIG / 'ingredients.json')['ingredients'],
            'target_store': read_json(CONFIG / 'target_store.json'),
            'input': {'banner': 'maxi', 'locationId': 'demo123', 'search_terms': ['garlic'],
                      'group_variants': False, 'on_sale_only': False},
            'max_items': 100, 'max_charge_usd': 1, 'capture_complete': True,
            'run_id': 'run123', 'dataset_id': 'dataset123',
            'rows': [{'product_id': 'product123', 'name': 'Garlic', 'store': 'Maxi',
                      'price': '2.49', 'package_size': '125 g', 'location': 'demo123',
                      'selling_type': 'by_unit', 'is_on_sale': False}]}


def test_normalization_preserves_decimal_and_unverified_scope():
    result = normalize_archive(archive())
    offer = result.offers[0]
    assert offer.amount == Decimal('2.49')
    assert offer.source_name == 'apify_loblaws'
    assert offer.scope_kind == 'source_reported_store'
    assert offer.external_store_id == 'demo123'
    assert offer.store_id is None and not offer.eligible_for_optimizer
    assert result.coverage[0].candidate_count == 1
    assert CatalogExport.model_validate_json(result.model_dump_json()) == result


@pytest.mark.parametrize('field,value', [('location', 'other'), ('location', None), ('store', 'Provigo'),
                                         ('price', '-1'), ('price', None), ('price', 'NaN'), ('price', True)])
def test_bad_rows_are_reported_not_used(field, value):
    data = archive()
    data['rows'][0][field] = value
    result = normalize_archive(data)
    assert not result.offers and result.collection['errors']


def test_weight_and_postal_discovery_do_not_claim_fixed_package_or_target():
    data = archive()
    data['input'].pop('locationId')
    data['input']['postal_code'] = 'H0H 0H0'
    data['rows'][0]['selling_type'] = 'by_weight'
    result = normalize_archive(data)
    assert result.products[0].format.quantity is None
    assert result.products[0].format.kind == 'variable_weight'
    assert result.offers[0].store_id is None


def test_english_preparations_are_rejected():
    data = archive()
    data['rows'][0]['name'] = 'Garlic powder'
    result = normalize_archive(data)
    assert result.matches[0].status == 'rejected'
    assert result.coverage[0].candidate_count == 0


def test_client_lifecycle_pagination_and_replay(tmp_path):
    calls = []
    data = archive()
    data['max_items'] = 150
    def handler(request):
        calls.append(request)
        assert request.headers['Authorization'] == 'Bearer test-secret'
        assert 'token' not in request.url.params
        if request.method == 'POST':
            assert request.url.params['maxItems'] == '150'
            assert request.url.params['maxTotalChargeUsd'] == '1'
            assert json.loads(request.content)['banner'] == 'maxi'
            return httpx.Response(201, json={'data': {'id': 'run123', 'status': 'READY'}})
        if '/actor-runs/' in request.url.path:
            return httpx.Response(200, json={'data': {'id': 'run123', 'status': 'SUCCEEDED',
                                                    'defaultDatasetId': 'dataset123'}})
        offset = int(request.url.params['offset'])
        return httpx.Response(200, json=archive()['rows'] * (100 if offset == 0 else 1))
    async def scenario():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
            await capture(ApifyClient(http, 'test-secret'), data, tmp_path / 'raw.json')
    asyncio.run(scenario())
    saved = read_json(tmp_path / 'raw.json')
    assert len(saved['rows']) == 101
    assert normalize_archive(saved) == normalize_archive(data)
    assert 'test-secret' not in (tmp_path / 'raw.json').read_text()
    assert len([r for r in calls if r.method == 'POST']) == 1


@pytest.mark.parametrize('status', [401, 429, 500])
def test_errors_do_not_expose_secret_or_retry(status):
    calls = []
    def handler(request):
        calls.append(request)
        return httpx.Response(status, json={'message': 'test-secret'})
    async def scenario():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
            with pytest.raises(ApifyError) as exc:
                await ApifyClient(http, 'test-secret').start({}, 100, 1)
            assert 'test-secret' not in str(exc.value)
    asyncio.run(scenario())
    assert len(calls) == 1


def test_resume_does_not_start_new_run(tmp_path):
    data = archive()
    def handler(request):
        assert request.method == 'GET'
        if '/actor-runs/' in request.url.path:
            return httpx.Response(200, json={'data': {'id': 'run123', 'status': 'SUCCEEDED',
                                                    'defaultDatasetId': 'dataset123'}})
        return httpx.Response(200, json=archive()['rows'])
    async def scenario():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
            await capture(ApifyClient(http, 'test-secret'), data, tmp_path / 'raw.json', resume=True)
    asyncio.run(scenario())
    assert data['capture_complete']


def test_failed_run_retains_resume_metadata(tmp_path):
    data = archive()
    def handler(request):
        return httpx.Response(200, json={'data': {'id': 'run123', 'status': 'FAILED'}})
    async def scenario():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
            with pytest.raises(ApifyError):
                await capture(ApifyClient(http, 'test-secret'), data, tmp_path / 'raw.json', resume=True)
    asyncio.run(scenario())
    saved = read_json(tmp_path / 'raw.json')
    assert saved['run_id'] == 'run123' and not saved['capture_complete']


def test_cli_replay_and_fastapi_share_catalog(tmp_path, monkeypatch):
    raw = tmp_path / 'raw.json'
    raw.write_text(json.dumps(archive()))
    out = tmp_path / 'output'
    monkeypatch.delenv('APIFY_TOKEN', raising=False)
    monkeypatch.setattr('sys.argv', ['ingest_catalog', '--replay', str(raw), '--output-dir', str(out)])
    assert main() == 0
    monkeypatch.setenv('CATALOG_IMPORT_PATH', str(out / 'catalog.json'))
    with TestClient(create_app()) as client:
        assert client.get('/catalog').json()['offers'][0]['source_name'] == 'apify_loblaws'
        response = client.get('/catalog/offers', params={'ingredient_id': 'ing_ail_frais'})
        assert response.status_code == 200 and response.json()['total'] == 1
        assert client.get('/catalog/offers?ingredient_id=unknown').status_code == 404
        assert client.get('/catalog/offers?limit=0').status_code == 422


def test_no_import_is_explicit(monkeypatch):
    monkeypatch.delenv('CATALOG_IMPORT_PATH', raising=False)
    with TestClient(create_app()) as client:
        assert client.get('/catalog').status_code == 503
        assert client.get('/health').status_code == 200
        assert not any('/sources/epiceries' in path for path in client.get('/openapi.json').json()['paths'])


@pytest.mark.parametrize('failure', ['json', 'timeout'])
def test_invalid_json_and_timeout_are_controlled(failure):
    def handler(request):
        if failure == 'timeout':
            raise httpx.ReadTimeout('test-secret', request=request)
        return httpx.Response(200, text='not json test-secret')
    async def scenario():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
            with pytest.raises(ApifyError) as exc:
                await ApifyClient(http, 'test-secret').start({}, 100, 1)
            assert 'test-secret' not in str(exc.value)
    asyncio.run(scenario())


def test_cli_missing_token_stops_before_creating_output(tmp_path, monkeypatch):
    monkeypatch.delenv('APIFY_TOKEN', raising=False)
    out = tmp_path / 'output'
    monkeypatch.setattr('sys.argv', ['ingest_catalog', '--live',
                                    '--location-id', 'demo123', '--output-dir', str(out)])
    assert main() == 1
    assert not out.exists()


def test_conditions_are_kept_separate_from_amount():
    data = archive()
    data['rows'][0].update(unit_price='$1.99/100g', multi_buy_deal='2 for $4',
                           pc_optimum_offer='1000 points')
    offer = normalize_archive(data).offers[0]
    assert offer.amount == Decimal('2.49')
    assert offer.multi_buy_deal == '2 for $4'
    assert offer.loyalty_offer == '1000 points'
    assert offer.source_unit_price == '$1.99/100g'
    assert offer.loyalty_required is None


def test_batch_reserves_quota_and_budget_and_keeps_provenance(tmp_path):
    from backend.app.catalog.apify_batch import plan_batch, capture_batch, normalize_batch
    data = archive()
    queries = read_json(CONFIG / 'apify_queries.json')['queries']
    batch = plan_batch(data, queries)
    assert [j['max_items'] for j in batch['jobs']] == [10] * 10
    assert sum(Decimal(str(j['max_charge_usd'])) for j in batch['jobs']) == Decimal('1')
    calls = []
    class Client:
        async def start(self, actor_input, max_items, max_charge):
            calls.append(actor_input['search_terms'])
            assert len(actor_input['search_terms']) == 1 and max_items == 10
            return {'id': 'run' + str(len(calls))}
        async def wait(self, run_id):
            return {'status': 'SUCCEEDED', 'defaultDatasetId': run_id}
        async def items(self, dataset_id, max_items, on_page):
            on_page(archive()['rows'])
    asyncio.run(capture_batch(Client(), batch, tmp_path / 'raw.json'))
    assert len(calls) == 10
    result = normalize_batch(batch)
    assert len(result.collection['searches']) == 10
    assert all(o.capture_id.startswith('ing_') for o in result.offers)
    saved = read_json(tmp_path / 'raw.json')
    assert normalize_batch(saved) == result
    asyncio.run(capture_batch(Client(), saved, tmp_path / 'resumed.json'))
    assert len(calls) == 10  # Aucun run réussi n'est relancé.


def test_batch_ambiguous_post_cannot_be_repeated(tmp_path):
    from backend.app.catalog.apify_batch import plan_batch, capture_batch
    batch = plan_batch(archive(), read_json(CONFIG / 'apify_queries.json')['queries'])
    class Client:
        async def start(self, *args):
            raise ApifyError('network unavailable')
    with pytest.raises(ApifyError):
        asyncio.run(capture_batch(Client(), batch, tmp_path / 'raw.json'))
    saved = read_json(tmp_path / 'raw.json')
    assert saved['jobs'][0]['start_requested']
    with pytest.raises(ValueError, match='incertain'):
        asyncio.run(capture_batch(Client(), saved, tmp_path / 'resumed.json'))


@pytest.mark.parametrize('ingredient,name', [
    ('ing_ail_frais', 'Soft Grip Garlic Press'),
    ('ing_ail_frais', 'Garlic Bread'),
    ('ing_ail_frais', 'Herb & Garlic Cream Cheese Product'),
    ('ing_huile_olive', 'Organic Couscous, Roasted Garlic & Olive Oil'),
    ('ing_huile_olive', 'Roasted Garlic Olive Oil'),
])
def test_accessories_and_preparations_do_not_count_as_ingredients(ingredient, name):
    from backend.app.catalog.matching import match_name
    from backend.app.catalog.schemas import Ingredient
    rules = {i['id']: Ingredient.model_validate(i) for i in read_json(CONFIG / 'ingredients.json')['ingredients']}
    assert match_name(rules[ingredient], name)[0] == 'rejected'


def test_refresh_rules_is_explicit_and_preserves_archived_rules(tmp_path, monkeypatch):
    data = archive()
    data['ingredients'][0]['excluded_terms'] = []
    data['rows'][0]['name'] = 'Garlic Press'
    raw = tmp_path / 'raw.json'
    raw.write_text(json.dumps(data))
    out = tmp_path / 'new'
    monkeypatch.setattr('sys.argv', ['ingest_catalog', '--replay', str(raw), '--refresh-rules', '--output-dir', str(out)])
    assert main() == 0
    saved = read_json(out / 'raw.json')
    assert saved['previous_ingredient_rules'][0][0]['excluded_terms'] == []
    assert read_json(out / 'catalog.json')['coverage'][0]['candidate_count'] == 0
    assert read_json(raw) == data


def test_second_batch_cli_builds_correct_plan(tmp_path, monkeypatch):
    from backend.app.catalog import apify_command
    seen = []
    async def capture_stub(client, batch, path):
        seen.append(batch)
        for job in batch['jobs']:
            job['capture_complete'] = True
        path.write_text(json.dumps(batch))
    monkeypatch.setattr(apify_command, 'capture_batch', capture_stub)
    monkeypatch.setenv('APIFY_TOKEN', 'test-only')
    out = tmp_path / 'batch2'
    monkeypatch.setattr('sys.argv', ['ingest_catalog', '--source', 'apify', '--live',
                                    '--batch', '2', '--max-items', '100', '--output-dir', str(out)])
    assert main() == 2  # Capture simulée sans produits, jamais présentée comme réussie.
    jobs = seen[0]['jobs']
    assert len(jobs) == 10
    assert [j['input']['search_terms'][0] for j in jobs] == [
        'tomatoes', 'potatoes', 'bell peppers', 'broccoli', 'zucchini',
        'apples', 'lemons', 'ground beef', 'salmon', 'canned tuna']
    assert all(j['max_items'] == 10 for j in jobs)
    assert all(j['input']['locationId'] == '8661' for j in jobs)
    assert sum(Decimal(str(j['max_charge_usd'])) for j in jobs) == Decimal('1')


def test_third_batch_cli_has_eleven_distinct_remaining_ingredients(tmp_path, monkeypatch):
    from backend.app.catalog import apify_command
    seen = []
    async def capture_stub(client, batch, path):
        seen.append(batch)
        for job in batch['jobs']:
            job['capture_complete'] = True
        path.write_text(json.dumps(batch))
    monkeypatch.setattr(apify_command, 'capture_batch', capture_stub)
    monkeypatch.setenv('APIFY_TOKEN', 'test-only')
    out = tmp_path / 'batch3'
    monkeypatch.setattr('sys.argv', ['ingest_catalog', '--source', 'apify', '--live',
                                    '--batch', '3', '--max-items', '110', '--output-dir', str(out)])
    assert main() == 2
    batch = seen[0]
    assert len(batch['jobs']) == 11
    assert all(j['max_items'] == 10 for j in batch['jobs'])
    assert all(j['input']['locationId'] == '8661' for j in batch['jobs'])
    assert sum(Decimal(str(j['max_charge_usd'])) for j in batch['jobs']) <= Decimal('1')
    assert [j['input']['search_terms'][0] for j in batch['jobs']] == [
        'shrimp', 'cheddar cheese', 'plain yogurt', 'butter', 'dry pasta',
        'canned kidney beans', 'canned tomatoes', 'all purpose flour',
        'granulated sugar', 'table salt', 'sliced bread']
    old_ids = {i['id'] for folder in (CONFIG, CONFIG / 'batch2')
               for i in read_json(folder / 'ingredients.json')['ingredients']}
    new_ids = {j['ingredient_id'] for j in batch['jobs']}
    assert not old_ids & new_ids
    assert len(old_ids | new_ids) == 31
    monkeypatch.delenv('APIFY_TOKEN', raising=False)
    replay = tmp_path / 'replay'
    monkeypatch.setattr('sys.argv', ['ingest_catalog', '--replay', str(out / 'raw.json'),
                                    '--output-dir', str(replay)])
    assert main() == 2
    assert read_json(out / 'catalog.json') == read_json(replay / 'catalog.json')


def test_promos_cli_preserves_31_ingredients_and_global_limits(tmp_path, monkeypatch):
    from backend.app.catalog import apify_command
    seen = []
    async def stub(client, batch, path):
        seen.append(batch)
        for job in batch['jobs']:
            job['capture_complete'] = True
        path.write_text(json.dumps(batch))
    monkeypatch.setattr(apify_command, 'capture_batch', stub)
    monkeypatch.setenv('APIFY_TOKEN', 'test-only')
    out = tmp_path / 'promos'
    monkeypatch.setattr('sys.argv', ['ingest_catalog', '--source', 'apify', '--live', '--promos',
                                    '--max-items', '200', '--output-dir', str(out)])
    assert main() == 2
    jobs = seen[0]['jobs']
    assert len(jobs) == 31
    assert sum(j['max_items'] for j in jobs) == 200
    assert {j['max_items'] for j in jobs} == {6, 7}
    assert sum(Decimal(str(j['max_charge_usd'])) for j in jobs) <= Decimal('1')
    assert all(j['input']['on_sale_only'] is True for j in jobs)
    assert all(j['input']['locationId'] == '8661' for j in jobs)
    expected = [i for folder in (CONFIG, CONFIG / 'batch2', CONFIG / 'batch3')
                for i in read_json(folder / 'ingredients.json')['ingredients']]
    assert jobs[0]['ingredients'] == expected
    monkeypatch.delenv('APIFY_TOKEN', raising=False)
    replay = tmp_path / 'replay'
    monkeypatch.setattr('sys.argv', ['ingest_catalog', '--replay', str(out / 'raw.json'),
                                    '--output-dir', str(replay)])
    assert main() == 2
    assert read_json(replay / 'catalog.json') == read_json(out / 'catalog.json')


@pytest.mark.parametrize('flag', [None, False, True])
def test_promo_import_requires_explicit_sale_flag(flag):
    data = archive()
    data['input']['on_sale_only'] = True
    data['rows'][0]['is_on_sale'] = flag
    result = normalize_archive(data)
    assert len(result.offers) == (1 if flag is True else 0)
    assert bool(result.collection['errors']) == (flag is not True)


def test_food_promos_uses_categories_without_ingredient_search(tmp_path, monkeypatch):
    from backend.app.catalog import apify_command
    seen = []
    async def stub(client, batch, path):
        seen.append(batch)
        for job in batch['jobs']:
            job['capture_complete'] = True
        # Aliment sans correspondance avec les 31 ingrédients : doit être conservé.
        batch['jobs'][0]['rows'] = [{'name': 'Fresh Mango', 'product_id': 'mango1',
            'store': 'Maxi', 'location': '8661', 'price': '1.99', 'was_price': '2.99',
            'is_on_sale': True, 'category': 'fresh-fruits', 'package_size': '1ea'}]
        path.write_text(json.dumps(batch))
    monkeypatch.setattr(apify_command, 'capture_batch', stub)
    monkeypatch.setenv('APIFY_TOKEN', 'test-only')
    out = tmp_path / 'food'
    monkeypatch.setattr('sys.argv', ['ingest_catalog', '--source', 'apify', '--live',
                                    '--food-promos', '--max-items', '200', '--output-dir', str(out)])
    assert main() == 0
    jobs = seen[0]['jobs']
    assert len(jobs) == 12
    assert sum(j['max_items'] for j in jobs) == 200
    assert all('search_terms' not in j['input'] for j in jobs)
    assert all(j['input']['on_sale_only'] for j in jobs)
    assert 'natural-and-organic' not in seen[0]['food_categories']
    result = read_json(out / 'catalog.json')
    assert len(result['offers']) == 1 and not result['matches']
    assert result['offers'][0]['regular_price'] == '2.99'
    assert result['offers'][0]['valid_to'] is None
    monkeypatch.delenv('APIFY_TOKEN', raising=False)
    replay = tmp_path / 'replay'
    monkeypatch.setattr('sys.argv', ['ingest_catalog', '--replay', str(out / 'raw.json'),
                                    '--output-dir', str(replay)])
    assert main() == 0
    assert read_json(replay / 'catalog.json') == result


def test_food_promos_rejects_pet_food():
    data = archive()
    data['food_categories'] = ['fish-seafood']
    data['rows'][0]['name'] = 'Salmon Cat Food'
    result = normalize_archive(data)
    assert not result.offers
    assert result.collection['errors'][0]['error'] == 'non_food_result_excluded'
