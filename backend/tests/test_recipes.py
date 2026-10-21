"""Intégrité des tables de recettes sur un PostgreSQL local jetable."""
from decimal import Decimal
import io

from alembic import command
import pytest
from sqlalchemy import func, inspect, select, text
from sqlalchemy.exc import IntegrityError

from backend.app.catalog.ingredient_import import read_ingredients, upsert_ingredients
from backend.app.catalog.models import Ingredient
from backend.app.common.public_data import DEFAULT_CATALOG, ROOT
from backend.app.recipes.models import Recipe, RecipeIngredient
from backend.app.recipes.schemas import RecipeSeedDocument
from backend.tests.test_ingredient_import import alembic_config, postgres  # noqa: F401


def recipe_values():
    return dict(
        id='recipe_test', seed_key='test', name='Recette de test', description='Description',
        servings=2, prep_time_minutes=5, cook_time_minutes=10, total_time_minutes=15,
        image_url=None, instructions=[{'position': 1, 'text': 'Préparer.'}],
    )


def insert_recipe(connection):
    rows = read_ingredients(DEFAULT_CATALOG)
    upsert_ingredients(connection, rows)
    connection.execute(Recipe.__table__.insert().values(**recipe_values()))
    return dict(recipe_id='recipe_test', ingredient_id=rows[0]['id'], position=1,
                quantity=Decimal('1.1234567890123456789'), unit='g', preparation=None)


def test_recipe_offline_migration_has_one_chain_and_no_seed_data(monkeypatch):
    monkeypatch.setenv('DATABASE_URL', '')
    config = alembic_config()
    config.output_buffer = io.StringIO()
    command.upgrade(config, '0001_ingredients:head', sql=True)
    sql = config.output_buffer.getvalue()
    assert 'CREATE TABLE public.recipe (' in sql
    assert 'CREATE TABLE public.recipe_ingredient (' in sql
    assert 'REFERENCES public.ingredient (id) ON DELETE RESTRICT' in sql
    assert 'quantity NUMERIC NOT NULL' in sql
    assert 'ALTER TABLE public.recipe ENABLE ROW LEVEL SECURITY' in sql
    assert 'ALTER TABLE public.recipe_ingredient ENABLE ROW LEVEL SECURITY' in sql
    assert 'INSERT INTO public.recipe' not in sql


def test_recipe_schema_rls_and_model_match(postgres):
    command.check(alembic_config(postgres))
    for table in ('recipe', 'recipe_ingredient'):
        assert inspect(postgres).has_table(table, schema='public')
        assert postgres.scalar(text(
            "SELECT relrowsecurity FROM pg_class WHERE oid=CAST(:name AS regclass)"
        ), {'name': f'public.{table}'}) is True
    row = insert_recipe(postgres)
    postgres.execute(RecipeIngredient.__table__.insert().values(**row))
    assert postgres.scalar(select(RecipeIngredient.quantity)) == row['quantity']
    assert postgres.scalar(select(Recipe.review_required)) is True


@pytest.mark.parametrize('changes', [
    {'servings': 0}, {'prep_time_minutes': -1, 'total_time_minutes': 9},
    {'cook_time_minutes': -1, 'total_time_minutes': 4}, {'total_time_minutes': 99},
    {'name': ' '}, {'description': ''}, {'id': 'invalid'}, {'seed_key': 'bad key'},
    {'instructions': []}, {'instructions': {}},
])
def test_recipe_invalid_fields_are_rejected(postgres, changes):
    values = {**recipe_values(), **changes}
    with pytest.raises(IntegrityError), postgres.begin_nested():
        postgres.execute(Recipe.__table__.insert().values(**values))


@pytest.mark.parametrize('changes', [
    {'quantity': Decimal('0')}, {'quantity': Decimal('-1')},
    {'quantity': Decimal('NaN')}, {'quantity': Decimal('Infinity')},
    {'quantity': Decimal('-Infinity')}, {'unit': 'kg'}, {'unit': 'unit', 'quantity': Decimal('1.5')},
    {'position': 0}, {'ingredient_id': 'ing_missing'}, {'recipe_id': 'recipe_missing'},
])
def test_recipe_ingredient_invalid_fields_are_rejected(postgres, changes):
    values = {**insert_recipe(postgres), **changes}
    with pytest.raises(IntegrityError), postgres.begin_nested():
        postgres.execute(RecipeIngredient.__table__.insert().values(**values))


def test_unique_links_positions_and_seed_keys(postgres):
    row = insert_recipe(postgres)
    postgres.execute(RecipeIngredient.__table__.insert().values(**row))
    other = read_ingredients(DEFAULT_CATALOG)[1]['id']
    for changes in ({'position': 2}, {'ingredient_id': other}):
        with pytest.raises(IntegrityError), postgres.begin_nested():
            postgres.execute(RecipeIngredient.__table__.insert().values(**{**row, **changes}))
    with pytest.raises(IntegrityError), postgres.begin_nested():
        postgres.execute(Recipe.__table__.insert().values(**{**recipe_values(), 'id': 'recipe_other'}))


def test_delete_recipe_cascades_only_its_links_and_ingredient_is_protected(postgres):
    row = insert_recipe(postgres)
    postgres.execute(RecipeIngredient.__table__.insert().values(**row))
    with pytest.raises(IntegrityError), postgres.begin_nested():
        postgres.execute(Ingredient.__table__.delete().where(Ingredient.id == row['ingredient_id']))
    postgres.execute(Recipe.__table__.delete().where(Recipe.id == row['recipe_id']))
    assert postgres.scalar(select(func.count()).select_from(RecipeIngredient)) == 0
    assert postgres.scalar(select(func.count()).select_from(Ingredient)) == 31


def test_all_initial_recipes_fit_schema_without_loss(postgres):
    upsert_ingredients(postgres, read_ingredients(DEFAULT_CATALOG))
    document = RecipeSeedDocument.model_validate_json((ROOT / 'data/recipes/initial_recipes.json').read_text())
    for recipe in document.recipes:
        values = recipe.model_dump(exclude={'ingredients'})
        recipe_id = 'recipe_' + recipe.seed_key
        postgres.execute(Recipe.__table__.insert().values(id=recipe_id, **values))
        for position, ingredient in enumerate(recipe.ingredients, start=1):
            fields = ingredient.model_dump()
            fields['quantity'] = Decimal(fields['quantity'])
            postgres.execute(RecipeIngredient.__table__.insert().values(
                recipe_id=recipe_id, position=position, **fields,
            ))
    assert postgres.scalar(select(func.count()).select_from(Recipe)) == 10
    assert postgres.scalar(select(func.count()).select_from(RecipeIngredient)) == sum(
        len(recipe.ingredients) for recipe in document.recipes
    )


def test_recipe_downgrade_preserves_ingredient_data_and_can_upgrade_again(postgres):
    insert_recipe(postgres)
    config = alembic_config(postgres)
    command.downgrade(config, '0001_ingredients')
    assert postgres.scalar(select(func.count()).select_from(Ingredient)) == 31
    assert not inspect(postgres).has_table('recipe', schema='public')
    assert not inspect(postgres).has_table('recipe_ingredient', schema='public')
    command.upgrade(config, 'head')
    command.check(config)
    assert postgres.scalar(select(func.count()).select_from(Recipe)) == 0
