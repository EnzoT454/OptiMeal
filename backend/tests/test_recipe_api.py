"""Routes Recettes sur PostgreSQL local, sans appel au projet Supabase."""
from contextlib import contextmanager
from decimal import Decimal
from unittest.mock import Mock

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import sessionmaker

from backend.app.catalog.ingredient_import import read_ingredients, upsert_ingredients
from backend.app.common.public_data import DEFAULT_CATALOG, DEFAULT_RECIPES, load_catalog, load_recipes
from backend.app.config import Settings
from backend.app.main import create_app
from backend.app.recipes.models import Recipe, RecipeIngredient
from backend.app.recipes.seed_import import import_recipes, read_recipes
from backend.tests.test_ingredient_import import postgres  # noqa: F401


@contextmanager
def database_client(connection, **settings):
    with TestClient(create_app(settings=Settings(**settings))) as client:
        client.app.state.database.session_factory = sessionmaker(
            bind=connection, join_transaction_mode='create_savepoint',
        )
        yield client


@pytest.fixture
def api(postgres):
    upsert_ingredients(postgres, read_ingredients(DEFAULT_CATALOG))
    import_recipes(postgres, read_recipes(DEFAULT_RECIPES))
    with database_client(postgres) as client:
        yield client


def test_list_detail_references_and_pagination(api):
    first = api.get('/api/v1/recipes?limit=2').json()
    second = api.get('/api/v1/recipes?limit=2&offset=2').json()
    assert first['total'] == second['total'] == 10
    assert len(first['items']) == len(second['items']) == 2
    assert {r['id'] for r in first['items']}.isdisjoint(r['id'] for r in second['items'])
    all_recipes = api.get('/api/v1/recipes?limit=100').json()
    assert [r['id'] for r in all_recipes['items']] == sorted(r['id'] for r in all_recipes['items'])
    assert all_recipes['meta']['data_source'] == 'postgresql'
    expected = load_recipes(DEFAULT_RECIPES, load_catalog(DEFAULT_CATALOG)).recipes
    for recipe in expected:
        response = api.get('/api/v1/recipes/' + recipe.id)
        assert response.status_code == 200
        assert response.json()['item'] == recipe.model_dump(mode='json')
    assert api.get('/api/v1/recipes?offset=100').json()['items'] == []
    assert api.get('/api/v1/recipes?q=BOEUF').json()['total'] == 1
    quick = api.get('/api/v1/recipes?quick=true').json()['items']
    assert quick and all(r['total_time_minutes'] <= 30 for r in quick)


@pytest.mark.parametrize('query', ['limit=0', 'limit=101', 'offset=-1', 'quick=invalid', 'q=' + 'a' * 201])
def test_invalid_filters_have_shared_errors(api, query):
    response = api.get('/api/v1/recipes?' + query)
    assert response.status_code == 422
    assert response.json()['error']['code'] == 'VALIDATION_ERROR'


def test_empty_database_and_unknown_recipe_return_empty_and_404(postgres):
    with database_client(postgres) as client:
        response = client.get('/api/v1/recipes')
        assert response.status_code == 200
        assert response.json()['items'] == [] and response.json()['total'] == 0
        response = client.get('/api/v1/recipes/recipe_missing')
        assert response.status_code == 404
        assert response.json()['error']['code'] == 'RECIPE_NOT_FOUND'


def test_database_changes_are_visible_and_json_files_are_not_required(postgres, tmp_path):
    upsert_ingredients(postgres, read_ingredients(DEFAULT_CATALOG))
    import_recipes(postgres, read_recipes(DEFAULT_RECIPES))
    recipe = read_recipes(DEFAULT_RECIPES)[0]
    recipe_id = 'recipe_' + recipe.seed_key
    with database_client(postgres, common_catalog_path=str(tmp_path / 'missing.json'),
                         recipe_seed_path=str(tmp_path / 'bad-recipes.json')) as client:
        assert client.get('/api/v1/recipes').json()['total'] == 10
        assert client.get('/api/v1/offers').status_code == 503
        postgres.execute(Recipe.__table__.update().where(Recipe.id == recipe_id).values(
            name='Œufs très épicés', review_required=False,
        ))
        condition = (RecipeIngredient.recipe_id == recipe_id) & (RecipeIngredient.position == 1)
        postgres.execute(RecipeIngredient.__table__.update().where(condition).values(
            quantity=Decimal('0.00000000000000012345'), unit='g',
        ))
        detail = client.get('/api/v1/recipes/' + recipe_id).json()['item']
        assert detail['name'] == 'Œufs très épicés' and detail['review_required'] is False
        assert detail['ingredients'][0]['quantity'] == '0.00000000000000012345'
        result = client.get('/api/v1/recipes?q=OEUFS TRES EPICES&limit=1').json()
        assert result['total'] == 1 and result['items'][0]['id'] == recipe_id
        assert result['items'][0]['review_required'] is False
        assert client.get('/api/v1/recipes?q=not-found').json()['items'] == []


def test_missing_table_returns_sanitized_503_and_other_routes_work(postgres):
    postgres.execute(text('DROP TABLE public.favorite'))
    postgres.execute(text('DROP TABLE public.recipe_ingredient'))
    postgres.execute(text('DROP TABLE public.recipe'))
    with database_client(postgres) as client:
        response = client.get('/api/v1/recipes')
        assert response.status_code == 503
        assert response.json()['error']['code'] == 'RECIPES_UNAVAILABLE'
        assert 'SELECT' not in response.text
        assert client.get('/health').status_code == 200
        assert client.get('/api/v1/offers').json()['total'] == 93


def test_invalid_stored_steps_are_not_returned_as_valid_recipe(api, postgres):
    recipe_id = api.get('/api/v1/recipes').json()['items'][0]['id']
    postgres.execute(Recipe.__table__.update().where(Recipe.id == recipe_id).values(
        instructions=[{'position': 2, 'text': 'Étape invalide'}],
    ))
    response = api.get('/api/v1/recipes/' + recipe_id)
    assert response.status_code == 503
    assert response.json()['error']['code'] == 'RECIPES_UNAVAILABLE'


@pytest.mark.parametrize('path', ['/api/v1/recipes', '/api/v1/recipes/recipe_missing'])
def test_connection_errors_do_not_expose_credentials_or_fall_back_to_json(path):
    closed = []
    session = Mock()
    session.execute.side_effect = OperationalError(None, None, Exception('private-test-password'))
    session.scalar.side_effect = OperationalError(None, None, Exception('private-test-password'))

    @contextmanager
    def factory():
        try:
            yield session
        finally:
            closed.append(True)

    with TestClient(create_app(settings=Settings())) as client:
        client.app.state.database.session_factory = factory
        response = client.get(path)
        assert response.status_code == 503
        assert response.json()['error']['code'] == 'RECIPES_UNAVAILABLE'
        assert 'private-test-password' not in response.text
        assert closed == [True]
        assert client.get('/api/v1/ingredients').json()['total'] == 31
