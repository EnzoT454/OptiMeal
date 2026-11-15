"""Auditer les formats et bases tarifaires sans importer ni modifier d'offre."""
import argparse
from datetime import date
from pathlib import Path
import sys

from pydantic import ValidationError
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from backend.app.catalog.common_schemas import CommonCatalog
from backend.app.catalog.sales import SaleReviewDocument, normalize_catalog, normalize_database
from backend.app.common.public_data import DEFAULT_CATALOG, ROOT, today
from backend.app.config import load_settings
from backend.app.database import Database


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', choices=('json', 'database'), default='json')
    parser.add_argument('--input', type=Path, help='Catalogue commun JSON ; défaut : catalogue configuré.')
    parser.add_argument('--reviews', type=Path, help='Attestations sale-reviews-1.0, jamais créées automatiquement.')
    parser.add_argument('--on-date', type=date.fromisoformat, default=None, help='Date des courses AAAA-MM-JJ ; défaut : aujourd’hui à Toronto.')
    parser.add_argument('--output', type=Path, required=True, help='Rapport JSON, distinct des fichiers sources.')
    args = parser.parse_args()
    database = None
    try:
        if args.source == 'database' and args.input:
            raise ValueError('--input s’utilise uniquement avec --source json.')
        settings = load_settings()
        path = ROOT / (args.input or settings.common_catalog_path or DEFAULT_CATALOG)
        source_paths = [DEFAULT_CATALOG, path] + ([ROOT / args.reviews] if args.reviews else [])
        output = (ROOT / args.output).resolve()
        if output in [p.resolve() for p in source_paths]:
            raise ValueError('Le rapport ne doit pas écraser le catalogue ou ses attestations.')
        # Valider les attestations avant toute connexion.
        reviews = SaleReviewDocument.model_validate_json((ROOT / args.reviews).read_text(encoding='utf-8')).reviews if args.reviews else []
        on_date = args.on_date or today()
        if args.source == 'json':
            catalog = CommonCatalog.model_validate_json(path.read_text(encoding='utf-8'))
            # Préserver aussi les fichiers bruts référencés par le catalogue.
            if output in [(ROOT / entry.path).resolve() for entry in catalog.inputs]:
                raise ValueError('Le rapport ne doit pas écraser un fichier source du catalogue.')
            report = normalize_catalog(catalog, on_date, reviews)
        else:
            database = Database(settings.database_url)
            if database.engine is None:
                raise ValueError('DATABASE_URL absente ou invalide.')
            with Session(database.engine) as db:
                db.connection(execution_options={'isolation_level': 'REPEATABLE READ'})
                db.execute(text('SET TRANSACTION READ ONLY'))
                report = normalize_database(db, on_date, reviews)
                db.rollback()
        # Aucune écriture tant que l'intégralité du rapport n'est pas validée.
        payload = report.model_dump_json(indent=2) + '\n'
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(payload, encoding='utf-8')
        print(f'{report.product_count} références ; {report.eligible_count} admissibles ; '
              f'{report.product_count - report.eligible_count} à vérifier ; date : {on_date}.')
        return 0
    except ValidationError:
        print('Normalisation impossible : catalogue ou attestations invalides.', file=sys.stderr)
        return 1
    except (OSError, ValueError) as exc:
        print(f'Normalisation impossible : {exc}', file=sys.stderr)
        return 1
    except SQLAlchemyError as exc:
        print(f'Lecture PostgreSQL impossible ({type(exc).__name__}). Aucune donnée modifiée.', file=sys.stderr)
        return 1
    finally:
        if database is not None:
            database.dispose()


if __name__ == '__main__':
    raise SystemExit(main())
