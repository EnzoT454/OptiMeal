"""Valider les données initiales et exporter les contrats communs versionnés."""
import argparse
from datetime import date
import json
from pathlib import Path
import sys

from backend.app.catalog.common_schemas import CommonCatalog, IngredientRead, OfferRead
from backend.app.common.contracts import Detail, ErrorResponse, Page
from backend.app.common.public_data import DEFAULT_CATALOG, DEFAULT_RECIPES, ROOT, load_catalog, load_recipes
from backend.app.common.public_router import meta, page
from backend.app.main import create_app
from backend.app.recipes.schemas import RecipeRead, RecipeSeedDocument, RecipeSummary
from backend.app.recipes.router import recipe_meta

OUTPUT = ROOT / 'backend/contracts/v1'


def artifacts() -> dict:
    catalog = load_catalog(DEFAULT_CATALOG)
    recipes = load_recipes(DEFAULT_RECIPES, catalog)
    models = {
        'ingredients-page': Page[IngredientRead], 'recipes-page': Page[RecipeSummary],
        'recipe-detail': Detail[RecipeRead], 'offers-page': Page[OfferRead],
        'offer-detail': Detail[OfferRead], 'error': ErrorResponse,
        'common-catalog': CommonCatalog, 'recipe-seed': RecipeSeedDocument,
    }
    files = {name + '.schema.json': model.model_json_schema(mode='serialization')
             for name, model in models.items()}
    # Date fixe et explicite pour des exemples reproductibles, jamais assimilés
    # à des prix ou des promotions disponibles aujourd'hui.
    offers = catalog.offers(date(2026, 10, 6))
    examples = {
        'ingredients-page': page(catalog.ingredients, 2, 0),
        'recipes-page': {**page(sorted(recipes.summaries(), key=lambda r: r.id), 2, 0, 'demo'), 'meta': recipe_meta()},
        'recipe-detail': {'item': recipes.recipes[0], 'meta': recipe_meta()},
        'offers-page': page(offers, 2, 0),
        'offer-detail': {'item': offers[0], 'meta': meta()},
        'error': {'error': {'code': 'RECIPE_NOT_FOUND', 'message': 'Recette introuvable.', 'details': []}},
    }
    files['examples.json'] = {
        name: models[name].model_validate(value).model_dump(mode='json') for name, value in examples.items()
    }
    files['openapi.json'] = create_app().openapi()
    return files


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', type=Path, default=OUTPUT)
    parser.add_argument('--check', action='store_true', help='Vérifier les exports sans écrire.')
    args = parser.parse_args()
    try:
        files = artifacts()
        stale = []
        for name, value in files.items():
            payload = json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + '\n'
            path = args.output_dir / name
            if args.check:
                if not path.is_file() or path.read_text(encoding='utf-8') != payload:
                    stale.append(name)
            else:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(payload, encoding='utf-8')
        if stale:
            print('Contrats à régénérer : ' + ', '.join(stale), file=sys.stderr)
            return 1
        print(f'{len(files)} exports cohérents ; catalogue et recettes validés.')
        return 0
    except (OSError, ValueError, KeyError, TypeError) as exc:
        print(f'Contrats invalides : {exc}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
