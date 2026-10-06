"""CLI du catalogue Maxi via Apify : collecte bornée, reprise ou rejeu sans réseau."""
import argparse
import asyncio
import json
import sys
from pathlib import Path

from backend.app.catalog.export import report
from backend.app.catalog.schemas import CatalogExport
from backend.app.catalog.apify_command import run_apify

CONFIG = Path(__file__).resolve().parents[1] / 'config' / 'catalog'


def read_json(path: Path):
    return json.loads(path.read_text(encoding='utf-8'))


def write_json(path: Path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


async def run(args) -> int:
    catalog = await run_apify(args, CONFIG)
    return export_catalog(catalog, args.output_dir)


def export_catalog(catalog: CatalogExport, output_dir: Path) -> int:
    payload = catalog.model_dump_json(indent=2)
    CatalogExport.model_validate_json(payload)
    (output_dir / 'catalog.json').write_text(payload + '\n', encoding='utf-8')
    write_json(output_dir / 'review.json', {
        'schema_version': 'catalog-review-1.0', 'status': 'pending_human_review',
        'note': 'Suggestions uniquement. Modifier ce fichier n’approuve pas un prix ni une succursale.',
        'matches': [m.model_dump(mode='json') for m in catalog.matches],
        'search_rejections': catalog.collection['rejected_search_rows'],
    })
    (output_dir / 'report.md').write_text(report(catalog), encoding='utf-8')
    found = sum(c.candidate_count > 0 for c in catalog.coverage)
    print(f'{found}/{len(catalog.ingredients)} ingrédients avec candidats ; {len(catalog.offers)} prix Maxi/enseigne cible ; '
          '0 prix vérifié en succursale.')
    print(f'Résultats : {output_dir}')
    return 2 if catalog.collection['errors'] or not catalog.offers else 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--live', action='store_true', help='Autorise la collecte réseau bornée.')
    mode.add_argument('--replay', type=Path, help='Archive raw.json à rejouer sans réseau.')
    mode.add_argument('--resume', type=Path, help='Reprendre un plan Apify : lire les runs existants et lancer les recherches encore non démarrées.')
    parser.add_argument('--source', choices=['apify'], default='apify', help='Source du catalogue Maxi (Apify).')
    parser.add_argument('--promos', action='store_true', help='Promotions des 31 ingrédients, catégories conservées ; maximum 200 résultats au total.')
    parser.add_argument('--food-promos', action='store_true', help='Promotions par rayons alimentaires, sans recherche par ingrédient ; maximum 200 résultats.')
    parser.add_argument('--batch', choices=['1', '2', '3'], default='1', help='Lot d’ingrédients Apify ; le rejeu conserve le lot archivé sauf --refresh-rules.')
    parser.add_argument('--location-id', help='Identifiant de succursale Loblaw vérifié.')
    parser.add_argument('--postal-code', help='Découvrir la succursale Maxi la plus proche.')
    parser.add_argument('--max-items', type=int, default=100)
    parser.add_argument('--max-charge-usd', type=float, default=1.0)
    parser.add_argument('--refresh-rules', action='store_true', help='Rejeu Apify seulement : appliquer les règles ingrédients actuelles et archiver les anciennes.')
    parser.add_argument('--output-dir', type=Path, required=True, help='Nouveau dossier de résultats.')
    args = parser.parse_args()
    try:
        return asyncio.run(run(args))
    except (OSError, ValueError, KeyError, TypeError) as exc:
        print(f'Import impossible : {exc}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
