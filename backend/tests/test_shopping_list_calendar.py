"""Périodes privées et instantanés cohérents sur PostgreSQL local jetable."""
from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import delete, event, func, insert, select, update
from sqlalchemy.orm import Session

from backend.app.catalog.models import Ingredient
from backend.app.planning.models import MealPlanEntry
from backend.app.recipes.models import Recipe, RecipeIngredient
from backend.app.shopping_lists import calendar
from backend.app.shopping_lists.errors import ShoppingListError
from backend.app.shopping_lists.models import ShoppingList, ShoppingListCommand, ShoppingListRevision
from backend.app.shopping_lists.schemas import ShoppingCalendarPreviewWrite, ShoppingFromCalendar
from backend.tests.test_accounts import ALICE, BOB
from backend.tests.test_recipe_rating_concurrency import concurrent_database  # noqa: F401

RICE = 'ing_calendar_riz'
MILK = 'ing_calendar_lait'
RECIPE = 'recipe_calendar_riz'
OTHER = 'recipe_calendar_other'
REQUEST = ShoppingCalendarPreviewWrite(start_date='2026-11-16', end_date='2026-11-29', purchase_date='2026-11-15')


@pytest.fixture
def database(concurrent_database):
    engine = concurrent_database
    with engine.begin() as connection:
        connection.execute(insert(Ingredient), [
            {'id': RICE, 'name': 'Riz', 'category': 'Épicerie', 'aliases': []},
            {'id': MILK, 'name': 'Lait', 'category': 'Produits laitiers', 'aliases': []}])
        for recipe_id, owner in [(RECIPE, ALICE), (OTHER, BOB)]:
            connection.execute(insert(Recipe).values(id=recipe_id, owner_id=owner.id,
                name='Recette privée', visibility='private', description='Test', servings=2,
                prep_time_minutes=0, cook_time_minutes=0, total_time_minutes=0,
                instructions=[{'position': 1, 'text': 'Préparer.'}]))
            connection.execute(insert(RecipeIngredient).values(recipe_id=recipe_id,
                ingredient_id=RICE, position=1, quantity=Decimal('100'), unit='g'))
    try:
        yield engine
    finally:
        with engine.begin() as connection:
            connection.execute(delete(MealPlanEntry).where(MealPlanEntry.recipe_id.in_([RECIPE, OTHER])))
            connection.execute(delete(Recipe).where(Recipe.id.in_([RECIPE, OTHER])))
            connection.execute(delete(Ingredient).where(Ingredient.id.in_([RICE, MILK])))


def add_meal(engine, *, user=ALICE, day=16, recipe_id=RECIPE, servings=2, leftover=False, free_text=None):
    meal_id = uuid4()
    with engine.begin() as connection:
        connection.execute(insert(MealPlanEntry).values(id=meal_id, user_id=user.id,
            date=date(2026, 11, day), meal='souper', recipe_id=recipe_id,
            free_text=free_text, servings=servings, is_leftover=leftover))
    return meal_id


def preview(engine, user=ALICE, body=REQUEST):
    with Session(engine) as db:
        return calendar.preview_calendar(db, user, body)


def creation_request(result, **changes):
    return ShoppingFromCalendar(start_date=result.period.start_date, end_date=result.period.end_date,
        purchase_date=result.purchase_date, name='Courses',
        preview_fingerprint=result.preview_fingerprint, **changes)


def test_period_spans_weeks_includes_bounds_and_only_own_accessible_meals(database):
    add_meal(database, day=15)
    add_meal(database, day=16)
    add_meal(database, day=29, servings=4)
    add_meal(database, day=30)
    add_meal(database, day=17, leftover=True)
    add_meal(database, day=18, recipe_id=None, free_text='Restaurant')
    add_meal(database, user=BOB, recipe_id=OTHER, day=20)
    result = preview(database)
    assert (result.included_meal_count, result.skipped_note_count, result.skipped_leftover_count) == (2, 1, 1)
    assert result.items[0].required[0].amount == '300'
    assert all(c.recipe_id == RECIPE for c in result.items[0].contributions)
    assert result == preview(database)


def test_foreign_private_recipe_is_excluded_without_exposing_its_name(database):
    add_meal(database)
    hidden_id = add_meal(database, recipe_id=OTHER)
    result = preview(database)
    assert result.included_meal_count == 1
    assert [m.meal_entry_id for m in result.excluded_meals] == [hidden_id]
    assert OTHER not in result.model_dump_json()
    with Session(database) as db, pytest.raises(ShoppingListError) as exc:
        calendar.validate_calendar_preview(db, ALICE, creation_request(result))
    assert exc.value.code == 'PARTIAL_CALENDAR_CONFIRMATION_REQUIRED'
    with Session(database) as db:
        assert calendar.validate_calendar_preview(db, ALICE, creation_request(result, accept_partial=True)) == result


def test_public_recipe_of_another_account_is_included(database):
    from datetime import datetime, timezone
    with database.begin() as connection:
        connection.execute(update(Recipe).where(Recipe.id == OTHER).values(
            visibility='public', published_at=datetime.now(timezone.utc)))
    add_meal(database, recipe_id=OTHER)
    result = preview(database)
    assert result.included_meal_count == 1 and result.items[0].required[0].amount == '100'


