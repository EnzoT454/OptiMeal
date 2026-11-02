"""Notes historiques conservées, seules les notes du contenu courant comptent."""
from copy import deepcopy

from alembic import command
import pytest
from sqlalchemy import func, insert, select, update
from sqlalchemy.exc import DBAPIError, IntegrityError

from backend.app.recipes.models import Recipe, RecipeRating
from backend.tests.test_accounts import ALICE, BOB, accounts, body, login  # noqa: F401
from backend.tests.test_ingredient_import import postgres, alembic_config  # noqa: F401

VOTE = {'recipe_version': 1, 'taste_score': 5, 'reliability_score': 4, 'ease_score': 3}


def create_and_rate(accounts):
    client, app = accounts
    login(app, ALICE)
    payload = {**body(), 'visibility': 'public'}
    recipe = client.post('/api/v1/recipes', json=payload).json()['item']
    assert recipe['content_version'] == 1
    login(app, BOB)
    response = client.put('/api/v1/recipes/' + recipe['id'] + '/rating', json=VOTE)
    assert response.status_code == 200, response.text
    return recipe['id'], payload


def edit(client, app, recipe_id, payload):
    login(app, ALICE)
    data = {key: value for key, value in payload.items() if key != 'visibility'}
    response = client.put('/api/v1/recipes/' + recipe_id, json=data)
    assert response.status_code == 200, response.text
    return response.json()['item']


@pytest.mark.parametrize('change', ['quantity', 'unit', 'preparation', 'instructions', 'servings', 'prep', 'cook'])
def test_material_edits_exclude_old_votes_but_keep_their_values(accounts, postgres, change):
    client, app = accounts
    recipe_id, payload = create_and_rate(accounts)
    changed = deepcopy(payload)
    if change == 'quantity':
        changed['ingredients'][0]['quantity'] = '1234'
    elif change == 'unit':
        changed['ingredients'][0].update(quantity='2', unit='unit')
    elif change == 'preparation':
        changed['ingredients'][0]['preparation'] = 'Couper autrement'
    elif change == 'instructions':
        changed['instructions'][0]['text'] += ' Ajouter une nouvelle opération.'
    elif change == 'servings':
        changed['servings'] += 1
    else:
        changed['prep_time_minutes' if change == 'prep' else 'cook_time_minutes'] += 1
        changed['total_time_minutes'] += 1
    item = edit(client, app, recipe_id, changed)
    assert item['content_version'] == 2 and item['rating']['count'] == 0 and item['rating']['average'] is None
    saved = postgres.execute(select(RecipeRating.__table__).where(RecipeRating.recipe_id == recipe_id)).mappings().one()
    assert {key: saved[key] for key in VOTE} == VOTE
    login(app, BOB)
    detail = client.get('/api/v1/recipes/' + recipe_id).json()['item']
    assert detail['my_rating']['recipe_version'] == 1
    assert detail['content_version'] == 2
    listed = client.get('/api/v1/recipes?scope=discover&sort=top&limit=100').json()['items']
    assert next(row for row in listed if row['id'] == recipe_id)['rating']['count'] == 0
    assert client.put('/api/v1/recipes/' + recipe_id + '/rating', json=VOTE).status_code == 409
    # Sauvegarder de nouveau un contenu identique ne crée pas une troisième version.
    assert edit(client, app, recipe_id, changed)['content_version'] == 2


@pytest.mark.parametrize('change', ['name', 'photo', 'description', 'tags', 'difficulty', 'ingredient_order', 'quantity_format'])
def test_nonmaterial_edits_keep_votes_and_version(accounts, change):
    client, app = accounts
    recipe_id, payload = create_and_rate(accounts)
    changed = deepcopy(payload)
    if change == 'name':
        changed['name'] += ' — nouveau nom'
    elif change == 'photo':
        changed['image_url'] = 'https://example.test/new.jpg'
    elif change == 'description':
        changed['description'] += ' Description corrigée.'
    elif change == 'tags':
        changed['tags'] = ['Maison']
    elif change == 'difficulty':
        changed['difficulty'] = 'hard'
    elif change == 'ingredient_order':
        changed['ingredients'].reverse()
    else:
        from decimal import Decimal
        changed['ingredients'][0]['quantity'] = format(Decimal(changed['ingredients'][0]['quantity']), '.4f')
    item = edit(client, app, recipe_id, changed)
    assert item['content_version'] == 1 and item['rating']['count'] == 1


