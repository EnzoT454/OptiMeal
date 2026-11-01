"""Migration et import commun : validation hors réseau et intégration PostgreSQL isolée."""
import io
import json
import os
from pathlib import Path
import sys
from unittest.mock import Mock

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
import pytest
from sqlalchemy import create_engine, func, inspect, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError, OperationalError

from backend.app.catalog.ingredient_import import read_ingredients, upsert_ingredients
from backend.app.catalog.models import Ingredient
from backend.app.common.public_data import DEFAULT_CATALOG, ROOT
from backend.app.config import Settings
from backend.cli import import_ingredients as cli


def alembic_config(connection=None):
    config = Config(str(ROOT / 'backend/alembic.ini'))
    if connection is not None:
        config.attributes['connection'] = connection
    return config


def test_read_only_ingredient_fields_and_references():
    rows = read_ingredients(DEFAULT_CATALOG)
    assert len(rows) == len({r['id'] for r in rows}) == 31
    assert all(set(r) == {'id', 'name', 'category', 'aliases'} for r in rows)
    recipes = json.loads((ROOT / 'data/recipes/initial_recipes.json').read_text(encoding='utf-8'))
    assert {i['ingredient_id'] for r in recipes['recipes'] for i in r['ingredients']} <= {r['id'] for r in rows}


@pytest.mark.parametrize('failure', ['duplicate', 'unknown_id', 'blank_name', 'blank_alias', 'empty'])
def test_invalid_input_is_rejected_before_any_connection(tmp_path, monkeypatch, capsys, failure):
    data = json.loads(DEFAULT_CATALOG.read_text(encoding='utf-8'))
    if failure == 'duplicate':
        data['ingredients'][1]['id'] = data['ingredients'][0]['id']
    elif failure == 'unknown_id':
        data['ingredients'][0]['id'] = '4'
    elif failure == 'blank_name':
        data['ingredients'][0]['name'] = '   '
    elif failure == 'blank_alias':
        data['ingredients'][0]['aliases'].append('')
    else:
        data.update(ingredients=[], ingredient_count=0, product_count=0)
    path = tmp_path / 'invalid.json'
    path.write_text(json.dumps(data), encoding='utf-8')
    monkeypatch.setattr(cli, 'load_settings', lambda: Settings())
    monkeypatch.setattr(cli, 'Database', lambda *args: pytest.fail('Aucune connexion avant validation'))
    monkeypatch.setattr(sys, 'argv', ['import-ingredients', '--input', str(path)])
    assert cli.main() == 1
    assert 'Import impossible' in capsys.readouterr().err


def test_cli_missing_database_is_a_clean_error(monkeypatch, capsys):
    monkeypatch.setattr(cli, 'load_settings', lambda: Settings())
    monkeypatch.setattr(sys, 'argv', ['import-ingredients'])
    assert cli.main() == 1
    assert 'DATABASE_URL absente' in capsys.readouterr().err


def test_cli_database_error_does_not_expose_credentials(monkeypatch, capsys):
    database = Mock()
    database.engine.begin.side_effect = OperationalError(None, None, Exception('private-test-password'))
    monkeypatch.setattr(cli, 'Database', lambda *args: database)
    monkeypatch.setattr(cli, 'load_settings', lambda: Settings(database_url='private-test-password'))
    monkeypatch.setattr(sys, 'argv', ['import-ingredients'])
    assert cli.main() == 1
    assert 'private-test-password' not in capsys.readouterr().err
    database.dispose.assert_called_once()


def test_offline_migration_and_single_head_need_no_database(monkeypatch):
    monkeypatch.setenv('DATABASE_URL', '')
    config = alembic_config()
    output = io.StringIO()
    config.output_buffer = output
    command.upgrade(config, '0001_ingredients', sql=True)
    sql = output.getvalue()
    assert 'CREATE TABLE public.ingredient' in sql
    assert 'aliases TEXT[]' in sql
    assert 'ALTER TABLE public.ingredient ENABLE ROW LEVEL SECURITY' in sql
    assert 'ck_ingredient_id_format CHECK' in sql
    assert 'ck_ingredient_ck_' not in sql
    assert sql.count('CREATE TABLE') == 2  # ingredient et suivi Alembic uniquement
    assert 'auth.' not in sql and 'storage.' not in sql
    assert ScriptDirectory.from_config(config).get_heads() == ['0009_recipe_visibility']


