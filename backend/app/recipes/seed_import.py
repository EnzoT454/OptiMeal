"""Importer le catalogue de départ sans écraser les recettes déjà modifiées."""
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path

from sqlalchemy import Connection, func, or_, select
from sqlalchemy.dialects.postgresql import insert

from backend.app.catalog.models import Ingredient
from .models import Recipe, RecipeIngredient
from .schemas import RecipeSeed, RecipeSeedDocument


@dataclass(frozen=True)
class ImportResult:
    processed: int
    inserted: int
    unchanged: int
    total: int
    ingredient_links: int


def read_recipes(path: Path) -> list[RecipeSeed]:
    document = RecipeSeedDocument.model_validate_json(path.read_text(encoding='utf-8'))
    if not document.recipes:
        raise ValueError('Aucune recette dans le fichier.')
    return document.recipes


def recipe_rows(seed: RecipeSeed) -> tuple[dict, list[dict]]:
    """Conserver les identifiants publics et les quantités sans passage par float."""
    recipe_id = 'recipe_' + seed.seed_key
    recipe = dict(id=recipe_id, owner_id=None, review_required=True, visibility='public', published_at=None,
                  **seed.model_dump(exclude={'ingredients'}))
    ingredients = [
        dict(recipe_id=recipe_id, position=position,
             **ingredient.model_dump(exclude={'quantity'}), quantity=Decimal(ingredient.quantity))
        for position, ingredient in enumerate(seed.ingredients, start=1)
    ]
    return recipe, ingredients


def import_recipes(connection: Connection, seeds: list[RecipeSeed]) -> ImportResult:
    """Le propriétaire de la connexion valide ou annule la transaction entière."""
    if not seeds:
        raise ValueError('Aucune recette à importer.')
    keys = [seed.seed_key for seed in seeds]
    if len(keys) != len(set(keys)):
        raise ValueError('Clés de recettes dupliquées.')
    required = {ingredient.ingredient_id for seed in seeds for ingredient in seed.ingredients}
    present = set(connection.scalars(select(Ingredient.id).where(Ingredient.id.in_(required))))
    if missing := required - present:
        raise ValueError('Ingrédients absents en base : ' + ', '.join(sorted(missing))
                         + '. Exécuter d’abord import_ingredients.')
    inserted = 0
    # Ordre commun pour deux imports simultanés : les conflits d’unicité
    # attendent la transaction concurrente avant de comparer les données.
    for seed in sorted(seeds, key=lambda item: item.seed_key):
        recipe, ingredients = recipe_rows(seed)
        new_id = connection.scalar(insert(Recipe).values(**recipe).on_conflict_do_nothing().returning(Recipe.id))
        if new_id is not None:
            connection.execute(RecipeIngredient.__table__.insert(), ingredients)
            inserted += 1
            continue
        existing = connection.execute(select(Recipe.__table__).where(or_(
            Recipe.id == recipe['id'], Recipe.seed_key == seed.seed_key,
        )).with_for_update()).mappings().all()
        links = connection.execute(select(RecipeIngredient.__table__).where(
            RecipeIngredient.recipe_id == recipe['id'],
        ).order_by(RecipeIngredient.position)).mappings().all()
        if len(existing) != 1 or dict(existing[0]) != recipe or list(map(dict, links)) != ingredients:
            raise ValueError(f'Conflit pour {recipe["id"]} : recette existante différente. '
                             'Aucune recette existante n’a été remplacée ; import annulé.')
    return ImportResult(
        processed=len(seeds), inserted=inserted, unchanged=len(seeds) - inserted,
        total=connection.scalar(select(func.count()).select_from(Recipe)),
        ingredient_links=connection.scalar(select(func.count()).select_from(RecipeIngredient)),
    )
