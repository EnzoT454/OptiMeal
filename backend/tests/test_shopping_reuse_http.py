"""Contrats HTTP privés des modèles, exclusions, copies et révisions."""
from uuid import uuid4
from backend.tests.test_accounts import accounts, login, ALICE, BOB, postgres  # noqa: F401
from backend.tests.test_shopping_list_http import command, ROOT

TEMPLATES = '/api/v1/shopping-list-templates'
EXCLUSIONS = '/api/v1/shopping-list-exclusions'
INGREDIENT = 'ing_riz_basmati_blanc'


def source(client, app):
    login(app, ALICE)
    created = command(client).json()['item']
    path = ROOT + '/' + created['id']
    resource = command(client, path + '/items', {'expected_revision': 1, 'name': 'Riz', 'ingredient_id': INGREDIENT,
        'quantity': {'amount': '250', 'unit': 'g'}}).json()['item']
    return path, resource


def test_private_template_crud_replay_and_instance_independence(accounts):
    client, app = accounts
    assert client.get(TEMPLATES).status_code == 401
    path, original = source(client, app)
    body = {'source_list_id': original['id'], 'source_revision': original['revision'], 'name': 'Modèle'}
    assert client.post(TEMPLATES, json=body).status_code == 422
    assert command(client, TEMPLATES, body | {'owner_id': str(BOB.id)}).status_code == 422
    key = uuid4()
    response = command(client, TEMPLATES, body, key)
    assert response.status_code == 201, response.text
    template = response.json()['item']
    assert command(client, TEMPLATES, body, key).json() == response.json()
    route = TEMPLATES + '/' + template['id']
    instance = command(client, route + '/instantiate', {'expected_template_revision': 1,
        'name': 'Mes courses', 'purchase_date': '2026-11-20'}).json()['item']
    updated = command(client, route, {'expected_revision': 1, 'name': 'Modifié'}, method='patch')
    assert updated.status_code == 200, updated.text
    assert command(client, route, {'expected_revision': 1, 'name': 'Ancien'}, method='patch').json()['error']['code'] == 'TEMPLATE_REVISION_CONFLICT'
    removed = client.request('DELETE', route, json={'expected_revision': 2}, headers={'Idempotency-Key': str(uuid4())})
    assert removed.status_code == 200 and removed.json()['item']['deleted']
    assert client.get(route).status_code == 404
    assert client.get(ROOT + '/' + instance['id']).json()['item'] == instance
    assert client.get(TEMPLATES).json()['total'] == 0
    login(app, BOB)
    assert command(client, TEMPLATES, body).status_code == 404
    assert client.get(path + '/revisions').status_code == 404


def test_copy_revision_and_history_routes(accounts):
    client, app = accounts
    path, original = source(client, app)
    archived = command(client, path + '/archive', {'expected_revision': original['revision']}).json()['item']
    assert client.get(ROOT + '?collection=current').json()['total'] == 0
    assert client.get(ROOT + '?collection=history').json()['total'] == 1
    assert client.get(path + '/revisions?limit=1').status_code == 404
    old = command(client, path + '/duplicate', {'source_revision': original['revision'], 'name': 'Copie', 'purchase_date': '2026-11-22'})
    assert old.status_code == 409
    copied = command(client, path + '/duplicate', {'source_revision': archived['revision'], 'name': 'Copie', 'purchase_date': '2026-11-22'})
    assert copied.status_code == 201, copied.text
    value = copied.json()['item']
    assert value['origin'] == {'kind': 'list', 'id': original['id'], 'revision': archived['revision']}
    assert not value['purchases'] and not value['product_purchases']
    assert client.get(path + '/revisions/' + str(original['revision'])).status_code == 404
    assert client.get(ROOT + '?collection=current&status=active').status_code == 422


def test_exclusions_are_target_states_private_and_removable(accounts):
    client, app = accounts
    login(app, ALICE)
    key = uuid4()
    response = command(client, EXCLUSIONS + '/' + INGREDIENT, {'excluded': True}, key, method='put')
    assert response.status_code == 200, response.text
    assert command(client, EXCLUSIONS + '/' + INGREDIENT, {'excluded': True}, key, method='put').json() == response.json()
    assert client.get(EXCLUSIONS).json()['total'] == 1
    assert command(client, EXCLUSIONS + '/' + INGREDIENT, {'excluded': True, 'owner_id': str(BOB.id)}, method='put').status_code == 422
    login(app, BOB)
    assert client.get(EXCLUSIONS).json()['items'] == []
    login(app, ALICE)
    removed = client.delete(EXCLUSIONS + '/' + INGREDIENT, headers={'Idempotency-Key': str(uuid4())})
    assert removed.status_code == 200 and not removed.json()['item']['excluded']
    assert client.get(EXCLUSIONS).json()['total'] == 0
