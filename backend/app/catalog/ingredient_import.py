"""Import transactionnel des ingrédients, indépendant des produits et des API."""
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import Connection, func, or_, select
from sqlalchemy.dialects.postgresql import insert

from .common_schemas import CommonCatalog
from .models import Ingredient


@dataclass(frozen=True)
class ImportResult:
    processed: int
    changed: int
    total: int


def read_ingredients(path: Path) -> list[dict]:
    catalog = CommonCatalog.model_validate_json(path.read_text(encoding='utf-8'))
    if not catalog.ingredients:
        raise ValueError('Aucun ingrédient dans le catalogue.')
    rows = []
    for ingredient in catalog.ingredients:
        if not ingredient.name.strip() or not ingredient.category.strip():
            raise ValueError('Nom ou catégorie d’ingrédient vide.')
        if any(not alias.strip() for alias in ingredient.aliases):
            raise ValueError('Alias d’ingrédient vide.')
        rows.append(ingredient.model_dump(include={'id', 'name', 'category', 'aliases'}))
    return rows


def upsert_ingredients(connection: Connection, rows: list[dict]) -> ImportResult:
    """Le propriétaire de la connexion gère la transaction ; aucun commit ici."""
    if not rows:
        raise ValueError('Aucun ingrédient à importer.')
    statement = insert(Ingredient).values(rows)
    statement = statement.on_conflict_do_update(
        index_elements=[Ingredient.id],
        set_={key: getattr(statement.excluded, key) for key in ('name', 'category', 'aliases')},
        where=or_(*(getattr(Ingredient, key).is_distinct_from(getattr(statement.excluded, key))
                    for key in ('name', 'category', 'aliases'))),
    ).returning(Ingredient.id)
    changed = len(connection.execute(statement).all())
    total = connection.execute(select(func.count()).select_from(Ingredient)).scalar_one()
    return ImportResult(processed=len(rows), changed=changed, total=total)
