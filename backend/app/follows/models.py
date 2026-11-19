"""Produits suivis : une ligne = un produit que l'utilisateur veut voir quand il est en promo."""
import datetime as dt
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Text, Uuid, text
from sqlalchemy.orm import Mapped, mapped_column

from backend.app.database import Base

RETAILERS = ('maxi', 'metro', 'superc')


class ProductFollow(Base):
    __tablename__ = 'product_follow'
    __table_args__ = (
        CheckConstraint("retailer IN ('maxi', 'metro', 'superc')", name='retailer_supported'),
        CheckConstraint('char_length(product_id) BETWEEN 1 AND 200', name='product_id_length'),
        CheckConstraint("btrim(name) <> '' AND char_length(name) <= 200", name='name_length'),
    )

    # Compte supprimé -> ses suivis aussi.
    user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey('profile.id', ondelete='CASCADE'), primary_key=True,
    )
    # Pas de clé étrangère vers le catalogue : il change chaque semaine, le suivi doit rester.
    product_id: Mapped[str] = mapped_column(Text, primary_key=True)
    retailer: Mapped[str] = mapped_column(Text, nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    since: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text('now()'))