@pytest.fixture
def postgres():
    value = os.getenv('OPTIMEAL_TEST_DATABASE_URL')
    if not value:
        pytest.skip('Définir OPTIMEAL_TEST_DATABASE_URL vers un PostgreSQL local de test jetable.')
    url = make_url(value)
    if url.host not in ('localhost', '127.0.0.1') or not (url.database or '').startswith('optimeal_test_'):
        pytest.fail('Les tests PostgreSQL exigent une base locale nommée optimeal_test_… ; jamais Supabase.')
    engine = create_engine(url)
    try:
        with engine.connect() as connection:
            # La migration et les données de chaque test sont annulées ensemble.
            transaction = connection.begin()
            try:
                connection.execute(text('CREATE SCHEMA IF NOT EXISTS auth'))
                connection.execute(text('CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY)'))
                command.upgrade(alembic_config(connection), 'head')
                yield connection
            finally:
                transaction.rollback()
    finally:
        engine.dispose()


def ingredient_count(connection):
    return connection.scalar(select(func.count()).select_from(Ingredient))


def test_postgres_migration_matches_model_and_keeps_rls(postgres):
    columns = inspect(postgres).get_columns('ingredient', schema='public')
    assert {c['name'] for c in columns} == {'id', 'name', 'category', 'aliases'}
    assert all(not c['nullable'] for c in columns)
    assert postgres.scalar(text("SELECT relrowsecurity FROM pg_class WHERE oid='public.ingredient'::regclass")) is True
    assert postgres.scalar(text('SELECT version_num FROM public.alembic_version')) == '0009_recipe_visibility'
    command.check(alembic_config(postgres))


def test_postgres_import_twice_changes_nothing_second_time(postgres):
    rows = read_ingredients(DEFAULT_CATALOG)
    first = upsert_ingredients(postgres, rows)
    second = upsert_ingredients(postgres, rows)
    assert (first.processed, first.changed, first.total) == (31, 31, 31)
    assert (second.processed, second.changed, second.total) == (31, 0, 31)
    actual = postgres.execute(select(Ingredient.__table__)).mappings().all()
    assert sorted(map(dict, actual), key=lambda r: r['id']) == sorted(rows, key=lambda r: r['id'])
    command.upgrade(alembic_config(postgres), 'head')
    assert ingredient_count(postgres) == 31


def test_postgres_updates_existing_key_and_preserves_absent_ingredients(postgres):
    rows = read_ingredients(DEFAULT_CATALOG)
    upsert_ingredients(postgres, rows)
    extra = {'id': 'ing_test_extra', 'name': 'Ingrédient conservé', 'category': 'Test', 'aliases': []}
    upsert_ingredients(postgres, [extra])
    rows[0] = {**rows[0], 'name': 'Nom actualisé', 'aliases': ['alias actualisé']}
    result = upsert_ingredients(postgres, rows)
    assert (result.changed, result.total) == (1, 32)
    assert postgres.scalar(select(Ingredient.name).where(Ingredient.id == rows[0]['id'])) == 'Nom actualisé'
    assert postgres.scalar(select(Ingredient.name).where(Ingredient.id == extra['id'])) == extra['name']


def test_postgres_transaction_can_roll_back_a_later_failure(postgres):
    with pytest.raises(IntegrityError):
        with postgres.begin_nested():
            upsert_ingredients(postgres, read_ingredients(DEFAULT_CATALOG))
            postgres.execute(Ingredient.__table__.insert().values(id='4', name='Invalide', category='Test', aliases=[]))
    assert ingredient_count(postgres) == 0


def test_postgres_autogenerate_and_downgrade_ignore_unmanaged_tables(postgres):
    postgres.execute(text('CREATE TABLE public.unrelated_table (id integer PRIMARY KEY)'))
    config = alembic_config(postgres)
    command.check(config)
    command.downgrade(config, 'base')
    assert inspect(postgres).has_table('unrelated_table', schema='public')
    assert not inspect(postgres).has_table('ingredient', schema='public')
    command.upgrade(config, 'head')
    assert ingredient_count(postgres) == 0
