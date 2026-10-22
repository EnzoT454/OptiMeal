"""Configurer les limites et les droits du bucket public des photos de recettes."""
from pathlib import Path
import sys

from sqlalchemy.exc import SQLAlchemyError

from backend.app.config import load_settings
from backend.app.database import Database

SQL_PATH = Path(__file__).resolve().parents[1] / 'config/storage/recipe_images.sql'


def main() -> int:
    database = Database(load_settings().database_url)
    try:
        if database.engine is None:
            raise ValueError('DATABASE_URL absente ou invalide.')
        with database.engine.begin() as connection:
            connection.exec_driver_sql(SQL_PATH.read_text(encoding='utf-8'))
        print('Bucket recipes-images configuré : 5 Mo maximum, images uniquement, écritures par propriétaire.')
        return 0
    except (OSError, ValueError) as exc:
        print(f'Configuration impossible : {exc}', file=sys.stderr)
        return 1
    except SQLAlchemyError as exc:
        print(f'Configuration Storage impossible ({type(exc).__name__}). '
              'Vérifier le bucket public et les droits de la connexion serveur. Transaction annulée.', file=sys.stderr)
        return 1
    finally:
        database.dispose()


if __name__ == '__main__':
    raise SystemExit(main())