@pytest.mark.parametrize('case', ['empty', 'notes', 'leftovers', 'missing', 'foreign'])
def test_no_usable_meal_is_an_explicit_error_and_does_not_save(database, case):
    if case == 'notes':
        add_meal(database, recipe_id=None, free_text='Restaurant')
    elif case == 'leftovers':
        add_meal(database, leftover=True)
    elif case == 'missing':
        add_meal(database, recipe_id=None)
    elif case == 'foreign':
        add_meal(database, user=BOB, recipe_id=OTHER)
    with pytest.raises(ShoppingListError) as exc:
        preview(database)
    assert exc.value.code == 'NO_PLANNED_MEALS'
    with Session(database) as db:
        for table in (ShoppingList, ShoppingListCommand, ShoppingListRevision):
            assert db.scalar(select(func.count()).select_from(table)) == 0


@pytest.mark.parametrize('change', ['portions', 'name', 'quantity', 'version', 'delete'])
def test_change_after_preview_requires_new_confirmation(database, change):
    meal_id = add_meal(database)
    result = preview(database)
    with database.begin() as connection:
        if change == 'portions':
            connection.execute(update(MealPlanEntry).where(MealPlanEntry.id == meal_id).values(servings=4))
        elif change == 'name':
            connection.execute(update(Recipe).where(Recipe.id == RECIPE).values(name='Nouveau nom'))
        elif change == 'quantity':
            connection.execute(update(RecipeIngredient).where(RecipeIngredient.recipe_id == RECIPE).values(quantity=Decimal('250')))
        elif change == 'version':
            connection.execute(update(Recipe).where(Recipe.id == RECIPE).values(content_version=2))
        else:
            connection.execute(delete(MealPlanEntry).where(MealPlanEntry.id == meal_id))
    with Session(database) as db, pytest.raises(ShoppingListError) as exc:
        calendar.validate_calendar_preview(db, ALICE, creation_request(result))
    assert exc.value.code == 'CALENDAR_PREVIEW_STALE'


def test_two_queries_use_same_snapshot_even_if_recipe_changes_between_them(database):
    add_meal(database)
    changed = False
    def intercept(conn, cursor, statement, parameters, context, executemany):
        nonlocal changed
        if not changed and statement.lstrip().startswith('SELECT') and 'recipe_ingredient' in statement:
            changed = True
            with database.begin() as writer:
                writer.execute(update(Recipe).where(Recipe.id == RECIPE).values(content_version=2))
                writer.execute(update(RecipeIngredient).where(RecipeIngredient.recipe_id == RECIPE).values(quantity=Decimal('300')))
    event.listen(database, 'before_cursor_execute', intercept)
    try:
        result = preview(database)
    finally:
        event.remove(database, 'before_cursor_execute', intercept)
    assert changed and result.items[0].required[0].amount == '100'
    assert result.items[0].contributions[0].recipe_version == 1
    later = preview(database)
    assert later.items[0].required[0].amount == '300'
    assert later.items[0].contributions[0].recipe_version == 2


def test_missing_ingredients_are_data_failure_not_an_empty_success(database):
    add_meal(database)
    with database.begin() as connection:
        connection.execute(delete(RecipeIngredient).where(RecipeIngredient.recipe_id == RECIPE))
    with pytest.raises(ShoppingListError) as exc:
        preview(database)
    assert exc.value.status == 503 and exc.value.code == 'CALENDAR_DATA_INVALID'


def test_default_date_is_resolved_and_already_open_sessions_are_not_rolled_back(database, monkeypatch):
    add_meal(database)
    monkeypatch.setattr(calendar, 'today', lambda: date(2026, 11, 15))
    body = ShoppingCalendarPreviewWrite(start_date=REQUEST.start_date, end_date=REQUEST.end_date)
    result = preview(database, body=body)
    assert result.purchase_date == date(2026, 11, 15)
    monkeypatch.setattr(calendar, 'today', lambda: date(2026, 11, 16))
    with Session(database) as db:
        assert calendar.validate_calendar_preview(db, ALICE, creation_request(result)) == result
    with Session(database) as db:
        db.execute(select(Recipe.id))
        with pytest.raises(RuntimeError):
            calendar.preview_calendar(db, ALICE, REQUEST)
        assert db.in_transaction()


def test_database_failure_does_not_turn_into_empty_preview_and_releases_session(database, monkeypatch):
    from sqlalchemy.exc import OperationalError
    def unavailable(*args):
        raise OperationalError('lecture du calendrier', None, Exception('base indisponible'))
    monkeypatch.setattr(calendar, '_read_period', unavailable)
    with Session(database) as db:
        with pytest.raises(OperationalError):
            calendar.preview_calendar(db, ALICE, REQUEST)
        assert not db.in_transaction()


def test_query_count_does_not_grow_with_the_number_of_meals(database):
    for _ in range(10):
        add_meal(database)
    statements = []
    def record(conn, cursor, statement, parameters, context, executemany):
        if statement.lstrip().startswith('SELECT'):
            statements.append(statement)
    event.listen(database, 'before_cursor_execute', record)
    try:
        result = preview(database)
    finally:
        event.remove(database, 'before_cursor_execute', record)
    assert result.included_meal_count == 10 and result.items[0].required[0].amount == '1000'
    assert len(statements) == 3  # préférences + repas + ingrédients, sans boucle par repas
