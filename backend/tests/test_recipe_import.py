"""Rejeu, conflits et atomicité de l’import des recettes initiales."""
from dataclasses import asdict
from decimal import Decimal
import json
import sys
from unittest.mock import MagicMock, Mock

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import OperationalError

from backend.app.catalog.ingredient_import import read_ingredients, upsert_ingredients
from backend.app.common.public_data import DEFAULT_CATALOG, DEFAULT_RECIPES
from backend.app.config import Settings
from backend.app.recipes.models import Recipe, RecipeIngredient
from backend.app.recipes.seed_import import import_recipes, read_recipes, recipe_rows
from backend.cli import import_recipes as cli
from backend.tests.test_ingredient_import import postgres  # noqa: F401


@pytest.mark.parametrize('failure', ['duplicate', 'empty', 'quantity', 'steps'])
def test_invalid_file_is_rejected_before_database(tmp_path, monkeypatch, capsys, failure):
    data = json.loads(DEFAULT_RECIPES.read_text())
    if failure == 'duplicate':
        data['recipes'].append(data['recipes'][0])
    elif failure == 'empty':
        data['recipes'] = []
    elif failure == 'quantity':
        data['recipes'][0]['ingredients'][0]['quantity'] = '0'
    else:
        data['recipes'][0]['instructions'][0]['position'] = 2
    path = tmp_path / 'invalid.json'
    path.write_text(json.dumps(data))
    monkeypatch.setattr(sys, 'argv', ['import-recipes', '--input', str(path)])
    monkeypatch.setattr(cli, 'load_settings', lambda: Settings())
    monkeypatch.setattr(cli, 'Database', lambda *args: pytest.fail('Connexion avant validation'))
    assert cli.main() == 1
    assert 'Import impossible' in capsys.readouterr().err


def test_missing_database_is_reported_cleanly(monkeypatch, capsys):
    monkeypatch.setattr(sys, 'argv', ['import-recipes'])
    monkeypatch.setattr(cli, 'load_settings', lambda: Settings())
    assert cli.main() == 1
    assert 'DATABASE_URL absente' in capsys.readouterr().err


def test_database_errors_do_not_expose_credentials(monkeypatch, capsys):
    database = Mock()
    database.engine.begin.side_effect = OperationalError(None, None, Exception('private-password'))
    monkeypatch.setattr(sys, 'argv', ['import-recipes'])
    monkeypatch.setattr(cli, 'load_settings', lambda: Settings())
    monkeypatch.setattr(cli, 'Database', lambda *args: database)
    assert cli.main() == 1
    output = capsys.readouterr().err
    assert 'OperationalError' in output and 'private-password' not in output
    database.dispose.assert_called_once()


def test_cli_uses_configured_path_and_reports_committed_import(monkeypatch, capsys):
    database = MagicMock()
    monkeypatch.setattr(sys, 'argv', ['import-recipes'])
    monkeypatch.setattr(cli, 'load_settings', lambda: Settings(recipe_seed_path=str(DEFAULT_RECIPES)))
    monkeypatch.setattr(cli, 'Database', lambda *args: database)
    importer = Mock(return_value=Mock(processed=10, inserted=10, unchanged=0, total=10, ingredient_links=60))
    monkeypatch.setattr(cli, 'import_recipes', importer)
    assert cli.main() == 0
    assert len(importer.call_args.args[1]) == 10
    assert '10 ajoutées' in capsys.readouterr().out
    database.engine.begin.return_value.__exit__.assert_called_once_with(None, None, None)
    database.dispose.assert_called_once()


