"""Préparer les codes de reçus Maxi puis actualiser leurs correspondances web."""
import argparse
from datetime import date, datetime
import os
from pathlib import Path
from zoneinfo import ZoneInfo

import httpx
from pydantic import ValidationError

from backend.app.price_sources.pcx_products import PCXProducts
from backend.app.receipts.web_matching import prepare, read_inputs, update, write_json_atomic

ROOT = Path('data/catalog/maxi')


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    preparation = commands.add_parser('prepare', help='Créer ou compléter le JSON à renseigner.')
    preparation.add_argument('receipts', nargs='+', type=Path)
    preparation.add_argument('--output', type=Path, default=ROOT / 'maxi_receipt_products.json')
    refresh = commands.add_parser('update', help='Actualiser les produits dont l’URL est renseignée.')
    refresh.add_argument('--input', type=Path, default=ROOT / 'maxi_receipt_products.json')
    refresh.add_argument('--output', type=Path, default=ROOT / 'maxi_web_receipt_match.json')
    refresh.add_argument('--date', type=date.fromisoformat,
                         default=datetime.now(ZoneInfo('America/Toronto')).date())
    args = parser.parse_args()
    try:
        if args.command == 'prepare':
            rows = prepare(args.receipts, args.output)
            print(f'{len(rows)} produits préparés dans {args.output}. Compléter les URL.')
            return 0
        report_path = args.output.with_name(args.output.stem + '.report.json')
        if args.input.resolve() in {args.output.resolve(), report_path.resolve()}:
            raise ValueError('Entrée, correspondances et rapport doivent être distincts.')
        rows = read_inputs(args.input)
        sources = {Path(r.source_receipt).resolve() for r in rows}
        if sources & {args.output.resolve(), report_path.resolve()}:
            raise ValueError('Les sorties ne doivent pas remplacer un reçu source.')
        with httpx.Client(timeout=20) as http:
            report = update(rows, args.output, PCXProducts(http, os.getenv('PCX_API_KEY', '')),
                            args.date)
        write_json_atomic(report_path, report)
        for item in report['items']:
            print(f"{item['product_code']} ({item['store_id']}): {item['status']}")
        return 0 if all(r['status'] == 'updated' for r in report['items']) else 1
    except ValidationError:
        parser.exit(2, 'Format des données invalide ; vérifier les fichiers JSON.\n')
    except (OSError, ValueError, KeyError) as exc:
        parser.exit(2, f'Erreur : {exc}\n')


if __name__ == '__main__':
    raise SystemExit(main())
