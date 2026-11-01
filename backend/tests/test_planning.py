"""Tests du calendrier qui tournent sans base de données."""
import datetime as dt

import pytest
from pydantic import ValidationError

from backend.app.main import app
from backend.app.planning.schemas import MealPlanEntryUpdate, MealPlanEntryWrite
from backend.app.planning.service import monday_of

DAY = '2026-11-04'  # un mercredi


def test_monday_of_returns_monday_of_the_week():
    assert monday_of(dt.date(2026, 11, 4)) == dt.date(2026, 11, 2)   # mercredi -> lundi
    assert monday_of(dt.date(2026, 11, 2)) == dt.date(2026, 11, 2)   # lundi -> lui-même
    assert monday_of(dt.date(2026, 11, 8)) == dt.date(2026, 11, 2)   # dimanche -> lundi d'avant


def test_entry_with_recipe_is_valid_and_defaults_to_two_servings():
    entry = MealPlanEntryWrite(date=DAY, meal='souper', recipe_id='recipe_pates_tomate')
    assert entry.servings == 2 and entry.free_text is None and entry.is_leftover is False


def test_leftover_needs_a_recipe():
    assert MealPlanEntryWrite(date=DAY, meal='diner', recipe_id='recipe_curry', is_leftover=True).is_leftover
    with pytest.raises(ValidationError):
        MealPlanEntryWrite(date=DAY, meal='diner', free_text='Resto', is_leftover=True)


def test_free_text_is_trimmed():
    assert MealPlanEntryWrite(date=DAY, meal='diner', free_text='  Restes ').free_text == 'Restes'


@pytest.mark.parametrize('fields', [
    {},                                                      # ni recette ni texte
    {'recipe_id': 'recipe_pates_tomate', 'free_text': 'Resto'},  # les deux
    {'free_text': '   '},                                    # texte vide
    {'free_text': 'x' * 81},                                 # texte trop long
    {'recipe_id': 'pas une recette'},                        # mauvais format d'id
    {'free_text': 'Resto', 'servings': 0},                   # portions invalides
])
def test_invalid_entries_are_rejected(fields):
    with pytest.raises(ValidationError):
        MealPlanEntryWrite(date=DAY, meal='souper', **fields)


def test_unknown_meal_is_rejected():
    with pytest.raises(ValidationError):
        MealPlanEntryWrite(date=DAY, meal='brunch', free_text='Resto')


def test_update_needs_valid_servings():
    assert MealPlanEntryUpdate(servings=4).servings == 4
    with pytest.raises(ValidationError):
        MealPlanEntryUpdate(servings=51)


def test_planning_routes_are_registered():
    paths = app.openapi()['paths']
    assert set(paths['/api/v1/plans']) == {'get'}
    assert set(paths['/api/v1/plans/entries']) == {'post'}
    assert set(paths['/api/v1/plans/entries/{entry_id}']) == {'patch', 'delete'}