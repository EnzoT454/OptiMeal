"""Importer le référentiel commun après application des migrations Alembic."""
import argparse
from pathlib import Path
import sys

from sqlalchemy.exc import SQLAlchemyError

from backend.app.catalog.ingredient_import import read_ingredients, upsert_ingredients
from backend.app.common.public_data import DEFAULT_CATALOG, ROOT
from backend.app.config import load_settings
from backend.app.database import Database


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, help='Catalogue commun ; chemins relatifs à la racine.')
    args = parser.parse_args()
    database = None
    try:
        settings = load_settings()
        path = ROOT / (args.input or settings.common_catalog_path or DEFAULT_CATALOG)
        # Toute la validation précède l'ouverture d'une connexion ou une écriture.
        rows = read_ingredients(path)
        database = Database(settings.database_url)
        if database.engine is None:
            raise ValueError('DATABASE_URL absente ou invalide pour PostgreSQL/Psycopg.')
        with database.engine.begin() as connection:
            result = upsert_ingredients(connection, rows)
        print(f'{result.processed} ingrédients traités ; {result.changed} insérés ou actualisés ; '
              f'{result.total} ingrédients en base.')
        return 0
    except (OSError, ValueError) as exc:
        # Les erreurs concernent le fichier public ou la configuration manquante.
        print(f'Import impossible : {exc}', file=sys.stderr)
        return 1
    except SQLAlchemyError as exc:
        print(f'Import PostgreSQL impossible ({type(exc).__name__}) : '
              'vérifier la connexion et appliquer les migrations. Aucune transaction partielle validée.',
              file=sys.stderr)
        return 1
    finally:
        if database is not None:
            database.dispose()


if __name__ == '__main__':
    raise SystemExit(main())
