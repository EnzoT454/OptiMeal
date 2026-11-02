"""Publication volontaire, révocation et isolation avec PostgreSQL jetable."""
from datetime import datetime, timezone

from alembic import command
import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError

from backend.app.recipes.models import Recipe
from backend.app.recipes.schemas import RecipeCreate, RecipeVisibilityUpdate
from backend.tests.test_accounts import ALICE, BOB, accounts, body, login  # noqa: F401
from backend.tests.test_ingredient_import import alembic_config, postgres  # noqa: F401


def create(client, app, visibility=None):
    login(app, ALICE)
    payload = body()
    if visibility is not None:
        payload['visibility'] = visibility
    response = client.post('/api/v1/recipes', json=payload)
    assert response.status_code == 201, response.text
    return response.json()['item']


def publish(client, recipe_id, visibility):
    return client.patch(f'/api/v1/recipes/{recipe_id}/visibility', json={'visibility': visibility})


def test_visibility_contracts_reject_unknown_null_and_client_publication_dates():
    from pydantic import ValidationError

    assert RecipeCreate.model_validate(body()).visibility == 'private'
    for fields in ({'visibility': 'friends'}, {'visibility': None}, {'published_at': '2026-11-01T00:00:00Z'}):
        with pytest.raises(ValidationError):
            RecipeCreate.model_validate({**body(), **fields})
    for fields in ({}, {'visibility': None}, {'visibility': 'friends'}, {'visibility': 'public', 'owner_id': str(BOB.id)}):
        with pytest.raises(ValidationError):
            RecipeVisibilityUpdate.model_validate(fields)


def test_private_default_publication_scopes_and_legacy_edit(accounts):
    client, app = accounts
    recipe = create(client, app)
    recipe_id = recipe['id']
    assert recipe['visibility'] == 'private' and recipe['published_at'] is None
    assert client.get('/api/v1/recipes?scope=mine').json()['items'][0]['id'] == recipe_id
    assert client.get('/api/v1/recipes?scope=discover').json()['total'] == 10
    response = publish(client, recipe_id, 'public')
    assert response.status_code == 200, response.text
    timestamp = response.json()['item']['published_at']
    assert timestamp is not None
    assert publish(client, recipe_id, 'public').json()['item']['published_at'] == timestamp
    # Un ancien mobile ne transmet pas de visibilité dans le PUT.
    assert client.put('/api/v1/recipes/' + recipe_id, json=body()).json()['item']['visibility'] == 'public'
    assert client.get('/api/v1/recipes?scope=mine').json()['total'] == 1
    for user in (BOB, None):
        login(app, user)
        public = client.get('/api/v1/recipes?scope=discover&limit=100').json()
        assert public['total'] == 11
        assert all(item['visibility'] == 'public' for item in public['items'])
        detail = client.get('/api/v1/recipes/' + recipe_id)
        assert detail.status_code == 200 and not detail.json()['item']['is_owned']
        assert detail.json()['meta']['dataset_kind'] == 'user_content'
        if user:
            assert client.get('/api/v1/recipes?scope=mine').json()['total'] == 0


def test_create_public_and_owner_only_mutations(accounts):
    client, app = accounts
    recipe = create(client, app, 'public')
    recipe_id = recipe['id']
    assert recipe['visibility'] == 'public' and recipe['published_at'] is not None
    seed_id = next(item['id'] for item in client.get('/api/v1/recipes?scope=discover').json()['items']
                   if item['id'] != recipe_id)
    for user in (ALICE, BOB, None):
        login(app, user)
        assert publish(client, seed_id, 'private').status_code == (401 if user is None else 404)
        if user != ALICE:
            assert publish(client, recipe_id, 'private').status_code == (401 if user is None else 404)
            assert client.put('/api/v1/recipes/' + recipe_id, json=body()).status_code == (401 if user is None else 404)
            assert client.delete('/api/v1/recipes/' + recipe_id).status_code == (401 if user is None else 404)


def test_public_bucket_photo_url_is_preserved_across_visibility_changes(accounts, postgres):
    client, app = accounts
    payload = body()
    image_url = f'https://test.supabase.co/storage/v1/object/public/recipes-images/users/{ALICE.id}/photo.jpg'
    payload['image_url'] = image_url
    login(app, ALICE)
    recipe = client.post('/api/v1/recipes', json=payload).json()['item']
    recipe_id = recipe['id']
    assert recipe['visibility'] == 'private' and recipe['image_url'] == image_url
    for visibility in ('public', 'private', 'public'):
        login(app, ALICE)
        response = publish(client, recipe_id, visibility)
        assert response.status_code == 200
        assert response.json()['item']['image_url'] == image_url
        assert postgres.scalar(select(Recipe.image_url).where(Recipe.id == recipe_id)) == image_url
        for user in (BOB, None):
            login(app, user)
            detail = client.get('/api/v1/recipes/' + recipe_id)
            if visibility == 'public':
                assert detail.status_code == 200 and detail.json()['item']['image_url'] == image_url
            else:
                assert detail.status_code == 404