def test_reassessment_keeps_both_versions_but_counts_each_account_once_per_version(accounts, postgres):
    client, app = accounts
    recipe_id, payload = create_and_rate(accounts)
    payload['instructions'][0]['text'] += ' Nouvelle préparation.'
    edit(client, app, recipe_id, payload)
    login(app, BOB)
    old = postgres.execute(select(RecipeRating.__table__)).mappings().one()
    vote = {**VOTE, 'recipe_version': 2, 'taste_score': 3}
    for _ in range(2):
        result = client.put('/api/v1/recipes/' + recipe_id + '/rating', json=vote)
        assert result.status_code == 200, result.text
        assert result.json()['item']['rating']['count'] == 1
        assert result.json()['item']['my_rating']['recipe_version'] == 2
    rows = postgres.execute(select(RecipeRating.__table__).order_by(RecipeRating.recipe_version)).mappings().all()
    assert len(rows) == 2 and dict(rows[0]) == dict(old)
    assert rows[1]['taste_score'] == 3
    # Supprimer sa contribution retire aussi les versions historiques.
    assert client.delete('/api/v1/recipes/' + recipe_id + '/rating').status_code == 204
    assert postgres.scalar(select(func.count()).select_from(RecipeRating)) == 0


@pytest.mark.parametrize('version,status', [(None, 422), (True, 422), ('1', 422), (1.0, 422), (0, 422), (-1, 422), (2, 409)])
def test_version_is_required_strict_and_checked_under_lock(accounts, postgres, version, status):
    client, app = accounts
    recipe_id, _ = create_and_rate(accounts)
    response = client.put('/api/v1/recipes/' + recipe_id + '/rating', json={**VOTE, 'recipe_version': version})
    assert response.status_code == status
    if status == 409:
        assert response.json()['error']['code'] == 'RECIPE_VERSION_CONFLICT'
    assert postgres.scalar(select(func.count()).select_from(RecipeRating)) == 1
    assert client.put('/api/v1/recipes/' + recipe_id + '/rating', json={key: value for key, value in VOTE.items() if key != 'recipe_version'}).status_code == 422


def test_visibility_changes_keep_versions_and_private_history_is_not_shared(accounts):
    client, app = accounts
    recipe_id, payload = create_and_rate(accounts)
    for visibility in ('private', 'public'):
        login(app, ALICE)
        item = client.patch('/api/v1/recipes/' + recipe_id + '/visibility', json={'visibility': visibility}).json()['item']
        assert item['content_version'] == 1 and item['rating']['count'] == 1
    payload['instructions'][0]['text'] += ' Autre méthode.'
    edit(client, app, recipe_id, payload)
    login(app, None)
    assert client.get('/api/v1/recipes/' + recipe_id).json()['item']['my_rating'] is None
    login(app, ALICE)
    assert client.get('/api/v1/recipes/' + recipe_id).json()['item']['my_rating'] is None
    assert client.put('/api/v1/recipes/' + recipe_id, json={**body(), 'content_version': 99}).status_code == 422


def test_obsolete_votes_do_not_influence_top_ranking(accounts):
    client, app = accounts
    recipe_id, payload = create_and_rate(accounts)
    payload['instructions'][0]['text'] += ' Nouvelle préparation.'
    edit(client, app, recipe_id, payload)
    login(app, BOB)
    seed = next(row['id'] for row in client.get('/api/v1/recipes').json()['items'] if row['id'] != recipe_id)
    assert client.put('/api/v1/recipes/' + seed + '/rating', json={**VOTE, 'taste_score': 1, 'reliability_score': 1, 'ease_score': 1}).status_code == 200
    items = client.get('/api/v1/recipes?scope=discover&sort=top&limit=100').json()['items']
    assert items[0]['id'] == seed
    assert next(row for row in items if row['id'] == recipe_id)['rating']['count'] == 0


def test_failed_content_edit_never_advances_version(accounts):
    client, app = accounts
    recipe_id, payload = create_and_rate(accounts)
    login(app, ALICE)
    payload.pop('visibility')
    payload['ingredients'][0]['ingredient_id'] = 'ing_missing'
    response = client.put('/api/v1/recipes/' + recipe_id, json=payload)
    assert response.status_code == 422
    item = client.get('/api/v1/recipes/' + recipe_id).json()['item']
    assert item['content_version'] == 1 and item['rating']['count'] == 1


def test_migration_backfills_version_one_preserves_votes_and_refuses_lossy_downgrade(accounts, postgres):
    client, app = accounts
    recipe_id, payload = create_and_rate(accounts)
    config = alembic_config(postgres)
    command.downgrade(config, '0012_recipe_timestamps')
    command.upgrade(config, 'head')
    assert postgres.scalar(select(Recipe.content_version).where(Recipe.id == recipe_id)) == 1
    assert postgres.scalar(select(RecipeRating.recipe_version)) == 1
    command.check(config)
    payload['instructions'][0]['text'] += ' Autre méthode.'
    edit(client, app, recipe_id, payload)
    with pytest.raises(DBAPIError, match='des versions de notation existent'), postgres.begin_nested():
        command.downgrade(config, '0012_recipe_timestamps')
    assert postgres.scalar(select(RecipeRating.taste_score)) == 5
    with pytest.raises(IntegrityError), postgres.begin_nested():
        postgres.execute(update(Recipe).where(Recipe.id == recipe_id).values(content_version=0))
    with pytest.raises(IntegrityError), postgres.begin_nested():
        postgres.execute(update(RecipeRating).values(recipe_version=0))
