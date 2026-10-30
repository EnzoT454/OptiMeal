"""Référentiel partagé des ingrédients, catégories et offres des magasins."""
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, ForeignKey, Integer, Numeric, Text, text
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


class Category(Base):
    """Rayons communs aux trois magasins (data/catalog/baseCommune/categories.json)."""
    __tablename__ = 'category'
    __table_args__ = (
        CheckConstraint("btrim(name) <> ''", name='name_not_blank'),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    name: Mapped[str] = mapped_column(Text, nullable=False, unique=True)


class ProductOffer(Base):
    """Un produit vendu dans un magasin, avec son prix de base et son prix promo.

    Une ligne par produit : un nouvel import actualise la ligne de même id.
    L'historique des prix pourra faire l'objet d'une migration séparée.
    """
    __tablename__ = 'product_offer'
    __table_args__ = (
        CheckConstraint("retailer IN ('maxi', 'metro', 'superc')", name='retailer_supported'),
        CheckConstraint("currency = 'CAD'", name='currency_cad'),
        CheckConstraint('price IS NULL OR price >= 0', name='price_not_negative'),
        CheckConstraint('promo_price IS NULL OR promo_price >= 0', name='promo_price_not_negative'),
        CheckConstraint('quantity IS NULL OR quantity > 0', name='quantity_positive'),
        CheckConstraint('valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from', name='validity_ordered'),
        CheckConstraint('position > 0', name='position_positive'),
        CheckConstraint("image_url IS NULL OR image_url LIKE 'https://%'", name='image_url_https'),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    ingredient_id: Mapped[str] = mapped_column(Text, ForeignKey('ingredient.id'), nullable=False, index=True)
    category_id: Mapped[int | None] = mapped_column(Integer, ForeignKey('category.id'))
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    retailer: Mapped[str] = mapped_column(Text, nullable=False)
    store_id: Mapped[str | None] = mapped_column(Text)
    external_product_id: Mapped[str] = mapped_column(Text, nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    price: Mapped[Decimal | None] = mapped_column(Numeric)
    promo_price: Mapped[Decimal | None] = mapped_column(Numeric)
    currency: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'CAD'"))
    unit: Mapped[str | None] = mapped_column(Text)
    quantity: Mapped[Decimal | None] = mapped_column(Numeric)
    valid_from: Mapped[date | None] = mapped_column(Date)
    valid_to: Mapped[date | None] = mapped_column(Date)
    retrieved_at: Mapped[date | None] = mapped_column(Date)
    is_promotion: Mapped[bool | None] = mapped_column(Boolean)
    source: Mapped[str] = mapped_column(Text, nullable=False)
    url: Mapped[str | None] = mapped_column(Text)
    # Photo du produit (lien direct vers le site du magasin) et sa provenance
    image_url: Mapped[str | None] = mapped_column(Text)
    image_source: Mapped[str | None] = mapped_column(Text)


class Circular(Base):
    """La circulaire de la semaine d'un magasin : une seule ligne par magasin.

    Les pages sont des images JPEG dans le bucket Storage public « circulars » :
    {storage_prefix}/p01.jpg, p02.jpg… Un nouvel import remplace la ligne et les images.
    """
    __tablename__ = 'circular'
    __table_args__ = (
        CheckConstraint("retailer IN ('maxi', 'metro', 'superc')", name='retailer_supported'),
        CheckConstraint('valid_to >= valid_from', name='validity_ordered'),
        CheckConstraint('page_count > 0', name='page_count_positive'),
        CheckConstraint("btrim(storage_prefix) <> ''", name='storage_prefix_not_blank'),
    )

    retailer: Mapped[str] = mapped_column(Text, primary_key=True)
    valid_from: Mapped[date] = mapped_column(Date, nullable=False)
    valid_to: Mapped[date] = mapped_column(Date, nullable=False)
    page_count: Mapped[int] = mapped_column(Integer, nullable=False)
    storage_prefix: Mapped[str] = mapped_column(Text, nullable=False)
    imported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text('now()'))