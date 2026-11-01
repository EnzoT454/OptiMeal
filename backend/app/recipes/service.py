"""Recettes partagées et personnelles ; autorisations vérifiées avant toute lecture ou mutation."""
from uuid import UUID, uuid4
from datetime import datetime, timezone

from sqlalchemy import delete, exists, func, or_, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from backend.app.accounts.service import ensure_profile
from backend.app.common.public_data import search_text
from backend.app.common.public_router import fail
from backend.app.security import CurrentUser
from .models import Favorite, Recipe, RecipeIngredient
from .schemas import RecipeCreate, RecipeRead, RecipeScope, RecipeSummary, RecipeVisibilityUpdate, RecipeWrite


def visible(user_id: UUID | None):
    if user_id is None:
        return Recipe.visibility == 'public'
    return or_(Recipe.visibility == 'public', Recipe.owner_id == user_id)


def favorite_for(user_id: UUID | None):
    return exists(select(Favorite.recipe_id).where(Favorite.recipe_id == Recipe.id, Favorite.user_id == user_id))


def list_recipes(db: Session, *, q: str, quick: bool, limit: int, offset: int,
                 user_id: UUID | None = None, favorites: bool = False,
                 scope: RecipeScope = 'accessible') -> tuple[list[RecipeSummary], int]:
    conditions = [visible(user_id)]
    if scope == 'discover':
        conditions.append(Recipe.visibility == 'public')
    elif scope == 'mine':
        conditions.append(Recipe.owner_id == user_id)
    if quick:
        conditions.append(Recipe.total_time_minutes <= 30)
    if favorites or scope == 'favorites':
        conditions.append(favorite_for(user_id))
    query = search_text(q.strip())
    if query:
        candidates = db.execute(select(Recipe.id, Recipe.name).where(*conditions))
        ids = [row.id for row in candidates if query in search_text(row.name)]
        conditions.append(Recipe.id.in_(ids))
    total = db.scalar(select(func.count()).select_from(Recipe).where(*conditions))
    columns = [Recipe.__table__.c[field] for field in RecipeSummary.model_fields if field in Recipe.__table__.c]
    rows = db.execute(select(*columns, Recipe.owner_id, favorite_for(user_id).label('is_favorite'))
                      .where(*conditions).order_by(Recipe.id).limit(limit).offset(offset))
    items = []
    for row in rows.mappings():
        fields = {key: row[key] for key in RecipeSummary.model_fields if key in row}
        fields['is_owned'] = user_id is not None and row['owner_id'] == user_id
        items.append(RecipeSummary.model_validate(fields))
    return items, total


def get_recipe(db: Session, recipe_id: str, user_id: UUID | None = None) -> RecipeRead | None:
    recipe = db.execute(select(Recipe.__table__).where(Recipe.id == recipe_id, visible(user_id))).mappings().one_or_none()
    if recipe is None:
        return None
    rows = db.execute(select(RecipeIngredient.__table__).where(
        RecipeIngredient.recipe_id == recipe_id,
    ).order_by(RecipeIngredient.position)).mappings().all()
    fields = {key: recipe[key] for key in RecipeWrite.model_fields if key != 'ingredients'}
    fields['ingredients'] = [dict(ingredient_id=row['ingredient_id'], quantity=format(row['quantity'], 'f'),
                                 unit=row['unit'], preparation=row['preparation']) for row in rows]
    validated = RecipeWrite.model_validate(fields)
    favorite = bool(db.scalar(select(favorite_for(user_id)).select_from(Recipe).where(Recipe.id == recipe_id)))
    return RecipeRead(id=recipe_id, review_required=recipe['review_required'],
                      visibility=recipe['visibility'], published_at=recipe['published_at'],
                      is_owned=user_id is not None and recipe['owner_id'] == user_id,
                      is_favorite=favorite, **validated.model_dump())


