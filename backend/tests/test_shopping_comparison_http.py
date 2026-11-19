"""Contrats HTTP réels de comparaison, isolation et refus des prix client."""
from uuid import uuid4

from backend.app.shopping_lists import comparisons
from backend.app.catalog.sales import normalize_sale, source_fingerprint
from backend.tests.test_accounts import accounts, login, ALICE, BOB, postgres  # noqa: F401
from backend.tests.test_shopping_list_http import command, ROOT
from backend.tests.test_shopping_list_purchases import sale

INGREDIENT = 'ing_riz_basmati_blanc'


def setup(client, app):
    login(app, ALICE)
    resource = command(client, body={'name': 'Courses', 'purchase_date': '2026-11-14'}).json()['item']
    path = ROOT + '/' + resource['id']
    resource = command(client, path + '/items', {'expected_revision': 1, 'name': 'Riz',
        'ingredient_id': INGREDIENT, 'quantity': {'amount': '1000', 'unit': 'g'}}).json()['item']
    return path, resource


def fake_source(monkeypatch):
    s = sale(500, 3)
    proof = s.review.model_copy(update={'ingredient_id': INGREDIENT,
        'source_fingerprint': source_fingerprint(INGREDIENT, s.raw_source)})
    s = normalize_sale(INGREDIENT, s.raw_source, s.evaluated_on, proof)
    monkeypatch.setattr(comparisons, 'load_sales', lambda request, db, day: [s])


def test_http_compare_apply_replay_and_no_client_price(accounts, monkeypatch):
    client, app = accounts
    path, resource = setup(client, app)
    fake_source(monkeypatch)
    response = client.post(path + '/comparisons')
    assert response.status_code == 200, response.text
    comparison = response.json()['item']
    assert client.get(path).json()['item'] == resource
    body = {'expected_revision': resource['revision'], 'comparison_id': comparison['id'], 'scenario': 'cheapest'}
    assert command(client, path + '/apply-comparison', {**body, 'known_amount': '0'}).status_code == 422
    key = uuid4()
    saved = command(client, path + '/apply-comparison', body, key)
    assert saved.status_code == 200, saved.text
    assert saved.json()['item']['totals']['budget_known_amount'] == '6.00'
    assert command(client, path + '/apply-comparison', body, key).json() == saved.json()
    assert command(client, path + '/apply-comparison', {**body, 'scenario': 'maxi'}, key).status_code == 409
    login(app, BOB)
    assert client.post(path + '/comparisons').status_code == 404
    assert command(client, path + '/apply-comparison', body).status_code == 404


def test_http_partial_and_choice_reset(accounts):
    client, app = accounts
    path, resource = setup(client, app)
    response = client.post(path + '/comparisons')
    assert response.status_code == 200, response.text
    comparison = response.json()['item']
    assert comparison['candidates'] and all(not candidate['eligible'] for candidate in comparison['candidates'])
    assert all(not s['complete'] and s['known_amount'] == '0.00' for s in comparison['scenarios'])
    body = {'expected_revision': 2, 'comparison_id': comparison['id'], 'scenario': 'cheapest'}
    assert command(client, path + '/apply-comparison', body).json()['error']['code'] == 'COMPARISON_PARTIAL'
    saved = command(client, path + '/apply-comparison', {**body, 'accept_partial': True})
    assert saved.status_code == 200, saved.text
    assert not saved.json()['item']['totals']['estimate_complete']
    candidate = next(c for c in comparison['candidates'] if c['ingredient_id'] == INGREDIENT)
    choice_path = path + '/items/' + resource['items'][0]['id'] + '/choice'
    chosen = command(client, choice_path, {'expected_revision': 3, 'product_id': candidate['product_id']}, method='put')
    assert chosen.status_code == 200, chosen.text
    assert chosen.json()['item']['assignment']['stale']
    reset = command(client, choice_path, {'expected_revision': 4, 'product_id': None}, method='put')
    assert reset.status_code == 200 and reset.json()['item']['choices'] == []
