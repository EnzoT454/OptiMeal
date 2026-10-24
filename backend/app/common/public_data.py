"""Adaptation des JSON locaux vers les contrats publics, sans réseau ni écriture."""
from dataclasses import dataclass
from datetime import date, datetime
import hashlib
from pathlib import Path
import unicodedata
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.catalog.common_schemas import CommonCatalog, IngredientRead, OfferRead, Promotion, SourceProduct
from backend.app.catalog.models import ProductOffer
from backend.app.recipes.schemas import RecipeRead, RecipeSeedDocument, RecipeSummary

ROOT = Path(__file__).resolve().parents[3]
DEFAULT_CATALOG = ROOT / 'data/catalog/baseCommune/ingredients.json'
DEFAULT_RECIPES = ROOT / 'data/recipes/initial_recipes.json'


def today() -> date:
    return datetime.now(ZoneInfo('America/Toronto')).date()


def search_text(text: str) -> str:
    text = text.casefold().replace('œ', 'oe').replace('æ', 'ae')
    return ''.join(c for c in unicodedata.normalize('NFKD', text)
                   if not unicodedata.combining(c))


def promotion(product: SourceProduct, on_date: date) -> Promotion:
    if product.is_promotion is False:
        status = 'not_promotion'
    elif product.is_promotion is None:
        status = 'unknown'
    elif product.valid_to and on_date > product.valid_to:
        status = 'expired'
    elif product.valid_from and on_date < product.valid_from:
        status = 'upcoming'
    elif product.valid_from and product.valid_to:
        status = 'active'
    else:
        status = 'unverifiable'
    return Promotion(declared=product.is_promotion, valid_from=product.valid_from,
                     valid_to=product.valid_to, status=status, evaluated_on=on_date)


def offer(ingredient_id: str, product: SourceProduct, on_date: date,
          category_id: int | None = None) -> OfferRead:
    fingerprint = hashlib.sha256((ingredient_id + '\n' + product.model_dump_json()).encode()).hexdigest()[:24]
    return OfferRead(
        id='offer_' + fingerprint, product_id=product.id, ingredient_id=ingredient_id,
        product_name=product.name, retailer=product.retailer,
        store_id=f'{product.retailer}:{product.store_id}' if product.store_id is not None else None,
        external_store_id=product.store_id, external_product_id=product.external_product_id,
        format={'quantity': product.quantity, 'unit_raw': product.unit},
        price={'kind': 'unknown' if product.price is None else 'commercial', 'amount': product.price},
        # Ajouts page Promos
        promo_price=(None if product.promo_price is None
                     else {'kind': 'commercial', 'amount': product.promo_price}),
        category_id=category_id, retrieved_at=product.retrieved_at,
        promotion=promotion(product, on_date),
        source={'kind': product.source, 'url': product.url},
    )


@dataclass(frozen=True)
class PublicCatalog:
    source: CommonCatalog
    ingredients: list[IngredientRead]

    def offers(self, on_date: date) -> list[OfferRead]:
        return [offer(i.id, p, on_date, i.category_id)
                for i in self.source.ingredients for p in i.products]


def text_or_none(value) -> str | None:
    # NUMERIC sans échelle : str(Decimal) redonne exactement le texte importé ('1.0', '2.49').
    return None if value is None else str(value)


def offers_from_database(db: Session, on_date: date) -> list[OfferRead]:
    """Mêmes offres que le JSON, lues dans public.product_offer, dans le même ordre."""
    result = []
    for row in db.scalars(select(ProductOffer).order_by(ProductOffer.position)):
        product = SourceProduct(
            id=row.id, retailer=row.retailer, store_id=row.store_id,
            external_product_id=row.external_product_id, name=row.name,
            price=text_or_none(row.price), promo_price=text_or_none(row.promo_price),
            currency=row.currency, unit=row.unit, quantity=text_or_none(row.quantity),
            valid_from=row.valid_from, valid_to=row.valid_to, retrieved_at=row.retrieved_at,
            is_promotion=row.is_promotion, source=row.source, url=row.url,
        )
        result.append(offer(row.ingredient_id, product, on_date, row.category_id))
    return result


@dataclass(frozen=True)
class PublicRecipes:
    recipes: list[RecipeRead]

    def summaries(self) -> list[RecipeSummary]:
        fields = RecipeSummary.model_fields
        return [RecipeSummary.model_validate(r.model_dump(include=set(fields))) for r in self.recipes]


def load_catalog(path: Path) -> PublicCatalog:
    source = CommonCatalog.model_validate_json(path.read_text(encoding='utf-8'))
    fields = set(IngredientRead.model_fields)
    ingredients = [IngredientRead.model_validate(i.model_dump(include=fields)) for i in source.ingredients]
    return PublicCatalog(source, ingredients)


def load_recipes(path: Path, catalog: PublicCatalog) -> PublicRecipes:
    source = RecipeSeedDocument.model_validate_json(path.read_text(encoding='utf-8'))
    ids = {i.id for i in catalog.ingredients}
    recipes = []
    for seed in source.recipes:
        if any(i.ingredient_id not in ids for i in seed.ingredients):
            raise ValueError(f'Ingrédient inconnu dans la recette {seed.seed_key}.')
        recipes.append(RecipeRead(id='recipe_' + seed.seed_key, **seed.model_dump(exclude={'seed_key'})))
    return PublicRecipes(recipes)