def ingredient_rows(db: Session, body: RecipeWrite, recipe_id: str) -> list[dict]:
    from backend.app.catalog.models import Ingredient
    from decimal import Decimal
    required = {i.ingredient_id for i in body.ingredients}
    found = set(db.scalars(select(Ingredient.id).where(Ingredient.id.in_(required))))
    if found != required:
        fail(422, 'UNKNOWN_INGREDIENT', 'Un ingrédient ne figure pas dans le référentiel.')
    return [dict(recipe_id=recipe_id, position=position, quantity=Decimal(i.quantity),
                 **i.model_dump(exclude={'quantity'})) for position, i in enumerate(body.ingredients, 1)]


def create_recipe(db: Session, body: RecipeCreate, user: CurrentUser) -> RecipeRead:
    recipe_id = 'recipe_' + uuid4().hex
    rows = ingredient_rows(db, body, recipe_id)
    ensure_profile(db, user)
    db.execute(insert(Recipe).values(id=recipe_id, seed_key=None, owner_id=user.id,
               published_at=datetime.now(timezone.utc) if body.visibility == 'public' else None,
               review_required=False, **body.model_dump(exclude={'ingredients'})))
    db.execute(insert(RecipeIngredient), rows)
    result = get_recipe(db, recipe_id, user.id)
    db.commit()
    return result


def owned_recipe(db: Session, recipe_id: str, user: CurrentUser) -> None:
    if db.scalar(select(Recipe.id).where(Recipe.id == recipe_id, Recipe.owner_id == user.id).with_for_update()) is None:
        fail(404, 'RECIPE_NOT_FOUND', 'Recette personnelle introuvable.')


def update_recipe(db: Session, recipe_id: str, body: RecipeWrite, user: CurrentUser) -> RecipeRead:
    owned_recipe(db, recipe_id, user)
    rows = ingredient_rows(db, body, recipe_id)
    db.execute(update(Recipe).where(Recipe.id == recipe_id, Recipe.owner_id == user.id)
               .values(**body.model_dump(exclude={'ingredients'}, exclude_unset=True)))
    db.execute(delete(RecipeIngredient).where(RecipeIngredient.recipe_id == recipe_id))
    db.execute(insert(RecipeIngredient), rows)
    result = get_recipe(db, recipe_id, user.id)
    db.commit()
    return result


def delete_recipe(db: Session, recipe_id: str, user: CurrentUser) -> None:
    owned_recipe(db, recipe_id, user)
    db.execute(delete(Recipe).where(Recipe.id == recipe_id, Recipe.owner_id == user.id))
    db.commit()


def set_visibility(db: Session, recipe_id: str, body: RecipeVisibilityUpdate, user: CurrentUser) -> RecipeRead:
    owned_recipe(db, recipe_id, user)
    # Le verrou de propriété sérialise publication, retrait et suppression.
    recipe = db.execute(select(Recipe.visibility, Recipe.published_at).where(Recipe.id == recipe_id)).one()
    if recipe.visibility != body.visibility:
        db.execute(update(Recipe).where(Recipe.id == recipe_id, Recipe.owner_id == user.id).values(
            visibility=body.visibility,
            published_at=datetime.now(timezone.utc) if body.visibility == 'public' else None,
        ))
    result = get_recipe(db, recipe_id, user.id)
    db.commit()
    return result


def set_favorite(db: Session, recipe_id: str, user: CurrentUser, enabled: bool) -> None:
    if not enabled:
        # Retrait idempotent possible même après la dépublication par l'auteur.
        db.execute(delete(Favorite).where(Favorite.user_id == user.id, Favorite.recipe_id == recipe_id))
        db.commit()
        return
    if db.scalar(select(Recipe.id).where(Recipe.id == recipe_id, visible(user.id)).with_for_update()) is None:
        fail(404, 'RECIPE_NOT_FOUND', 'Recette introuvable.')
    ensure_profile(db, user)
    db.execute(insert(Favorite).values(user_id=user.id, recipe_id=recipe_id).on_conflict_do_nothing())
    db.commit()
