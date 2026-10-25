"""Import transactionnel des catégories et des offres du catalogue commun."""
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path

from sqlalchemy import Connection, func, or_, select
from sqlalchemy.dialects.postgresql import insert

from .common_schemas import CommonCatalog
from .models import Category, Ingredient, ProductOffer

OFFER_FIELDS = (
    'ingredient_id', 'category_id', 'position', 'retailer', 'store_id', 'external_product_id', 'name',
    'price', 'promo_price', 'currency', 'unit', 'quantity', 'valid_from', 'valid_to', 'retrieved_at',
    'is_promotion', 'source', 'url',
)


@dataclass(frozen=True)
class OfferImportResult:
    categories: int
    processed: int
    changed: int
    total: int


def decimal_or_none(value: str | None) -> Decimal | None:
    # Chaînes → Decimal directement : aucune perte de précision par un flottant.
    return None if value is None else Decimal(value)


def read_offers(path: Path) -> tuple[list[dict], list[dict]]:
    """Valider tout le fichier avant toute connexion à la base."""
    catalog = CommonCatalog.model_validate_json(path.read_text(encoding='utf-8'))
    if not catalog.categories:
        raise ValueError('Le catalogue ne contient pas la liste des catégories.')
    categories = [c.model_dump() for c in catalog.categories]
    offers = []
    for ingredient in catalog.ingredients:
        for product in ingredient.products:
            offers.append({
                'id': product.id, 'ingredient_id': ingredient.id, 'category_id': ingredient.category_id,
                'position': len(offers) + 1, 'retailer': product.retailer, 'store_id': product.store_id,
                'external_product_id': product.external_product_id, 'name': product.name,
                'price': decimal_or_none(product.price), 'promo_price': decimal_or_none(product.promo_price),
                'currency': product.currency, 'unit': product.unit, 'quantity': decimal_or_none(product.quantity),
                'valid_from': product.valid_from, 'valid_to': product.valid_to,
                'retrieved_at': product.retrieved_at, 'is_promotion': product.is_promotion,
                'source': product.source, 'url': product.url,
            })
    if not offers:
        raise ValueError('Aucune offre dans le catalogue.')
    return categories, offers


def upsert_offers(connection: Connection, categories: list[dict], offers: list[dict]) -> OfferImportResult:
    """Le propriétaire de la connexion gère la transaction ; aucun commit ici.

    Une ligne absente du fichier n'est jamais supprimée, comme pour les ingrédients.
    """
    known = set(connection.execute(select(Ingredient.id)).scalars())
    missing = sorted({o['ingredient_id'] for o in offers} - known)
    if missing:
        raise ValueError(f'Ingrédients absents de la base : {", ".join(missing[:5])}. '
                         'Lancer d’abord python -m backend.cli.import_ingredients.')

    statement = insert(Category).values(categories)
    connection.execute(statement.on_conflict_do_update(
        index_elements=[Category.id], set_={'name': statement.excluded.name},
        where=Category.name.is_distinct_from(statement.excluded.name),
    ))

    statement = insert(ProductOffer).values(offers)
    statement = statement.on_conflict_do_update(
        index_elements=[ProductOffer.id],
        set_={key: getattr(statement.excluded, key) for key in OFFER_FIELDS},
        where=or_(*(getattr(ProductOffer, key).is_distinct_from(getattr(statement.excluded, key))
                    for key in OFFER_FIELDS)),
    ).returning(ProductOffer.id)
    changed = len(connection.execute(statement).all())
    total = connection.execute(select(func.count()).select_from(ProductOffer)).scalar_one()
    return OfferImportResult(categories=len(categories), processed=len(offers), changed=changed, total=total)