"""Contraintes et cascades des évaluations sur PostgreSQL local jetable."""
import io
from uuid import uuid4

from alembic import command
import pytest
from sqlalchemy import delete, func, inspect, insert, select, text, update
from sqlalchemy.exc import DBAPIError, IntegrityError

from backend.app.accounts.models import Profile
from backend.app.recipes.models import Recipe, RecipeRating
from backend.tests.test_accounts import ALICE, BOB, accounts, body, login  # noqa: F401
from backend.tests.test_ingredient_import import alembic_config, postgres  # noqa: F401


def prepare(accounts, connection):
    client, app = accounts
    for user in (ALICE, BOB):
        login(app, user)
        assert client.get('/api/v1/me').status_code == 200
    recipe_id = connection.scalar(select(Recipe.id).order_by(Recipe.id))
    return dict(recipe_id=recipe_id, user_id=ALICE.id,
                taste_score=5, reliability_score=4, ease_score=3)


def test_rating_migration_offline_needs_no_database():
    config = alembic_config()
    config.output_buffer = io.StringIO()
    command.upgrade(config, '0010_preserve_meals:0011_recipe_ratings', sql=True)
    sql = config.output_buffer.getvalue()
    assert 'CREATE TABLE public.recipe_rating' in sql
    assert 'PRIMARY KEY (recipe_id, user_id)' in sql
    assert 'ALTER TABLE public.recipe_rating ENABLE ROW LEVEL SECURITY' in sql
    assert 'CREATE POLICY' not in sql


def test_rating_schema_matches_models_and_disables_direct_client_access(postgres):
    command.check(alembic_config(postgres))
    columns = inspect(postgres).get_columns('recipe_rating', schema='public')
    assert all(not column['nullable'] for column in columns)
    assert postgres.scalar(text("SELECT relrowsecurity FROM pg_class WHERE oid='public.recipe_rating'::regclass"))
    assert postgres.scalar(text("SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='recipe_rating'")) == 0


@pytest.mark.parametrize('field', ['taste_score', 'reliability_score', 'ease_score'])
@pytest.mark.parametrize('value', [0, 6, -1, None])
def test_rating_rejects_invalid_or_missing_scores(accounts, postgres, field, value):
    values = prepare(accounts, postgres)
    with pytest.raises(IntegrityError), postgres.begin_nested():
        postgres.execute(insert(RecipeRating).values(**{**values, field: value}))
    assert postgres.scalar(select(func.count()).select_from(RecipeRating)) == 0


def test_rating_uniqueness_timestamps_and_multiple_accounts(accounts, postgres):
    values = prepare(accounts, postgres)
    postgres.execute(insert(RecipeRating).values(**values))
    original = postgres.execute(select(RecipeRating.__table__)).mappings().one()
    assert original['created_at'].tzinfo is not None and original['updated_at'].tzinfo is not None
    with pytest.raises(IntegrityError), postgres.begin_nested():
        postgres.execute(insert(RecipeRating).values(**values))
    postgres.execute(insert(RecipeRating).values(**{**values, 'user_id': BOB.id, 'taste_score': 1, 'ease_score': 5}))
    postgres.execute(update(RecipeRating).where(RecipeRating.user_id == ALICE.id).values(taste_score=2))
    rows = postgres.execute(select(RecipeRating.__table__)).mappings().all()
    assert len(rows) == 2
    alice = next(row for row in rows if row['user_id'] == ALICE.id)
    assert alice['taste_score'] == 2 and alice['created_at'] == original['created_at']
    assert next(row for row in rows if row['user_id'] == BOB.id)['taste_score'] == 1


@pytest.mark.parametrize('missing', ['recipe_id', 'user_id'])
def test_rating_requires_existing_recipe_and_profile(accounts, postgres, missing):
    values = prepare(accounts, postgres)
    values[missing] = 'recipe_missing' if missing == 'recipe_id' else uuid4()
    with pytest.raises(IntegrityError), postgres.begin_nested():
        postgres.execute(insert(RecipeRating).values(**values))


@pytest.mark.parametrize('target', ['recipe', 'profile', 'auth'])
def test_rating_cascades_without_removing_other_accounts_or_recipes(accounts, postgres, target):
    values = prepare(accounts, postgres)
    postgres.execute(insert(RecipeRating).values(**values))
    postgres.execute(insert(RecipeRating).values(**{**values, 'user_id': BOB.id}))
    if target == 'recipe':
        postgres.execute(delete(Recipe).where(Recipe.id == values['recipe_id']))
    elif target == 'profile':
        postgres.execute(delete(Profile).where(Profile.id == ALICE.id))
    else:
        postgres.execute(text('DELETE FROM auth.users WHERE id=:id'), {'id': ALICE.id})
    assert postgres.scalar(select(func.count()).select_from(RecipeRating)) == (0 if target == 'recipe' else 1)
    assert postgres.scalar(select(Profile.id).where(Profile.id == BOB.id)) == BOB.id
    assert postgres.scalar(select(func.count()).select_from(Recipe)) == (9 if target == 'recipe' else 10)


def test_rating_migration_preserves_existing_data_and_reverses_when_empty(accounts, postgres):
    values = prepare(accounts, postgres)
    login(accounts[1], ALICE)
    assert accounts[0].post('/api/v1/recipes', json=body()).status_code == 201
    columns = [column for column in Recipe.__table__.c if column.name not in ('created_at', 'updated_at')]
    before = postgres.execute(select(*columns).order_by(Recipe.id)).all()
    config = alembic_config(postgres)
    command.downgrade(config, '0010_preserve_meals')
    assert 'recipe_rating' not in inspect(postgres).get_table_names()
    command.upgrade(config, 'head')
    assert before == postgres.execute(select(*columns).order_by(Recipe.id)).all()
    command.check(config)
    postgres.execute(insert(RecipeRating).values(**values))
    with pytest.raises(DBAPIError, match='des évaluations existent'), postgres.begin_nested():
        command.downgrade(config, '0010_preserve_meals')
    assert postgres.scalar(select(func.count()).select_from(RecipeRating)) == 1
