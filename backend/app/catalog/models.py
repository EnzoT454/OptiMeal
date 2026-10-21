"""Référentiel partagé des ingrédients ; produits et offres restent à ajouter."""
from sqlalchemy import CheckConstraint, Text, text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from backend.app.database import Base


class Ingredient(Base):
    __tablename__ = 'ingredient'
    __table_args__ = (
        CheckConstraint("id ~ '^ing_[a-z0-9_]+$'", name='id_format'),
        CheckConstraint("btrim(name) <> ''", name='name_not_blank'),
        CheckConstraint("btrim(category) <> ''", name='category_not_blank'),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(Text, nullable=False)
    aliases: Mapped[list[str]] = mapped_column(
        ARRAY(Text), nullable=False, default=list, server_default=text("'{}'::text[]"),
    )