def test_unpublish_hides_favorites_and_calendar_without_deleting_meals(accounts):
    client, app = accounts
    recipe_id = create(client, app, 'public')['id']
    login(app, BOB)
    assert client.put('/api/v1/recipes/' + recipe_id + '/favorite').status_code == 204
    assert client.get('/api/v1/recipes?scope=favorites').json()['total'] == 1
    assert client.get('/api/v1/recipes?favorites=true').json()['total'] == 1
    meal = {'recipe_id': recipe_id, 'date': '2026-11-02', 'meal': 'souper'}
    response = client.post('/api/v1/plans/entries', json=meal)
    assert response.status_code == 201, response.text
    entry_id = response.json()['item']['id']
    login(app, ALICE)
    assert client.post('/api/v1/plans/entries', json=meal).status_code == 201
    withdrawn = publish(client, recipe_id, 'private').json()['item']
    assert withdrawn['visibility'] == 'private' and withdrawn['published_at'] is None
    owner_meal = client.get('/api/v1/plans?week=2026-11-02').json()['item']['entries'][0]
    assert owner_meal['recipe_name'] is not None
    login(app, BOB)
    assert client.get('/api/v1/recipes/' + recipe_id).status_code == 404
    assert client.get('/api/v1/recipes?scope=favorites').json()['total'] == 0
    assert client.get('/api/v1/recipes?favorites=true').json()['total'] == 0
    assert client.put('/api/v1/recipes/' + recipe_id + '/favorite').status_code == 404
    assert client.post('/api/v1/plans/entries', json=meal).status_code == 404
    entries = client.get('/api/v1/plans?week=2026-11-02').json()['item']['entries']
    assert len(entries) == 1 and entries[0]['id'] == entry_id
    assert entries[0]['recipe_name'] is None and entries[0]['recipe_image_url'] is None
    updated = client.patch('/api/v1/plans/entries/' + entry_id, json={'servings': 4})
    assert updated.status_code == 200 and updated.json()['item']['recipe_name'] is None
    # La republication restaure l'accès et le favori conservé.
    login(app, ALICE)
    assert publish(client, recipe_id, 'public').status_code == 200
    login(app, BOB)
    assert client.get('/api/v1/recipes?scope=favorites').json()['total'] == 1
    assert client.get('/api/v1/plans?week=2026-11-02').json()['item']['entries'][0]['recipe_name'] is not None
    login(app, ALICE)
    assert publish(client, recipe_id, 'private').status_code == 200
    login(app, BOB)
    for _ in range(2):
        assert client.delete('/api/v1/recipes/' + recipe_id + '/favorite').status_code == 204
    assert client.delete('/api/v1/plans/entries/' + entry_id).status_code == 204


def test_scope_filters_authentication_pagination_and_invalid_values(accounts):
    client, app = accounts
    for scope in ('mine', 'favorites'):
        assert client.get('/api/v1/recipes?scope=' + scope).status_code == 401
    recipe_id = create(client, app, 'public')['id']
    assert client.put('/api/v1/recipes/' + recipe_id + '/favorite').status_code == 204
    for scope in ('discover', 'mine', 'favorites'):
        result = client.get(f'/api/v1/recipes?scope={scope}&q=introuvable&quick=true').json()
        assert result['total'] == 0
        assert client.get(f'/api/v1/recipes?scope={scope}&offset=100').json()['items'] == []
    for query in ('scope=unknown', 'scope=mine&favorites=true', 'scope=discover&favorites=true'):
        assert client.get('/api/v1/recipes?' + query).status_code == 422
    assert client.get('/api/v1/recipes?scope=favorites&favorites=true').json()['total'] == 1
    login(app, None)
    assert client.get('/api/v1/plans?week=2026-11-02').status_code == 401


def test_migration_backfills_existing_rows_and_is_reversible(accounts, postgres):
    client, app = accounts
    recipe_id = create(client, app)['id']
    config = alembic_config(postgres)
    command.downgrade(config, '0008_meal_plan')
    command.upgrade(config, 'head')
    rows = postgres.execute(select(Recipe.id, Recipe.visibility, Recipe.published_at)).all()
    assert len(rows) == 11
    for row in rows:
        assert row.visibility == ('private' if row.id == recipe_id else 'public')
        assert row.published_at is None
    command.check(config)


@pytest.mark.parametrize('values', [
    {'visibility': 'friends'}, {'visibility': 'public'},
    {'visibility': 'private', 'published_at': datetime(2026, 11, 1, tzinfo=timezone.utc)},
])
def test_database_rejects_inconsistent_publication(accounts, postgres, values):
    client, app = accounts
    recipe_id = create(client, app)['id']
    with pytest.raises(IntegrityError), postgres.begin_nested():
        postgres.execute(Recipe.__table__.update().where(Recipe.id == recipe_id).values(**values))
