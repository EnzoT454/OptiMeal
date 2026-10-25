"""Données communes sur disque et ressources publiques de l'API v1."""
from datetime import date
from typing import Literal
from urllib.parse import quote

from pydantic import Field, StrictBool, model_validator

from backend.app.common.contracts import ContractModel, DecimalText, IngredientId, Price, Retailer


class IngredientRead(ContractModel):
    id: IngredientId
    name: str = Field(min_length=1)
    category: str = Field(min_length=1)
    aliases: list[str]


class SourceReference(ContractModel):
    retailer: Retailer
    path: str
    ingredient_id: int = Field(strict=True)
    name: str


class SourceProduct(ContractModel):
    id: str
    retailer: Retailer
    store_id: str | None
    external_product_id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    price: DecimalText | None
    # Ajout page Promos : price = prix de base, promo_price = prix en promotion (null sinon)
    promo_price: DecimalText | None = None
    currency: Literal['CAD']
    unit: str | None
    quantity: DecimalText | None
    valid_from: date | None
    valid_to: date | None
    # Ajout page Promos : jour où les données ont été récupérées
    retrieved_at: date | None = None
    is_promotion: StrictBool | None
    source: str
    url: str | None

    @model_validator(mode='after')
    def coherent_dates(self):
        expected_id = ':'.join(quote(value, safe='') for value in
                               (self.retailer, self.store_id or '', self.external_product_id))
        if self.id != expected_id:
            raise ValueError('Identifiant produit incompatible avec sa provenance.')
        if self.valid_from and self.valid_to and self.valid_from > self.valid_to:
            raise ValueError('Période de validité inversée.')
        return self


class SourceIngredient(IngredientRead):
    # Ajout page Promos : numéro de la catégorie (voir categories.json)
    category_id: int | None = Field(default=None, strict=True)
    sources: list[SourceReference]
    products: list[SourceProduct]


class InputFingerprint(ContractModel):
    path: str
    sha256: str


# Ajout page Promos : liste des catégories avec leur numéro
class Category(ContractModel):
    id: int = Field(strict=True)
    name: str = Field(min_length=1)


class CommonCatalog(ContractModel):
    schema_version: Literal['common-catalog-1.0']
    status: Literal['assembled_from_local_sources']
    mapping_status: Literal['proposed']
    inputs: list[InputFingerprint]
    ingredient_count: int
    product_count: int
    categories: list[Category] | None = None
    ingredients: list[SourceIngredient]

    @model_validator(mode='after')
    def coherent_counts(self):
        ids = [i.id for i in self.ingredients]
        if len(ids) != len(set(ids)) or self.ingredient_count != len(ids):
            raise ValueError('Identifiants ou nombre d’ingrédients incohérents.')
        if self.product_count != sum(len(i.products) for i in self.ingredients):
            raise ValueError('Nombre de fiches produits incohérent.')
        for ingredient in self.ingredients:
            product_ids = [p.id for p in ingredient.products]
            if len(product_ids) != len(set(product_ids)):
                raise ValueError('Fiches produits dupliquées pour un ingrédient.')
        return self


class SourceFormat(ContractModel):
    quantity: DecimalText | None
    unit_raw: str | None
    basis: Literal['source_unspecified'] = 'source_unspecified'


class Promotion(ContractModel):
    declared: StrictBool | None
    valid_from: date | None
    valid_to: date | None
    status: Literal['active', 'expired', 'upcoming', 'unverifiable', 'not_promotion', 'unknown']
    evaluated_on: date


class OfferSource(ContractModel):
    kind: str
    url: str | None
    review_required: Literal[True] = True


class OfferRead(ContractModel):
    id: str
    product_id: str
    ingredient_id: IngredientId
    product_name: str
    retailer: Retailer
    store_id: str | None
    external_store_id: str | None
    external_product_id: str
    format: SourceFormat
    price: Price
    # Ajouts page Promos : price = prix de base, promo_price = prix en promotion (null sinon)
    promo_price: Price | None = None
    category_id: int | None = Field(default=None, strict=True)
    retrieved_at: date | None = None
    promotion: Promotion
    source: OfferSource