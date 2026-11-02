"""Courses réelles avec deux connexions au PostgreSQL local jetable."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from decimal import Decimal
import os
from threading import Barrier, Event

from alembic import command
from fastapi import HTTPException
import pytest
from sqlalchemy import create_engine, delete, event, func, inspect, insert, select, text, update
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from backend.app.accounts.models import Profile
from backend.app.catalog.models import Ingredient
from backend.app.recipes.models import Recipe, RecipeIngredient, RecipeRating
from backend.app.recipes.schemas import RecipeRatingWrite, RecipeWrite
from backend.app.recipes.service import set_rating, get_recipe, update_recipe
from backend.tests.test_accounts import ALICE, BOB
from backend.tests.test_ingredient_import import alembic_config

RECIPE_ID = 'recipe_rating_concurrency'
VOTE = RecipeRatingWrite(recipe_version=1, taste_score=5, reliability_score=4, ease_score=3)


@pytest.fixture
def concurrent_database():
    value = os.getenv('OPTIMEAL_TEST_DATABASE_URL')
    if not value:
        pytest.skip('PostgreSQL local jetable requis pour les tests concurrents.')
    url = make_url(value)
    if url.host not in ('localhost', '127.0.0.1') or not (url.database or '').startswith('optimeal_test_'):
        pytest.fail('Les tests concurrents exigent une base locale optimeal_test_… ; jamais Supabase.')
    engine = create_engine(url, connect_args={'options': '-c lock_timeout=5000 -c statement_timeout=10000'})
    try:
        with engine.begin() as connection:
            # Les transactions des autres fixtures sont annulées. Ce test
            # exige une base vide et refuse de nettoyer une base déjà remplie.
            if inspect(connection).get_table_names(schema='public'):
                pytest.fail('Les tests concurrents nécessitent une base locale vide, sans autres tests simultanés.')
            connection.execute(text('CREATE SCHEMA IF NOT EXISTS auth'))
            connection.execute(text('CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY)'))
            command.upgrade(alembic_config(connection), 'head')
            for user in (ALICE, BOB):
                connection.execute(text('INSERT INTO auth.users(id) VALUES (:id)'), {'id': user.id})
                connection.execute(insert(Profile).values(id=user.id))
            connection.execute(insert(Ingredient).values(id='ing_rating_test', name='Test', category='Test', aliases=[]))
            connection.execute(insert(Recipe).values(
                id=RECIPE_ID, owner_id=ALICE.id, name='Recette concurrente', description='Test de verrou',
                visibility='public', published_at=datetime.now(timezone.utc), servings=2,
                prep_time_minutes=5, cook_time_minutes=0, total_time_minutes=5,
                instructions=[{'position': 1, 'text': 'Préparer.'}]))
            connection.execute(insert(RecipeIngredient).values(recipe_id=RECIPE_ID, ingredient_id='ing_rating_test',
                                                               position=1, quantity=Decimal(1), unit='g'))
        try:
            yield engine
        finally:
            with engine.begin() as connection:
                connection.execute(delete(Recipe).where(Recipe.id == RECIPE_ID))
                connection.execute(text('DELETE FROM auth.users WHERE id IN (:a, :b)'), {'a': ALICE.id, 'b': BOB.id})
                connection.execute(delete(Ingredient).where(Ingredient.id == 'ing_rating_test'))
                command.downgrade(alembic_config(connection), 'base')
                # Alembic conserve sa table vide après downgrade base.
                connection.execute(text('DROP TABLE public.alembic_version'))
    finally:
        engine.dispose()


def test_concurrent_first_votes_leave_one_complete_evaluation(concurrent_database):
    engine = concurrent_database
    barrier = Barrier(2)
    other = RecipeRatingWrite(recipe_version=1, taste_score=1, reliability_score=2, ease_score=5)

    def submit(body):
        with Session(engine) as db:
            barrier.wait(timeout=5)
            return set_rating(db, RECIPE_ID, body, BOB)

    with ThreadPoolExecutor(max_workers=2) as executor:
        first = executor.submit(submit, VOTE)
        second = executor.submit(submit, other)
        assert first.result(timeout=15).rating.count == 1
        assert second.result(timeout=15).rating.count == 1
    with engine.connect() as connection:
        rows = connection.execute(select(RecipeRating.__table__)).mappings().all()
        assert len(rows) == 1
        assert tuple(rows[0][key] for key in ('taste_score', 'reliability_score', 'ease_score')) in ((5, 4, 3), (1, 2, 5))


def test_unpublication_winning_the_lock_prevents_a_waiting_vote(concurrent_database):
    engine = concurrent_database
    attempting_vote = Event()

    def record(conn, cursor, statement, parameters, context, executemany):
        if 'FOR UPDATE' in statement:
            attempting_vote.set()

    def submit():
        with Session(engine) as db:
            return set_rating(db, RECIPE_ID, VOTE, BOB)

    with Session(engine) as owner:
        owner.execute(select(Recipe.id).where(Recipe.id == RECIPE_ID).with_for_update()).one()
        event.listen(engine, 'before_cursor_execute', record)
        try:
            with ThreadPoolExecutor(max_workers=1) as executor:
                pending = executor.submit(submit)
                try:
                    assert attempting_vote.wait(timeout=5)
                    owner.execute(update(Recipe).where(Recipe.id == RECIPE_ID)
                                  .values(visibility='private', published_at=None))
                    owner.commit()
                    with pytest.raises(HTTPException) as error:
                        pending.result(timeout=15)
                    assert error.value.status_code == 404
                finally:
                    # Libérer le verrou même si une assertion échoue.
                    owner.rollback()
        finally:
            event.remove(engine, 'before_cursor_execute', record)
    with engine.connect() as connection:
        assert connection.scalar(select(func.count()).select_from(RecipeRating)) == 0


def test_content_edit_winning_the_lock_rejects_a_vote_for_the_previous_version(concurrent_database):
    engine = concurrent_database
    attempting_vote = Event()

    def record(conn, cursor, statement, parameters, context, executemany):
        if 'FOR UPDATE' in statement:
            attempting_vote.set()

    def submit():
        with Session(engine) as db:
            return set_rating(db, RECIPE_ID, VOTE, BOB)

    with Session(engine) as owner:
        owner.execute(select(Recipe.id).where(Recipe.id == RECIPE_ID).with_for_update()).one()
        current = get_recipe(owner, RECIPE_ID, ALICE.id)
        payload = current.model_dump(include=set(RecipeWrite.model_fields))
        payload['instructions'][0]['text'] += ' Étape modifiée.'
        changed = RecipeWrite.model_validate(payload)
        event.listen(engine, 'before_cursor_execute', record)
        try:
            with ThreadPoolExecutor(max_workers=1) as executor:
                pending = executor.submit(submit)
                try:
                    assert attempting_vote.wait(timeout=5)
                    assert update_recipe(owner, RECIPE_ID, changed, ALICE).content_version == 2
                    with pytest.raises(HTTPException) as error:
                        pending.result(timeout=15)
                    assert error.value.status_code == 409
                    assert error.value.detail['code'] == 'RECIPE_VERSION_CONFLICT'
                finally:
                    owner.rollback()
        finally:
            event.remove(engine, 'before_cursor_execute', record)
    with engine.connect() as connection:
        assert connection.scalar(select(func.count()).select_from(RecipeRating)) == 0
