"""Métadonnées facultatives, imports existants et compatibilité des clients."""
import pytest
from pydantic import ValidationError
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError

from backend.app.catalog.ingredient_import import read_ingredients, upsert_ingredients
from backend.app.common.public_data import DEFAULT_CATALOG, DEFAULT_RECIPES
from backend.app.recipes.models import Recipe
from backend.app.recipes.schemas import RecipeWrite
from backend.app.recipes.seed_import import import_recipes, read_recipes
from backend.tests.test_accounts import accounts, login, ALICE, BOB  # noqa: F401
from backend.tests.test_ingredient_import import postgres, alembic_config  # noqa: F401
from alembic import command


def body():
    return read_recipes(DEFAULT_RECIPES)[0].model_dump(exclude={'seed_key'})


def test_metadata_defaults_keep_legacy_requests_valid():
    data = body()
    data.pop('difficulty'); data.pop('tags')
    recipe = RecipeWrite.model_validate(data)
    assert recipe.difficulty is None and recipe.tags == []


def test_tags_are_normalized_and_quick_is_not_an_author_claim():
    recipe = RecipeWrite.model_validate({**body(), 'tags': ['  economique ', 'Économique', 'RAPIDE', 'Végétarien']})
    assert recipe.tags == ['Économique', 'Végétarien']


@pytest.mark.parametrize('changes', [{'difficulty': 'unknown'}, {'tags': ['']}, {'tags': ['x' * 41]},
                                   {'tags': ['tag'] * 11}, {'tags': [None]}])
def test_invalid_metadata_is_rejected(changes):
    with pytest.raises(ValidationError):
        RecipeWrite.model_validate({**body(), **changes})


def test_metadata_persists_and_old_client_update_keeps_it(accounts):
    client, app = accounts
    login(app, ALICE)
    data = {**body(), 'difficulty': 'easy', 'tags': ['economique', 'Rapide']}
    result = client.post('/api/v1/recipes', json=data)
    assert result.status_code == 201, result.text
    recipe_id = result.json()['item']['id']
    detail = client.get('/api/v1/recipes/' + recipe_id).json()['item']
    assert detail['difficulty'] == 'easy' and detail['tags'] == ['Économique']
    summary = next(r for r in client.get('/api/v1/recipes?limit=100').json()['items'] if r['id'] == recipe_id)
    assert summary['difficulty'] == 'easy' and summary['tags'] == ['Économique']
    legacy = body()
    legacy.pop('difficulty'); legacy.pop('tags'); legacy['name'] = 'Ancien client'
    assert client.put('/api/v1/recipes/' + recipe_id, json=legacy).status_code == 200
    detail = client.get('/api/v1/recipes/' + recipe_id).json()['item']
    assert detail['difficulty'] == 'easy' and detail['tags'] == ['Économique']
    login(app, BOB)
    assert client.get('/api/v1/recipes/' + recipe_id).status_code == 404
    assert client.put('/api/v1/recipes/' + recipe_id, json=data).status_code == 404
    login(app, ALICE)
    removed = client.put('/api/v1/recipes/' + recipe_id, json={**body(), 'difficulty': None, 'tags': []})
    assert removed.json()['item']['difficulty'] is None and removed.json()['item']['tags'] == []


def test_upgrade_preserves_existing_recipes_and_import_replay(postgres):
    upsert_ingredients(postgres, read_ingredients(DEFAULT_CATALOG))
    seeds = read_recipes(DEFAULT_RECIPES)
    import_recipes(postgres, seeds)
    assert import_recipes(postgres, seeds).unchanged == 10
    before = postgres.execute(select(Recipe.id, Recipe.name, Recipe.image_url)).all()
    command.downgrade(alembic_config(postgres), '0003_accounts')
    command.upgrade(alembic_config(postgres), 'head')
    assert before == postgres.execute(select(Recipe.id, Recipe.name, Recipe.image_url)).all()
    assert import_recipes(postgres, seeds).unchanged == 10
    assert postgres.scalar(text("SELECT count(*) FROM recipe WHERE difficulty IS NULL AND tags = '{}'::text[]")) == 10
    with pytest.raises(IntegrityError), postgres.begin_nested():
        postgres.execute(text("UPDATE recipe SET difficulty='invented'"))
