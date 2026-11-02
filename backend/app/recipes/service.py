"""Recettes partagées et personnelles ; autorisations vérifiées avant toute lecture ou mutation."""
from uuid import UUID, uuid4
from decimal import Decimal
from datetime import datetime, timezone

from sqlalchemy import delete, exists, func, or_, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from backend.app.accounts.service import ensure_profile
from backend.app.common.public_data import search_text
from backend.app.common.public_router import fail
from backend.app.security import CurrentUser
from .models import Favorite, Recipe, RecipeIngredient, RecipeRating
from .ratings import (summarize_ratings, TASTE_WEIGHT, RELIABILITY_WEIGHT, EASE_WEIGHT,
                      DEFAULT_PRIOR_WEIGHT, DEFAULT_REFERENCE_AVERAGE)
from .schemas import (RatingCriteria, RecipeCreate, RecipeRead, RecipeScope, RecipeSummary,
                      RecipeVisibilityUpdate, RecipeWrite, RecipeRatingRead, RecipeRatingWrite,
                      RecipeRatingSummary, RecipeSort)


def visible(user_id: UUID | None):
    if user_id is None:
        return Recipe.visibility == 'public'
    return or_(Recipe.visibility == 'public', Recipe.owner_id == user_id)


def favorite_for(user_id: UUID | None):
    return exists(select(Favorite.recipe_id).where(Favorite.recipe_id == Recipe.id, Favorite.user_id == user_id))


def rating_summaries(db: Session, recipe_ids: list[str], user_id: UUID | None) -> dict[str, RecipeRatingSummary]:
    """Une agrégation SQL pour toute la page ; aucun vote individuel exposé."""
    if not recipe_ids:
        return {}
    rows = db.execute(select(
        RecipeRating.recipe_id, func.count().label('count'),
        func.sum(RecipeRating.taste_score).label('taste_total'),
        func.sum(RecipeRating.reliability_score).label('reliability_total'),
        func.sum(RecipeRating.ease_score).label('ease_total'),
    ).join(Recipe, Recipe.id == RecipeRating.recipe_id)
        .where(Recipe.id.in_(recipe_ids), visible(user_id),
               RecipeRating.recipe_version == Recipe.content_version).group_by(RecipeRating.recipe_id))
    summaries = {}
    for row in rows.mappings():
        result = summarize_ratings(**{key: row[key] for key in
                                     ('count', 'taste_total', 'reliability_total', 'ease_total')})
        summaries[row['recipe_id']] = RecipeRatingSummary(
            count=result.count, average=result.average,
            criteria=RatingCriteria(taste=result.taste, reliability=result.reliability, ease=result.ease))
    return summaries


def list_recipes(db: Session, *, q: str, quick: bool, limit: int, offset: int,
                 user_id: UUID | None = None, favorites: bool = False,
                 scope: RecipeScope = 'accessible', sort: RecipeSort | None = None) -> tuple[list[RecipeSummary], int]:
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
    statement = select(*columns, Recipe.owner_id, favorite_for(user_id).label('is_favorite')).where(*conditions)
    selected_sort = sort or {'discover': 'top', 'favorites': 'top', 'mine': 'updated'}.get(scope)
    if selected_sort == 'top':
        # nR est la somme pondérée : même méthode que ratings.py, sans
        # arrondir les moyennes ni charger les recettes avant pagination.
        weighted_sum = (TASTE_WEIGHT * func.sum(RecipeRating.taste_score)
                        + RELIABILITY_WEIGHT * func.sum(RecipeRating.reliability_score)
                        + EASE_WEIGHT * func.sum(RecipeRating.ease_score))
        scores = select(RecipeRating.recipe_id,
                        ((weighted_sum + DEFAULT_PRIOR_WEIGHT * DEFAULT_REFERENCE_AVERAGE)
                         / (func.count() + DEFAULT_PRIOR_WEIGHT)).label('score'))\
            .join(Recipe, Recipe.id == RecipeRating.recipe_id)\
            .where(RecipeRating.recipe_version == Recipe.content_version)\
            .group_by(RecipeRating.recipe_id).subquery()
        statement = statement.outerjoin(scores, scores.c.recipe_id == Recipe.id)
        ordering = [scores.c.score.desc().nulls_last(), Recipe.id]
    elif selected_sort == 'newest':
        date = Recipe.created_at if scope == 'mine' else func.coalesce(Recipe.published_at, Recipe.created_at)
        ordering = [date.desc().nulls_last(), Recipe.id]
    elif selected_sort == 'updated':
        ordering = [Recipe.updated_at.desc().nulls_last(), Recipe.id]
    else:
        # Compatibilité des appels historiques sans section ni tri explicites.
        ordering = [Recipe.id]
    rows = db.execute(statement.order_by(*ordering).limit(limit).offset(offset)).mappings().all()
    ratings = rating_summaries(db, [row['id'] for row in rows], user_id)
    items = []
    for row in rows:
        fields = {key: row[key] for key in RecipeSummary.model_fields if key in row}
        fields['is_owned'] = user_id is not None and row['owner_id'] == user_id
        fields['rating'] = ratings.get(row['id'], RecipeRatingSummary())
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
    rating = rating_summaries(db, [recipe_id], user_id).get(recipe_id, RecipeRatingSummary())
    my_rating = None
    if user_id is not None:
        row = db.execute(select(RecipeRating.__table__).join(Recipe, Recipe.id == RecipeRating.recipe_id)
                         .where(RecipeRating.recipe_id == recipe_id, RecipeRating.user_id == user_id,
                                visible(user_id))
                         .order_by(RecipeRating.recipe_version.desc()).limit(1)).mappings().one_or_none()
        if row is not None:
            my_rating = RecipeRatingRead.model_validate({key: row[key] for key in RecipeRatingRead.model_fields})
    return RecipeRead(id=recipe_id, review_required=recipe['review_required'],
                      content_version=recipe['content_version'],
                      visibility=recipe['visibility'], published_at=recipe['published_at'],
                      created_at=recipe['created_at'], updated_at=recipe['updated_at'],
                      is_owned=user_id is not None and recipe['owner_id'] == user_id,
                      is_favorite=favorite, rating=rating, my_rating=my_rating, **validated.model_dump())


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


