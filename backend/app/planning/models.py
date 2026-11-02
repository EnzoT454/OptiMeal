"""Calendrier des repas : une ligne = un repas prévu (une recette OU un texte libre) un jour donné."""
import datetime as dt
from uuid import UUID, uuid4

from sqlalchemy import Boolean, CheckConstraint, Date, ForeignKey, Index, Integer, Text, Uuid, text
from sqlalchemy.orm import Mapped, mapped_column

from backend.app.database import Base

MEALS = ('dejeuner', 'diner', 'souper', 'collation')


class MealPlanEntry(Base):
    __tablename__ = 'meal_plan_entry'
    __table_args__ = (
        CheckConstraint("meal IN ('dejeuner', 'diner', 'souper', 'collation')", name='meal_supported'),
        CheckConstraint('servings > 0 AND servings <= 50', name='servings_range'),
        # Deux valeurs nulles conservent un repas dont la recette a été supprimée.
        CheckConstraint(
            "(recipe_id IS NOT NULL AND free_text IS NULL) OR "
            "(recipe_id IS NULL AND free_text IS NOT NULL AND btrim(free_text) <> '') OR "
            "(recipe_id IS NULL AND free_text IS NULL)",
            name='recipe_or_free_text',
        ),
        CheckConstraint('char_length(free_text) <= 80', name='free_text_length'),
        # Des restes viennent toujours d'une recette (pas de « restes de Resto »).
        CheckConstraint('NOT is_leftover OR free_text IS NULL', name='leftover_needs_recipe'),
        # Lire une semaine = chercher par utilisateur puis par date : cet index rend ça rapide.
        Index('ix_meal_plan_entry_user_id_date', 'user_id', 'date'),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    # Compte supprimé -> ses repas aussi.
    user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey('profile.id', ondelete='CASCADE'), nullable=False)
    date: Mapped[dt.date] = mapped_column(Date, nullable=False)
    meal: Mapped[str] = mapped_column(Text, nullable=False)
    # Recette supprimée -> le repas reste présent, sans référence ni contenu.
    recipe_id: Mapped[str | None] = mapped_column(
        Text, ForeignKey('recipe.id', ondelete='SET NULL'), nullable=True, index=True,
    )
    free_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    servings: Mapped[int] = mapped_column(Integer, nullable=False)
    # Le marquage de restes est conservé même si la recette est supprimée.
    is_leftover: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('false'))
