"""Coût interne des quantités utilisées, relu en base à chaque classement.

Les ingrédients sans prix ou format compatible sont ignorés. Aucun ingrédient
chiffrable signifie une estimation inconnue, jamais un coût nul.
"""
from collections import defaultdict
from datetime import date
from decimal import Decimal
from fractions import Fraction

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.catalog.common_schemas import SourceProduct
from backend.app.catalog.formats import parse_format
from backend.app.catalog.models import ProductOffer
from backend.app.common.public_data import promotion, source_product_from_database
from backend.app.common.units import quantity_fraction
from .models import Recipe, RecipeIngredient


def ingredient_cost(quantity: Decimal, unit: str, product: SourceProduct,
                    on_date: date) -> Fraction | None:
    """Prorata exact du format vendu ; aucune conversion masse/volume/pièces."""
    raw = f'{product.quantity} {product.unit}' if product.quantity is not None else product.unit
    size = parse_format(raw)
    required, normalized_unit = quantity_fraction(quantity, unit)
    if size.kind != 'fixed' or size.unit != normalized_unit:
        return None
    units = required / Fraction(size.quantity)
    if promotion(product, on_date).status == 'active' and product.promo_price is not None:
        discounted = min(units, product.quantity_limit) if product.quantity_limit is not None else units
        return (discounted * Fraction(Decimal(product.promo_price))
                + (units - discounted) * Fraction(Decimal(product.price_after_limit or '0')))
    return None if product.price is None else units * Fraction(Decimal(product.price))


def budget_order(db: Session, conditions: list, on_date: date) -> dict[str, int]:
    """Deux lectures groupées, puis ordre global avant la pagination SQL.

    PostgreSQL est toujours la source de prix, indépendamment d'OFFERS_SOURCE.
    Aucun cache ni montant persisté : un import ou changement de recette prend
    effet à la requête suivante, y compris entre deux imports hebdomadaires.
    """
    rows = db.execute(select(RecipeIngredient.recipe_id, RecipeIngredient.ingredient_id,
                             RecipeIngredient.quantity, RecipeIngredient.unit)
                      .join(Recipe, Recipe.id == RecipeIngredient.recipe_id).where(*conditions)).all()
    ingredient_ids = {row.ingredient_id for row in rows}
    products = defaultdict(list)
    if ingredient_ids:
        for row in db.scalars(select(ProductOffer).where(ProductOffer.ingredient_id.in_(ingredient_ids))):
            products[row.ingredient_id].append(source_product_from_database(row))
    totals = {}
    for row in rows:
        costs = [cost for product in products[row.ingredient_id]
                 if (cost := ingredient_cost(row.quantity, row.unit, product, on_date)) is not None]
        if costs:
            totals[row.recipe_id] = totals.get(row.recipe_id, Fraction()) + min(costs)
    return {recipe_id: index for index, recipe_id in enumerate(sorted(totals, key=lambda key: (totals[key], key)))}
