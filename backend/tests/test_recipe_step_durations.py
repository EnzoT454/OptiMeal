"""Durées des étapes : validation, compatibilité et calcul serveur."""
import pytest
from pydantic import ValidationError
from sqlalchemy import select
from backend.app.recipes.models import Recipe
from backend.tests.test_accounts import ALICE, BOB, accounts, body, login  # noqa: F401
from backend.tests.test_ingredient_import import postgres  # noqa: F401

from backend.app.common.public_data import DEFAULT_RECIPES
from backend.app.recipes.schemas import RecipeWrite
from backend.app.recipes.seed_import import read_recipes, recipe_rows


def payload():
    return read_recipes(DEFAULT_RECIPES)[0].model_dump(exclude={'seed_key'})


def timed_payload():
    body = payload()
    for field in ('prep_time_minutes', 'cook_time_minutes', 'total_time_minutes'):
        body.pop(field)
    body['instructions'] = [
        {'position': 1, 'text': 'Préparer.', 'duration_minutes': 5},
        {'position': 2, 'text': 'Cuire.', 'duration_minutes': 25},
        {'position': 3, 'text': 'Servir.', 'duration_minutes': 0},
    ]
    return body


def test_total_is_calculated_even_without_legacy_fields():
    recipe = RecipeWrite.model_validate(timed_payload())
    assert recipe.total_time_minutes == recipe.prep_time_minutes == 30
    assert recipe.cook_time_minutes == 0
    assert recipe.instructions[2].duration_minutes == 0


def test_client_cannot_override_sum_of_steps():
    recipe = RecipeWrite.model_validate(dict(timed_payload(), total_time_minutes=1,
                                            prep_time_minutes=1, cook_time_minutes=50))
    assert recipe.total_time_minutes == recipe.prep_time_minutes == 30
    assert recipe.cook_time_minutes == 0


@pytest.mark.parametrize('duration', [None, -1, True, '5', 1.5, 2147483648])
def test_reject_invalid_or_partially_missing_durations(duration):
    body = timed_payload()
    body['instructions'][0]['duration_minutes'] = duration
    with pytest.raises(ValidationError):
        RecipeWrite.model_validate(body)


def test_reject_overflowing_total():
    body = timed_payload()
    body['instructions'][0]['duration_minutes'] = 2147483647
    with pytest.raises(ValidationError):
        RecipeWrite.model_validate(body)


def test_old_recipes_keep_their_total_without_invented_step_durations():
    body = payload()
    recipe = RecipeWrite.model_validate(body)
    assert recipe.total_time_minutes == body['total_time_minutes']
    assert all(step.duration_minutes is None for step in recipe.instructions)
    assert all('duration_minutes' not in step for step in recipe_rows(read_recipes(DEFAULT_RECIPES)[0])[0]['instructions'])


def test_missing_all_timing_information_is_rejected():
    body = timed_payload()
    for step in body['instructions']:
        step.pop('duration_minutes')
    with pytest.raises(ValidationError):
        RecipeWrite.model_validate(body)


def test_api_persists_computed_total_and_versions_step_durations(accounts, postgres):
    client, app = accounts
    login(app, ALICE)
    data = body()
    for field in ('prep_time_minutes', 'cook_time_minutes', 'total_time_minutes'):
        data.pop(field)
    data.update(visibility='public', instructions=[
        {'position': 1, 'text': 'Préparer.', 'duration_minutes': 10},
        {'position': 2, 'text': 'Cuire.', 'duration_minutes': 20},
    ])
    response = client.post('/api/v1/recipes', json=data)
    assert response.status_code == 201, response.text
    recipe = response.json()['item']
    recipe_id = recipe['id']
    assert recipe['total_time_minutes'] == 30
    assert postgres.scalar(select(Recipe.total_time_minutes).where(Recipe.id == recipe_id)) == 30
    assert recipe_id in {row['id'] for row in client.get('/api/v1/recipes?quick=true').json()['items']}
    login(app, BOB)
    assert client.put(f'/api/v1/recipes/{recipe_id}/rating', json={
        'recipe_version': 1, 'taste_score': 5, 'reliability_score': 4, 'ease_score': 4,
    }).status_code == 200
    login(app, ALICE)
    data.pop('visibility')
    # Même total, textes identiques : changer la répartition doit aussi
    # invalider les notes de l'ancienne version.
    data['instructions'][0]['duration_minutes'] = 15
    data['instructions'][1]['duration_minutes'] = 15
    updated = client.put(f'/api/v1/recipes/{recipe_id}', json=data)
    assert updated.status_code == 200, updated.text
    assert updated.json()['item']['content_version'] == 2
    assert updated.json()['item']['rating']['count'] == 0
    assert updated.json()['item']['total_time_minutes'] == 30
    assert client.put(f'/api/v1/recipes/{recipe_id}', json=data).json()['item']['content_version'] == 2
    data['instructions'][1]['duration_minutes'] = 16
    updated = client.put(f'/api/v1/recipes/{recipe_id}', json=data)
    assert updated.json()['item']['total_time_minutes'] == 31
    assert recipe_id not in {row['id'] for row in client.get('/api/v1/recipes?quick=true').json()['items']}
    saved = postgres.scalar(select(Recipe.instructions).where(Recipe.id == recipe_id))
    assert [step['duration_minutes'] for step in saved] == [15, 16]
