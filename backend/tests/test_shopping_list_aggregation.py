"""Calculs de portions et conversions vérifiables sans base ou fournisseur externe."""
from dataclasses import replace
from datetime import date
from decimal import Decimal
from fractions import Fraction
from uuid import UUID

import pytest

from backend.app.common.units import decimal_quantity, normalize_quantity, quantity_fraction
from backend.app.shopping_lists.calendar import (
    IngredientSource, MealSource, RecipeSource, aggregate_period,
)
from backend.app.shopping_lists.schemas import ShoppingPeriod
from backend.tests.test_accounts import ALICE, BOB

PERIOD = ShoppingPeriod(start_date='2026-11-16', end_date='2026-11-29')
DAY = date(2026, 11, 15)


def ingredient(quantity='100', unit='g', id='ing_test_riz'):
    return IngredientSource(id, 'Riz', 'Épicerie', Decimal(quantity), unit)


def recipe(*ingredients, servings=2):
    return RecipeSource('recipe_calendar_test', 'Recette test', 1, servings, 'private', tuple(ingredients))


def meal(number, source=None, *, servings=2, day=16, **kwargs):
    return MealSource(UUID(int=number), date(2026, 11, day), 'souper', servings,
                      recipe=source or recipe(ingredient()), **kwargs)


@pytest.mark.parametrize('unit,amount,expected,base', [
    ('g', '200', '200', 'g'), ('kg', '0.5', '500', 'g'),
    ('ml', '200', '200', 'ml'), ('L', '1.5', '1500', 'ml'),
    ('cup', '0.5', '125', 'ml'), ('tbsp', '2', '30', 'ml'),
    ('tsp', '1.5', '7.5', 'ml'), ('unit', '0.5', '0.5', 'unit'),
])
def test_known_conversions(unit, amount, expected, base):
    result = normalize_quantity(Decimal(amount), unit)
    assert (result.amount, result.unit, result.rounded) == (Decimal(expected), base, False)


@pytest.mark.parametrize('amount,unit', [
    (Decimal('NaN'), 'g'), (Decimal('Infinity'), 'g'), (Decimal(0), 'g'),
    (Decimal(-1), 'g'), (0.1, 'g'), (Decimal(1), 'oz'), (Decimal(1), 'package'),
])
def test_ambiguous_units_and_inexact_input_are_rejected(amount, unit):
    with pytest.raises(ValueError):
        normalize_quantity(amount, unit)


@pytest.mark.parametrize('servings,base', [(0, 2), (1, 0), (True, 2), (1.5, 2)])
def test_portions_are_positive_whole_numbers(servings, base):
    with pytest.raises(ValueError):
        quantity_fraction(Decimal(1), 'g', servings=servings, recipe_servings=base)


def test_finite_decimals_keep_all_precision_and_repeating_decimals_round_up():
    assert decimal_quantity(Fraction(Decimal('0.000000001'))) == (Decimal('0.000000001'), False)
    assert decimal_quantity(Fraction(1, 3)) == (Decimal('0.333334'), True)
    assert decimal_quantity(Fraction(2, 3)) == (Decimal('0.666667'), True)
    assert normalize_quantity(Decimal('1000000000000000000000000000.000001'), 'kg').amount == Decimal('1000000000000000000000000000000.001')


def test_portions_and_multiple_weeks_consolidate_identical_ingredients():
    preview = aggregate_period(ALICE, PERIOD, DAY, [meal(1), meal(2, servings=4, day=29), meal(3, day=30)])
    assert preview.included_meal_count == 2
    assert len(preview.items) == 1
    assert preview.items[0].required[0].amount == '300'
    assert len(preview.items[0].contributions) == 2
    c = preview.items[0].contributions[1]
    assert c.original_quantity.amount == '100' and c.normalized_quantity.amount == '200'
    assert (c.servings, c.recipe_servings) == (4, 2)


def test_repeated_thirds_are_summed_before_rounding_the_final_need():
    source = recipe(ingredient('1'), servings=3)
    result = aggregate_period(ALICE, PERIOD, DAY, [meal(1, source, servings=1), meal(2, source, servings=1)])
    assert result.items[0].required[0].amount == '0.666667'
    assert all(c.normalized_quantity.amount == '0.333334' for c in result.items[0].contributions)
    assert any(w.code == 'QUANTITY_ROUNDED' for w in result.warnings)


def test_compatible_volumes_merge_but_mass_and_volume_do_not():
    meals = [meal(1, recipe(ingredient('250', 'ml'))),
             meal(2, recipe(ingredient('1', 'cup'))), meal(3)]
    result = aggregate_period(ALICE, PERIOD, DAY, meals)
    assert len(result.items) == 1
    assert {q.unit: q.amount for q in result.items[0].required} == {'g': '100', 'ml': '500'}
    assert result.items[0].pricing_status == 'needs_review'
    assert any(w.code == 'INCOMPATIBLE_UNITS' for w in result.warnings)


def test_notes_leftovers_and_unavailable_recipes_have_distinct_counts():
    meals = [meal(1), meal(2, is_leftover=True), meal(3, free_text='Restaurant'),
             replace(meal(4), recipe=None, has_recipe_reference=False)]
    result = aggregate_period(ALICE, PERIOD, DAY, meals)
    assert (result.included_meal_count, result.skipped_note_count, result.skipped_leftover_count) == (1, 1, 1)
    assert len(result.excluded_meals) == 1 and result.items[0].required[0].amount == '100'
    assert result.excluded_meals[0].meal_entry_id == UUID(int=4)
    assert any(w.code == 'CALENDAR_PARTIAL' for w in result.warnings)


def test_future_exclusions_leave_source_meals_counted_without_creating_needs():
    result = aggregate_period(ALICE, PERIOD, DAY, [meal(1)], excluded_ingredient_ids=frozenset({'ing_test_riz'}))
    assert result.included_meal_count == 1 and result.items == []
    assert result.excluded_ingredient_ids == ['ing_test_riz']


def test_fingerprint_and_preview_ids_are_stable_and_bound_to_account_and_inputs():
    meals = [meal(1), meal(2)]
    first = aggregate_period(ALICE, PERIOD, DAY, meals)
    assert first == aggregate_period(ALICE, PERIOD, DAY, list(reversed(meals)))
    assert first.preview_fingerprint != aggregate_period(BOB, PERIOD, DAY, meals).preview_fingerprint
    assert first.preview_fingerprint != aggregate_period(ALICE, PERIOD, date(2026, 11, 16), meals).preview_fingerprint
    renamed = replace(meals[0], recipe=replace(meals[0].recipe, name='Autre nom'))
    assert first.preview_fingerprint != aggregate_period(ALICE, PERIOD, DAY, [renamed, meals[1]]).preview_fingerprint
    assert first.preview_fingerprint != aggregate_period(ALICE, PERIOD, DAY, meals,
        excluded_ingredient_ids=frozenset({'ing_test_riz'})).preview_fingerprint


def test_recipe_names_are_not_truncated_to_list_name_limit():
    name = 'Une recette ' * 30
    result = aggregate_period(ALICE, PERIOD, DAY, [meal(1, replace(recipe(ingredient()), name=name.strip()))])
    assert result.items[0].contributions[0].recipe_name == name.strip()


def test_invalid_sources_fail_instead_of_silently_omitting_needs():
    for meals in [[meal(1), meal(1)], [meal(1, recipe())], [meal(1, recipe(ingredient(), ingredient()))]]:
        with pytest.raises(ValueError):
            aggregate_period(ALICE, PERIOD, DAY, meals)
