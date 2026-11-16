"""Surface HTTP des achats et clôture ; aucune confiance dans le prix client."""
from uuid import uuid4

from backend.tests.test_accounts import accounts, login, ALICE, BOB, postgres  # noqa: F401
from backend.tests.test_shopping_comparison_http import setup, fake_source
from backend.tests.test_shopping_list_http import command


def test_http_product_purchase_check_uncheck_replay_and_private_access(accounts, monkeypatch):
    client, app = accounts
    path, resource = setup(client, app)
    fake_source(monkeypatch)
    proposal = client.post(path + '/comparisons').json()['item']
    saved = command(client, path + '/apply-comparison', {'expected_revision': 2,
        'comparison_id': proposal['id'], 'scenario': 'cheapest'}).json()['item']
    body = {'expected_revision': saved['revision'], 'comparison_id': proposal['id'],
        'item_id': saved['items'][0]['id'], 'product_id': proposal['scenarios'][-1]['needs'][0]['lines'][0]['sale']['product_id'],
        'purchased_units': 1}
    assert client.put(path + '/product-purchases', json=body).status_code == 422  # clé requise
    assert command(client, path + '/product-purchases', body | {'estimated_amount': '0.01'}, method='put').status_code == 422
    key = uuid4()
    response = command(client, path + '/product-purchases', body, key=key, method='put')
    assert response.status_code == 200, response.text
    partial = response.json()['item']
    assert partial['totals']['remaining_known_amount'] == '3.00'
    assert partial['totals']['budget_known_amount'] == '6.00'
    assert command(client, path + '/product-purchases', body, key=key, method='put').json() == response.json()
    assert command(client, path + '/product-purchases', body, method='put').status_code == 409
    login(app, BOB)
    assert command(client, path + '/product-purchases', body, method='put').status_code == 404
    login(app, ALICE)
    active = command(client, path + '/activate', {'expected_revision': partial['revision']}).json()['item']
    refused = command(client, path + '/complete', {'expected_revision': active['revision']})
    assert refused.status_code == 409 and refused.json()['error']['code'] == 'COURSES_REMAINING'
    complete = command(client, path + '/complete', {'expected_revision': active['revision'], 'accept_remaining': True})
    assert complete.status_code == 200 and complete.json()['item']['status'] == 'completed'
    assert command(client, path + '/product-purchases', body | {'expected_revision': complete.json()['item']['revision']}, method='put').status_code == 409