def test_second_import_preserves_every_recipe_and_link(postgres):
    upsert_ingredients(postgres, read_ingredients(DEFAULT_CATALOG))
    seeds = read_recipes(DEFAULT_RECIPES)
    links_count = sum(len(recipe.ingredients) for recipe in seeds)
    first = import_recipes(postgres, seeds)
    assert asdict(first) == dict(processed=10, inserted=10, unchanged=0, total=10, ingredient_links=links_count)
    second = import_recipes(postgres, seeds)
    assert asdict(second) == dict(processed=10, inserted=0, unchanged=10, total=10, ingredient_links=links_count)
    for seed in seeds:
        recipe, links = recipe_rows(seed)
        actual = postgres.execute(select(Recipe.__table__).where(Recipe.id == recipe['id'])).mappings().one()
        assert dict(actual) == recipe
        actual_links = postgres.execute(select(RecipeIngredient.__table__).where(
            RecipeIngredient.recipe_id == recipe['id'],
        ).order_by(RecipeIngredient.position)).mappings().all()
        assert list(map(dict, actual_links)) == links


def test_missing_ingredients_prevent_any_recipe_write(postgres):
    with pytest.raises(ValueError, match='Ingrédients absents'), postgres.begin_nested():
        import_recipes(postgres, read_recipes(DEFAULT_RECIPES))
    assert postgres.scalar(select(func.count()).select_from(Recipe)) == 0


@pytest.mark.parametrize('change', ['name', 'quantity', 'position', 'missing_link', 'review'])
def test_existing_edits_cause_conflict_and_rollback_other_new_recipes(postgres, change):
    upsert_ingredients(postgres, read_ingredients(DEFAULT_CATALOG))
    seeds = sorted(read_recipes(DEFAULT_RECIPES), key=lambda recipe: recipe.seed_key)
    last = seeds[-1]
    import_recipes(postgres, [last])
    recipe_id = 'recipe_' + last.seed_key
    if change == 'name':
        postgres.execute(Recipe.__table__.update().where(Recipe.id == recipe_id).values(name='Nom corrigé'))
    elif change == 'review':
        postgres.execute(Recipe.__table__.update().where(Recipe.id == recipe_id).values(review_required=False))
    else:
        condition = (RecipeIngredient.recipe_id == recipe_id) & (RecipeIngredient.position == 1)
        if change == 'missing_link':
            postgres.execute(RecipeIngredient.__table__.delete().where(condition))
        else:
            values = {'quantity': Decimal('999')} if change == 'quantity' else {'position': 999}
            postgres.execute(RecipeIngredient.__table__.update().where(condition).values(**values))
    before_recipes = postgres.execute(select(Recipe.__table__)).all()
    before_links = postgres.execute(select(RecipeIngredient.__table__)).all()
    # Les neuf premières recettes ajoutées dans ce passage doivent être annulées.
    with pytest.raises(ValueError, match='Conflit'), postgres.begin_nested():
        import_recipes(postgres, seeds)
    assert postgres.execute(select(Recipe.__table__)).all() == before_recipes
    assert postgres.execute(select(RecipeIngredient.__table__)).all() == before_links


def test_import_preserves_recipes_absent_from_input_and_exact_decimals(postgres):
    upsert_ingredients(postgres, read_ingredients(DEFAULT_CATALOG))
    seeds = read_recipes(DEFAULT_RECIPES)
    extra = seeds[0].model_copy(deep=True)
    extra.seed_key = 'extra_test'
    extra.ingredients[0].unit = 'g'
    extra.ingredients[0].quantity = '0.123456789012345678901'
    import_recipes(postgres, [extra])
    result = import_recipes(postgres, seeds)
    assert result.total == 11
    assert postgres.scalar(select(RecipeIngredient.quantity).where(
        RecipeIngredient.recipe_id == 'recipe_extra_test', RecipeIngredient.position == 1,
    )) == Decimal('0.123456789012345678901')


def test_identity_collision_is_not_silently_skipped(postgres):
    upsert_ingredients(postgres, read_ingredients(DEFAULT_CATALOG))
    seed = read_recipes(DEFAULT_RECIPES)[0]
    recipe, _ = recipe_rows(seed)
    postgres.execute(Recipe.__table__.insert().values(**{**recipe, 'id': 'recipe_other'}))
    with pytest.raises(ValueError, match='Conflit'), postgres.begin_nested():
        import_recipes(postgres, [seed])
    assert postgres.scalar(select(func.count()).select_from(Recipe)) == 1
