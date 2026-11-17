"""Contrats privés de réutilisation : aucun achat ou tarif dans un modèle."""
from datetime import date
from typing import Annotated, Literal
from uuid import UUID
from pydantic import AwareDatetime, Field, StrictBool, StringConstraints, model_validator
from backend.app.common.contracts import ContractModel, IngredientId
from .schemas import Name, Revision, ShoppingBaseQuantity, unique_units

TemplateIcon = Literal['basket', 'cart', 'leaf', 'restaurant', 'home']
ProductId = Annotated[str, StringConstraints(min_length=1, max_length=512)]


class ShoppingDuplicateWrite(ContractModel):
    source_revision: Revision
    name: Name
    purchase_date: date
    include_choices: StrictBool = False


class ShoppingTemplateItem(ContractModel):
    id: UUID
    ingredient_id: IngredientId | None
    name: Name
    category: Name
    required: list[ShoppingBaseQuantity] = Field(max_length=3)
    preferred_product_id: ProductId | None = None

    @model_validator(mode='after')
    def quantities(self):
        unique_units(self.required)
        if self.preferred_product_id and self.ingredient_id is None:
            raise ValueError('Un choix de produit exige un ingrédient identifié.')
        return self


def unique_items(items):
    if len({item.id for item in items}) != len(items):
        raise ValueError('Identifiants d’articles du modèle dupliqués.')


class ShoppingTemplateCreate(ContractModel):
    source_list_id: UUID
    source_revision: Revision
    name: Name
    icon: TemplateIcon = 'basket'
    include_choices: StrictBool = False


class ShoppingTemplateUpdate(ContractModel):
    expected_revision: Revision
    name: Name | None = None
    icon: TemplateIcon | None = None
    items: list[ShoppingTemplateItem] | None = Field(default=None, max_length=500)

    @model_validator(mode='after')
    def changes(self):
        fields = self.model_fields_set - {'expected_revision'}
        if not fields or any(getattr(self, key) is None for key in fields):
            raise ValueError('Indiquer une modification non nulle du modèle.')
        if self.items is not None:
            unique_items(self.items)
        return self


class ShoppingTemplateRead(ContractModel):
    id: UUID
    name: Name
    icon: TemplateIcon
    revision: Revision
    items: list[ShoppingTemplateItem] = Field(max_length=500)
    deleted: StrictBool = False
    created_at: AwareDatetime
    updated_at: AwareDatetime

    @model_validator(mode='after')
    def coherent(self):
        unique_items(self.items)
        if self.updated_at < self.created_at:
            raise ValueError('Dates du modèle inversées.')
        return self


class ShoppingTemplateInstantiate(ContractModel):
    expected_template_revision: Revision
    name: Name
    purchase_date: date
    include_choices: StrictBool = False


class ShoppingExclusionWrite(ContractModel):
    excluded: StrictBool


class ShoppingExclusionRead(ContractModel):
    ingredient_id: IngredientId
    name: Name
    excluded: StrictBool
    updated_at: AwareDatetime
