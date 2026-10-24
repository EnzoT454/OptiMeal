"""Importer catégories et offres du catalogue commun, après import_ingredients."""
import argparse
from pathlib import Path
import sys

from sqlalchemy.exc import SQLAlchemyError

from backend.app.catalog.offer_import import read_offers, upsert_offers
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
        categories, offers = read_offers(path)
        database = Database(settings.database_url)
        if database.engine is None:
            raise ValueError('DATABASE_URL absente ou invalide pour PostgreSQL/Psycopg.')
        with database.engine.begin() as connection:
            result = upsert_offers(connection, categories, offers)
        print(f'{result.categories} catégories ; {result.processed} offres traitées ; '
              f'{result.changed} insérées ou actualisées ; {result.total} offres en base.')
        return 0
    except (OSError, ValueError) as exc:
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