"""Calendrier : chaque utilisateur ne lit et ne modifie que ses propres repas."""
import datetime as dt
from uuid import UUID, uuid4

from sqlalchemy import and_, delete, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from backend.app.accounts.service import ensure_profile
from backend.app.common.public_router import fail
from backend.app.recipes.models import Recipe
from backend.app.recipes.service import visible
from backend.app.security import CurrentUser
from .models import MEALS, MealPlanEntry
from .schemas import MealPlanEntryRead, MealPlanEntryUpdate, MealPlanEntryWrite, MealPlanRead

MEAL_ORDER = {meal: position for position, meal in enumerate(MEALS)}


def monday_of(day: dt.date) -> dt.date:
    """N'importe quel jour -> le lundi de sa semaine (weekday() : lundi = 0)."""
    return day - dt.timedelta(days=day.weekday())


def entries_of(user_id: UUID):
    """Les repas de l'utilisateur + le nom et la photo de la recette (vides pour un texte libre)."""
    return (select(MealPlanEntry, Recipe.name.label('recipe_name'), Recipe.image_url.label('recipe_image_url'))
            .outerjoin(Recipe, and_(Recipe.id == MealPlanEntry.recipe_id, visible(user_id)))
            .where(MealPlanEntry.user_id == user_id))


def to_read(row) -> MealPlanEntryRead:
    entry = row.MealPlanEntry
    return MealPlanEntryRead(id=entry.id, date=entry.date, meal=entry.meal, recipe_id=entry.recipe_id,
                             recipe_name=row.recipe_name, recipe_image_url=row.recipe_image_url,
                             free_text=entry.free_text, servings=entry.servings, is_leftover=entry.is_leftover)


def get_plan(db: Session, user: CurrentUser, day: dt.date) -> MealPlanRead:
    start = monday_of(day)
    rows = db.execute(entries_of(user.id).where(
        MealPlanEntry.date >= start, MealPlanEntry.date < start + dt.timedelta(days=7),
    )).all()
    entries = sorted((to_read(row) for row in rows),
                     key=lambda e: (e.date, MEAL_ORDER[e.meal]))
    return MealPlanRead(week_start=start, entries=entries)


def get_entry(db: Session, entry_id: UUID, user_id: UUID) -> MealPlanEntryRead:
    row = db.execute(entries_of(user_id).where(MealPlanEntry.id == entry_id)).one_or_none()
    if row is None:
        fail(404, 'MEAL_NOT_FOUND', 'Repas introuvable dans ton calendrier.')
    return to_read(row)


def add_entry(db: Session, body: MealPlanEntryWrite, user: CurrentUser) -> MealPlanEntryRead:
    # Recette publique (app ou communauté), ou recette privée du propriétaire.
    if body.recipe_id is not None and db.scalar(
            select(Recipe.id).where(Recipe.id == body.recipe_id, visible(user.id))) is None:
        fail(404, 'RECIPE_NOT_FOUND', 'Recette introuvable.')
    ensure_profile(db, user)
    entry_id = uuid4()
    db.execute(insert(MealPlanEntry).values(id=entry_id, user_id=user.id, **body.model_dump()))
    result = get_entry(db, entry_id, user.id)
    db.commit()
    return result


def update_entry(db: Session, entry_id: UUID, body: MealPlanEntryUpdate, user: CurrentUser) -> MealPlanEntryRead:
    # « AND user_id = moi » : impossible de modifier le repas de quelqu'un d'autre.
    changed = db.execute(update(MealPlanEntry)
                         .where(MealPlanEntry.id == entry_id, MealPlanEntry.user_id == user.id)
                         .values(**body.model_dump(exclude_none=True)).returning(MealPlanEntry.id)).first()
    if changed is None:
        fail(404, 'MEAL_NOT_FOUND', 'Repas introuvable dans ton calendrier.')
    result = get_entry(db, entry_id, user.id)
    db.commit()
    return result


def remove_entry(db: Session, entry_id: UUID, user: CurrentUser) -> None:
    removed = db.execute(delete(MealPlanEntry)
                         .where(MealPlanEntry.id == entry_id, MealPlanEntry.user_id == user.id)
                         .returning(MealPlanEntry.id)).first()
    if removed is None:
        fail(404, 'MEAL_NOT_FOUND', 'Repas introuvable dans ton calendrier.')
    db.commit()
