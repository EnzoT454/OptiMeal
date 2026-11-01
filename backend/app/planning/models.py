"""Calendrier des repas : une ligne = un repas prévu (une recette OU un texte libre) un jour donné."""
import datetime as dt
from uuid import UUID, uuid4

from sqlalchemy import CheckConstraint, Date, ForeignKey, Index, Integer, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from backend.app.database import Base

MEALS = ('dejeuner', 'diner', 'souper', 'collation')


class MealPlanEntry(Base):
    __tablename__ = 'meal_plan_entry'
    __table_args__ = (
        CheckConstraint("meal IN ('dejeuner', 'diner', 'souper', 'collation')", name='meal_supported'),
        CheckConstraint('servings > 0 AND servings <= 50', name='servings_range'),
        # Exactement un des deux : une recette, ou un texte libre non vide (« Restes », « Resto »).
        CheckConstraint(
            "(recipe_id IS NOT NULL AND free_text IS NULL) OR "
            "(recipe_id IS NULL AND free_text IS NOT NULL AND btrim(free_text) <> '')",
            name='recipe_or_free_text',
        ),
        CheckConstraint('char_length(free_text) <= 80', name='free_text_length'),
        # Lire une semaine = chercher par utilisateur puis par date : cet index rend ça rapide.
        Index('ix_meal_plan_entry_user_id_date', 'user_id', 'date'),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    # Compte supprimé -> ses repas aussi.
    user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey('profile.id', ondelete='CASCADE'), nullable=False)
    date: Mapped[dt.date] = mapped_column(Date, nullable=False)
    meal: Mapped[str] = mapped_column(Text, nullable=False)
    # Option A : recette supprimée -> le repas disparaît du calendrier.
    recipe_id: Mapped[str | None] = mapped_column(
        Text, ForeignKey('recipe.id', ondelete='CASCADE'), nullable=True, index=True,
    )
    free_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    servings: Mapped[int] = mapped_column(Integer, nullable=False)