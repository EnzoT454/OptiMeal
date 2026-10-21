"""Regrouper les trois catalogues locaux dans data/catalog/baseCommune."""
import argparse
import json
import sys
from pathlib import Path

from backend.app.catalog.common_catalog import build_common_catalog

ROOT = Path(__file__).resolve().parents[2]
MAPPING = Path('data/catalog/baseCommune/ingredient_mapping.json')
OUTPUT = Path('data/catalog/baseCommune/ingredients.json')


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mapping', type=Path, default=MAPPING)
    parser.add_argument('--output', type=Path, default=OUTPUT)
    args = parser.parse_args()
    try:
        catalog = build_common_catalog(ROOT, args.mapping)
        output = (ROOT / args.output).resolve()
        if output in {(ROOT / entry['path']).resolve() for entry in catalog['inputs']}:
            raise ValueError('La sortie doit être distincte des fichiers sources et de configuration.')
        payload = json.dumps(catalog, ensure_ascii=False, indent=2, allow_nan=False) + '\n'
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(payload, encoding='utf-8')
        print(f"{catalog['ingredient_count']} ingrédients ; {catalog['product_count']} fiches produits ; {output}")
        return 0
    except (OSError, ValueError, KeyError, TypeError) as exc:
        print(f'Construction impossible : {exc}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
