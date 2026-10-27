"""Envoyer la circulaire PDF d'un magasin dans Supabase (une image par page) et l'enregistrer.

Exemples, depuis la racine du projet :
    python -m backend.cli.import_circulars --retailer maxi
    python -m backend.cli.import_circulars --retailer maxi --from 2026-10-22 --to 2026-10-28

Sans dates : la semaine de circulaire en cours, du jeudi au mercredi suivant.

Le PDF est lu dans data/circulars/<magasin>.pdf (ou --input). L'ancienne circulaire
du magasin est remplacée : ses images sont supprimées après l'enregistrement de la nouvelle.
"""
import argparse
from datetime import date, datetime, timedelta
from pathlib import Path
import sys

import httpx
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import SQLAlchemyError

from backend.app.catalog.circulars import Storage, page_name, pdf_to_jpegs
from backend.app.catalog.models import Circular
from backend.app.common.public_data import ROOT, today
from backend.app.config import load_settings
from backend.app.database import Database

RETAILERS = ('maxi', 'metro', 'superc')


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--retailer', required=True, choices=RETAILERS)
    parser.add_argument('--from', dest='valid_from', type=date.fromisoformat, help='AAAA-MM-JJ ; par défaut le jeudi')
    parser.add_argument('--to', dest='valid_to', type=date.fromisoformat, help='AAAA-MM-JJ ; par défaut le mercredi')
    parser.add_argument('--input', type=Path, help='PDF ; par défaut data/circulars/<magasin>.pdf')
    args = parser.parse_args(argv)
    args.valid_from, args.valid_to = circular_week(args.valid_from, args.valid_to)
    return args


def circular_week(valid_from: date | None, valid_to: date | None, on: date | None = None) -> tuple[date, date]:
    """Dates manquantes : semaine de circulaire du jeudi au mercredi (7 jours)."""
    if valid_from is None and valid_to is None:
        on = on or today()
        valid_from = on - timedelta(days=(on.weekday() - 3) % 7)   # jeudi = 3 ; jeudi de cette semaine-ci ou d'avant
    if valid_from is None:
        valid_from = valid_to - timedelta(days=6)
    if valid_to is None:
        valid_to = valid_from + timedelta(days=6)
    return valid_from, valid_to


def main(argv=None) -> int:
    args = parse_args(argv)
    database = storage = None
    uploaded: list[str] = []
    try:
        # 1. Tout vérifier et convertir avant la moindre connexion.
        if args.valid_to < args.valid_from:
            raise ValueError('La date de fin est avant la date de début.')
        path = ROOT / (args.input or Path('data/circulars') / f'{args.retailer}.pdf')
        pages = pdf_to_jpegs(path)
        settings = load_settings()
        if not settings.supabase_url or not settings.supabase_secret_key:
            raise ValueError('SUPABASE_URL ou SUPABASE_SECRET_KEY absente de backend/.env.')
        database = Database(settings.database_url)
        if database.engine is None:
            raise ValueError('DATABASE_URL absente ou invalide pour PostgreSQL/Psycopg.')

        # 2. Envoyer les nouvelles images dans un dossier neuf (l'ancienne circulaire reste visible).
        storage = Storage(settings.supabase_url, settings.supabase_secret_key)
        prefix = f'{args.retailer}/{datetime.now():%Y%m%d-%H%M%S}'
        for number, data in enumerate(pages, start=1):
            storage.upload(f'{prefix}/{page_name(number)}', data)
            uploaded.append(f'{prefix}/{page_name(number)}')

        # 3. Remplacer la ligne du magasin dans public.circular.
        with database.engine.begin() as connection:
            old_prefix = connection.scalar(select(Circular.storage_prefix).where(Circular.retailer == args.retailer))
            values = {'retailer': args.retailer, 'valid_from': args.valid_from, 'valid_to': args.valid_to,
                      'page_count': len(pages), 'storage_prefix': prefix}
            statement = insert(Circular).values(values)
            connection.execute(statement.on_conflict_do_update(
                index_elements=[Circular.retailer],
                set_={**{k: getattr(statement.excluded, k) for k in values if k != 'retailer'},
                      'imported_at': datetime.now().astimezone()},
            ))
        uploaded = []  # la nouvelle circulaire est enregistrée : ne plus la supprimer en cas d'erreur

        # 4. Supprimer les images de l'ancienne circulaire pour libérer l'espace.
        removed = 0
        if old_prefix and old_prefix != prefix:
            old_files = storage.list_files(old_prefix)
            storage.delete(old_files)
            removed = len(old_files)
        print(f'Circulaire {args.retailer} : {len(pages)} pages envoyées, du {args.valid_from} au {args.valid_to} ; '
              f'{removed} anciennes images supprimées.')
        return 0
    except ImportError:
        print('Import impossible : installer PyMuPDF avec « pip install pymupdf ».', file=sys.stderr)
        return 1
    except (OSError, ValueError, RuntimeError) as exc:
        # RuntimeError : PDF illisible ou abîmé (erreur de PyMuPDF).
        print(f'Import impossible : {exc}', file=sys.stderr)
        return 1
    except httpx.HTTPStatusError as exc:
        print(f'Storage Supabase a refusé la requête ({exc.response.status_code}) : {exc.response.text[:200]}',
              file=sys.stderr)
        return 1
    except httpx.HTTPError as exc:
        print(f'Storage Supabase injoignable ({type(exc).__name__}). Vérifier SUPABASE_URL et la connexion.',
              file=sys.stderr)
        return 1
    except SQLAlchemyError as exc:
        print(f'Enregistrement PostgreSQL impossible ({type(exc).__name__}) : '
              'vérifier la connexion et appliquer les migrations. Aucune transaction partielle validée.',
              file=sys.stderr)
        return 1
    finally:
        # En cas d'échec, on retire les images déjà envoyées : rien d'orphelin dans Storage.
        if storage is not None:
            if uploaded:
                try:
                    storage.delete(uploaded)
                except httpx.HTTPError:
                    print('Attention : des images envoyées n’ont pas pu être retirées.', file=sys.stderr)
            storage.close()
        if database is not None:
            database.dispose()


if __name__ == '__main__':
    raise SystemExit(main())