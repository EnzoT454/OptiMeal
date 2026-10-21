"""Importer les recettes initiales après les migrations et les ingrédients."""
import argparse
from pathlib import Path
import sys

from sqlalchemy.exc import SQLAlchemyError

from backend.app.common.public_data import DEFAULT_RECIPES, ROOT
from backend.app.config import load_settings
from backend.app.database import Database
from backend.app.recipes.seed_import import import_recipes, read_recipes


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, help='Fichier de recettes ; chemins relatifs à la racine.')
    args = parser.parse_args()
    database = None
    try:
        settings = load_settings()
        path = ROOT / (args.input or settings.recipe_seed_path or DEFAULT_RECIPES)
        seeds = read_recipes(path)
        database = Database(settings.database_url)
        if database.engine is None:
            raise ValueError('DATABASE_URL absente ou invalide pour PostgreSQL/Psycopg.')
        with database.engine.begin() as connection:
            result = import_recipes(connection, seeds)
        print(f'{result.processed} recettes traitées ; {result.inserted} ajoutées ; '
              f'{result.unchanged} déjà identiques ; {result.total} recettes en base ; '
              f'{result.ingredient_links} liens recette–ingrédient en base.')
        return 0
    except (OSError, ValueError) as exc:
        print(f'Import impossible : {exc}', file=sys.stderr)
        return 1
    except SQLAlchemyError as exc:
        print(f'Import PostgreSQL impossible ({type(exc).__name__}) : vérifier la connexion '
              'et appliquer les migrations. Aucune transaction partielle validée.', file=sys.stderr)
        return 1
    finally:
        if database is not None:
            database.dispose()


if __name__ == '__main__':
    raise SystemExit(main())