def rating_content_changed(db: Session, recipe_id: str, body: RecipeWrite) -> bool:
    """Comparer le contenu préparé, sans invalider les notes pour un simple réordonnancement d'ingrédients."""
    before = db.execute(select(Recipe.servings, Recipe.prep_time_minutes, Recipe.cook_time_minutes,
                               Recipe.instructions).where(Recipe.id == recipe_id)).one()
    if (before.servings, before.prep_time_minutes, before.cook_time_minutes) != (
            body.servings, body.prep_time_minutes, body.cook_time_minutes):
        return True
    if [(step['position'], step['text'].strip()) for step in before.instructions] != [
            (step.position, step.text) for step in body.instructions]:
        return True
    ingredients = db.execute(select(RecipeIngredient.ingredient_id, RecipeIngredient.quantity,
                                   RecipeIngredient.unit, RecipeIngredient.preparation)
                             .where(RecipeIngredient.recipe_id == recipe_id)).all()
    old = sorted((row.ingredient_id, row.quantity, row.unit, (row.preparation or '').strip()) for row in ingredients)
    new = sorted((row.ingredient_id, Decimal(row.quantity), row.unit, (row.preparation or '').strip()) for row in body.ingredients)
    return old != new


def update_recipe(db: Session, recipe_id: str, body: RecipeWrite, user: CurrentUser) -> RecipeRead:
    owned_recipe(db, recipe_id, user)
    rows = ingredient_rows(db, body, recipe_id)
    values = body.model_dump(exclude={'ingredients'}, exclude_unset=True)
    if rating_content_changed(db, recipe_id, body):
        values['content_version'] = Recipe.content_version + 1
    db.execute(update(Recipe).where(Recipe.id == recipe_id, Recipe.owner_id == user.id)
               .values(**values))
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


def set_rating(db: Session, recipe_id: str, body: RecipeRatingWrite, user: CurrentUser) -> RecipeRead:
    # Même verrou que publication/retrait/suppression, détenu jusqu'au commit.
    recipe = db.execute(select(Recipe.owner_id, Recipe.visibility, Recipe.content_version)
                        .where(Recipe.id == recipe_id, visible(user.id)).with_for_update()).one_or_none()
    if recipe is None:
        fail(404, 'RECIPE_NOT_FOUND', 'Recette introuvable.')
    if recipe.owner_id == user.id:
        fail(403, 'SELF_RATING_FORBIDDEN', 'Tu ne peux pas noter ta propre recette.')
    if body.recipe_version != recipe.content_version:
        fail(409, 'RECIPE_VERSION_CONFLICT', 'La recette a changé. Actualise-la et relis-la avant de la noter.')
    ensure_profile(db, user)
    values = body.model_dump()
    db.execute(insert(RecipeRating).values(recipe_id=recipe_id, user_id=user.id, **values)
               .on_conflict_do_update(index_elements=['recipe_id', 'user_id', 'recipe_version'],
                                      set_={**values, 'updated_at': func.now()}))
    result = get_recipe(db, recipe_id, user.id)
    db.commit()
    return result


def delete_rating(db: Session, recipe_id: str, user: CurrentUser) -> None:
    # Le verrou sérialise aussi un retrait avec un vote concurrent. Aucune
    # information sur une recette absente/privée n'est renvoyée au demandeur.
    db.execute(select(Recipe.id).where(Recipe.id == recipe_id).with_for_update()).all()
    db.execute(delete(RecipeRating).where(RecipeRating.recipe_id == recipe_id, RecipeRating.user_id == user.id))
    db.commit()
