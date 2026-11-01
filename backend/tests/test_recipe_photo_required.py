"""Photo obligatoire à la création HTTP, sans affecter édition et imports."""
from uuid import UUID

from fastapi.testclient import TestClient
import pytest

from backend.app.config import Settings
from backend.app.common.public_data import DEFAULT_RECIPES
from backend.app.main import create_app
from backend.app.recipes import service
from backend.app.recipes.router import recipe_db
from backend.app.recipes.schemas import RecipeCreate, RecipeRead, RecipeWrite
from backend.app.recipes.seed_import import read_recipes
from backend.app.security import CurrentUser, current_user


@pytest.fixture
def recipe_client(monkeypatch):
    calls = []
    app = create_app(settings=Settings())
    app.dependency_overrides[current_user] = lambda: CurrentUser(UUID(int=1), 'test@example.test')
    app.dependency_overrides[recipe_db] = lambda: None
    def save(_db, body, _user):
        calls.append(body)
        return RecipeRead(id='recipe_test', is_owned=True, **body.model_dump())
    monkeypatch.setattr(service, 'create_recipe', save)
    monkeypatch.setattr(service, 'update_recipe', lambda db, recipe_id, body, user: save(db, body, user))
    with TestClient(app) as client:
        yield client, calls


def payload():
    return read_recipes(DEFAULT_RECIPES)[0].model_dump(exclude={'seed_key'})


@pytest.mark.parametrize('photo', [None, '', '   ', 'not-a-url', 'file:///local.jpg',
                                    'data:image/jpeg;base64,abc', 'http://example.test/photo.jpg', 'https://'])
def test_no_recipe_created_without_valid_photo(recipe_client, photo):
    client, calls = recipe_client
    response = client.post('/api/v1/recipes', json={**payload(), 'image_url': photo})
    assert response.status_code == 422, response.text
    assert not calls


def test_missing_photo_field_is_rejected(recipe_client):
    client, calls = recipe_client
    body = payload()
    body.pop('image_url')
    assert client.post('/api/v1/recipes', json=body).status_code == 422
    assert not calls


def test_uploaded_photo_url_allows_creation(recipe_client):
    client, calls = recipe_client
    url = 'https://example.supabase.co/storage/v1/object/public/recipes-images/users/test/photo.jpg'
    response = client.post('/api/v1/recipes', json={**payload(), 'image_url': url})
    assert response.status_code == 201, response.text
    assert response.json()['item']['image_url'] == url
    assert len(calls) == 1 and isinstance(calls[0], RecipeCreate)


def test_legacy_recipe_can_still_be_edited_without_photo(recipe_client):
    client, calls = recipe_client
    response = client.put('/api/v1/recipes/recipe_test', json={**payload(), 'image_url': None})
    assert response.status_code == 200
    assert response.json()['item']['image_url'] is None
    assert isinstance(calls[0], RecipeWrite) and not isinstance(calls[0], RecipeCreate)


def test_read_and_seed_models_remain_nullable():
    seed = read_recipes(DEFAULT_RECIPES)[0]
    assert type(seed).model_validate({**seed.model_dump(), 'image_url': None}).image_url is None
    assert RecipeWrite.model_validate({**payload(), 'image_url': None}).image_url is None
