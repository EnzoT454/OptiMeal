"""Stockage du catalogue initial de recettes et de ses ingrédients quantifiés."""
from decimal import Decimal
from uuid import UUID

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Integer, Numeric, Text, UniqueConstraint, Uuid, text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from backend.app.database import Base


class Recipe(Base):
    __tablename__ = 'recipe'
    __table_args__ = (
        CheckConstraint("id ~ '^recipe_[a-z0-9_]+$'", name='id_format'),
        CheckConstraint("seed_key ~ '^[a-z0-9_]+$'", name='seed_key_format'),
        CheckConstraint('(owner_id IS NULL AND seed_key IS NOT NULL) OR (owner_id IS NOT NULL AND seed_key IS NULL)',
                        name='ownership'),
        CheckConstraint("btrim(name) <> ''", name='name_not_blank'),
        CheckConstraint("btrim(description) <> ''", name='description_not_blank'),
        CheckConstraint("difficulty IN ('easy', 'medium', 'hard')", name='difficulty_supported'),
        CheckConstraint('cardinality(tags) <= 10 AND array_position(tags, NULL) IS NULL', name='tags_valid'),
        CheckConstraint('servings > 0', name='servings_positive'),
        CheckConstraint('prep_time_minutes >= 0 AND cook_time_minutes >= 0', name='times_nonnegative'),
        CheckConstraint('total_time_minutes = prep_time_minutes + cook_time_minutes', name='total_time_consistent'),
        CheckConstraint("jsonb_typeof(instructions) = 'array' AND instructions <> '[]'::jsonb",
                        name='instructions_nonempty_array'),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    seed_key: Mapped[str | None] = mapped_column(Text, nullable=True, unique=True)
    owner_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey('profile.id', ondelete='CASCADE'), nullable=True, index=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    servings: Mapped[int] = mapped_column(Integer, nullable=False)
    prep_time_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    cook_time_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    total_time_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    difficulty: Mapped[str | None] = mapped_column(Text, nullable=True)
    tags: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False, default=list, server_default=text("'{}'::text[]"))
    instructions: Mapped[list[dict]] = mapped_column(JSONB, nullable=False)
    review_required: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('true'))


class RecipeIngredient(Base):
    __tablename__ = 'recipe_ingredient'
    __table_args__ = (
        UniqueConstraint('recipe_id', 'position', name='uq_recipe_ingredient_recipe_position'),
        CheckConstraint('position > 0', name='position_positive'),
        # NUMERIC sans échelle fixe conserve les décimales sans arrondi implicite.
        CheckConstraint("quantity > 0 AND quantity < 'Infinity'::numeric", name='quantity_positive_finite'),
        CheckConstraint("unit IN ('g', 'ml', 'unit')", name='unit_supported'),
        CheckConstraint("unit <> 'unit' OR quantity = trunc(quantity)", name='whole_units'),
    )

    recipe_id: Mapped[str] = mapped_column(
        Text, ForeignKey('recipe.id', ondelete='CASCADE'), primary_key=True,
    )
    ingredient_id: Mapped[str] = mapped_column(
        Text, ForeignKey('ingredient.id', ondelete='RESTRICT'), primary_key=True, index=True,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(), nullable=False)
    unit: Mapped[str] = mapped_column(Text, nullable=False)
    preparation: Mapped[str | None] = mapped_column(Text, nullable=True)


class Favorite(Base):
    __tablename__ = 'favorite'
    user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey('profile.id', ondelete='CASCADE'), primary_key=True)
    recipe_id: Mapped[str] = mapped_column(Text, ForeignKey('recipe.id', ondelete='CASCADE'), primary_key=True, index=True)
