"""Contrats de lecture du catalogue initial de recettes, indépendants du stockage."""
from decimal import Decimal
from datetime import date
from typing import Annotated, Literal

from pydantic import Field, StringConstraints, model_validator

from backend.app.common.contracts import ContractModel, IngredientId, Quantity, RecipeUnit

NonEmpty = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class RecipeIngredient(ContractModel):
    ingredient_id: IngredientId
    quantity: Quantity
    unit: RecipeUnit
    preparation: str | None

    @model_validator(mode='after')
    def whole_units(self):
        if self.unit == 'unit' and Decimal(self.quantity) != Decimal(self.quantity).to_integral_value():
            raise ValueError('La première version accepte uniquement des pièces entières.')
        return self


class RecipeStep(ContractModel):
    position: int = Field(ge=1, strict=True)
    text: NonEmpty


class RecipeWrite(ContractModel):
    name: NonEmpty
    description: NonEmpty
    servings: int = Field(gt=0, strict=True)
    prep_time_minutes: int = Field(ge=0, strict=True)
    cook_time_minutes: int = Field(ge=0, strict=True)
    total_time_minutes: int = Field(ge=0, strict=True)
    image_url: str | None
    ingredients: list[RecipeIngredient] = Field(min_length=1)
    instructions: list[RecipeStep] = Field(min_length=1)

    @model_validator(mode='after')
    def coherent_recipe(self):
        if self.total_time_minutes != self.prep_time_minutes + self.cook_time_minutes:
            raise ValueError('Durée totale incohérente.')
        if [s.position for s in self.instructions] != list(range(1, len(self.instructions) + 1)):
            raise ValueError('Les étapes doivent être ordonnées de 1 à N.')
        ids = [i.ingredient_id for i in self.ingredients]
        if len(ids) != len(set(ids)):
            raise ValueError('Un ingrédient apparaît plusieurs fois dans la recette.')
        return self


class RecipeSeed(RecipeWrite):
    seed_key: Annotated[str, StringConstraints(pattern=r'^[a-z0-9_]+$')]


class RecipeSummary(ContractModel):
    id: str
    name: str
    description: str
    servings: int = Field(gt=0)
    total_time_minutes: int = Field(ge=0)
    image_url: str | None
    review_required: bool = True
    is_owned: bool = False
    is_favorite: bool = False


class RecipeRead(RecipeSummary):
    prep_time_minutes: int = Field(ge=0)
    cook_time_minutes: int = Field(ge=0)
    ingredients: list[RecipeIngredient]
    instructions: list[RecipeStep]


class RecipeSeedDocument(ContractModel):
    schema_version: Literal['recipe-seed-1.0']
    dataset_kind: Literal['demo']
    status: Literal['review_required']
    created_at: date
    source: dict[str, str]
    ingredient_mapping: str
    ingredient_catalog: str
    water_policy: str
    recipes: list[RecipeSeed]

    @model_validator(mode='after')
    def unique_seed_keys(self):
        keys = [r.seed_key for r in self.recipes]
        if len(keys) != len(set(keys)):
            raise ValueError('Clés de recettes dupliquées.')
        return self
