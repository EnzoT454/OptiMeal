"""Conservation des repas et accès aux seules recettes autorisées."""
from alembic import command
import httpx
import pytest
from sqlalchemy import inspect, text
from sqlalchemy.exc import DBAPIError

from backend.app.accounts.deletion import AccountDeletion
from backend.tests.test_accounts import ALICE, BOB, accounts, body, login  # noqa: F401
from backend.tests.test_ingredient_import import alembic_config, postgres  # noqa: F401


def create_recipe(client, app, visibility='public'):
    login(app, ALICE)
    response = client.post('/api/v1/recipes', json={**body(), 'visibility': visibility})
    assert response.status_code == 201
    return response.json()['item']['id']


def add(client, recipe_id, **fields):
    return client.post('/api/v1/plans/entries', json={
        'date': '2026-11-02', 'meal': 'souper', 'recipe_id': recipe_id, **fields,
    })


def entries(client):
    response = client.get('/api/v1/plans?week=2026-11-02')
    assert response.status_code == 200
    return response.json()['item']['entries']


def test_calendar_accepts_public_and_own_private_recipes_only(accounts):
    client, app = accounts
    private = create_recipe(client, app, 'private')
    public = create_recipe(client, app)
    assert add(client, private).status_code == 201
    assert entries(client)[0]['recipe_name'] is not None
    login(app, BOB)
    assert add(client, private).status_code == 404
    assert add(client, public).status_code == 201
    seed = client.get('/api/v1/recipes?scope=discover').json()['items'][0]['id']
    assert add(client, seed).status_code == 201
    selectable = client.get('/api/v1/recipes?scope=accessible&limit=100').json()['items']
    assert private not in {r['id'] for r in selectable}
    assert public in {r['id'] for r in selectable}
    assert all(r['visibility'] == 'public' or r['is_owned'] for r in selectable)
    assert client.post('/api/v1/plans/entries', json={'date': '2026-11-02', 'meal': 'diner'}).status_code == 422
    assert client.post('/api/v1/plans/entries', json={
        'date': '2026-11-02', 'meal': 'diner', 'free_text': 'Resto', 'is_leftover': True,
    }).status_code == 422


def test_delete_recipe_keeps_both_users_meals_and_leftovers(accounts):
    client, app = accounts
    recipe_id = create_recipe(client, app)
    saved = {}
    for user in (ALICE, BOB):
        login(app, user)
        saved[user.id] = []
        for leftover in (False, True):
            response = add(client, recipe_id, is_leftover=leftover)
            assert response.status_code == 201
            saved[user.id].append(response.json()['item']['id'])
    login(app, ALICE)
    assert client.delete('/api/v1/recipes/' + recipe_id).status_code == 204
    for user in (ALICE, BOB):
        login(app, user)
        meals = entries(client)
        assert {m['id'] for m in meals} == set(saved[user.id])
        assert sorted(m['is_leftover'] for m in meals) == [False, True]
        assert all(m['recipe_id'] is None and m['recipe_name'] is None and m['recipe_image_url'] is None
                   and m['free_text'] is None for m in meals)
        assert add(client, recipe_id).status_code == 404
        meal_id = meals[0]['id']
        changed = client.patch('/api/v1/plans/entries/' + meal_id, json={'servings': 4, 'date': '2026-11-03'})
        assert changed.status_code == 200 and changed.json()['item']['servings'] == 4
        assert client.delete('/api/v1/plans/entries/' + meal_id).status_code == 204
        assert len(entries(client)) == 1


def test_account_deletion_preserves_other_users_meals_without_recipe_content(accounts, postgres):
    client, app = accounts
    recipe_id = create_recipe(client, app)
    for user in (ALICE, BOB):
        login(app, user)
        assert add(client, recipe_id).status_code == 201

    def provider(request):
        if request.method == 'POST':
            return httpx.Response(200, json=[])
        postgres.execute(text('DELETE FROM auth.users WHERE id=:id'), {'id': ALICE.id})
        return httpx.Response(200, json={})

    app.state.account_deletion.close()
    app.state.account_deletion = AccountDeletion('https://test.supabase.co', 'sb_secret_TEST')
    app.state.account_deletion.client.close()
    app.state.account_deletion.client = httpx.Client(transport=httpx.MockTransport(provider))
    login(app, ALICE)
    assert client.request('DELETE', '/api/v1/me', json={'confirmation': 'SUPPRIMER'}).status_code == 204
    assert postgres.scalar(text('SELECT count(*) FROM public.meal_plan_entry WHERE user_id=:id'), {'id': ALICE.id}) == 0
    login(app, BOB)
    meals = entries(client)
    assert len(meals) == 1 and meals[0]['recipe_id'] is None and meals[0]['recipe_name'] is None


def test_migration_preserves_existing_recipes_notes_and_restores_constraints(accounts, postgres):
    client, app = accounts
    recipe_id = create_recipe(client, app)
    assert add(client, recipe_id, is_leftover=True).status_code == 201
    assert client.post('/api/v1/plans/entries', json={'date': '2026-11-02', 'meal': 'diner', 'free_text': 'Resto'}).status_code == 201
    before = entries(client)
    config = alembic_config(postgres)
    command.downgrade(config, '0009_recipe_visibility')
    command.upgrade(config, 'head')
    assert entries(client) == before
    foreign_key = next(fk for fk in inspect(postgres).get_foreign_keys('meal_plan_entry') if fk['constrained_columns'] == ['recipe_id'])
    assert foreign_key['options']['ondelete'] == 'SET NULL'
    command.check(config)
    assert client.delete('/api/v1/recipes/' + recipe_id).status_code == 204
    with pytest.raises(DBAPIError), postgres.begin_nested():
        command.downgrade(config, '0009_recipe_visibility')
    assert len(entries(client)) == 2
