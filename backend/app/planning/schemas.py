"""Forme des données du calendrier : identique au type MealPlan de mobile/types/api.ts."""
import datetime as dt
from typing import Literal
from uuid import UUID

from pydantic import Field, field_validator, model_validator

from backend.app.common.contracts import ContractModel

MealType = Literal['dejeuner', 'diner', 'souper', 'collation']


class MealPlanEntryWrite(ContractModel):
    """Ce que l'app envoie pour ajouter un repas."""
    date: dt.date
    meal: MealType
    recipe_id: str | None = Field(default=None, pattern=r'^recipe_[a-z0-9_]+$')
    free_text: str | None = Field(default=None, max_length=80)
    servings: int = Field(default=2, ge=1, le=50)
    is_leftover: bool = False

    @field_validator('free_text')
    @classmethod
    def strip_free_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError('Le texte libre ne peut pas être vide.')
        return value

    @model_validator(mode='after')
    def recipe_or_text(self):
        if (self.recipe_id is None) == (self.free_text is None):
            raise ValueError('Donner une recette OU un texte libre (un seul des deux).')
        if self.is_leftover and self.recipe_id is None:
            raise ValueError('Des restes doivent venir d\'une recette.')
        return self


class MealPlanEntryUpdate(ContractModel):
    """Pour l'instant on ne change que les portions."""
    servings: int = Field(ge=1, le=50)


class MealPlanEntryRead(ContractModel):
    id: UUID
    date: dt.date
    meal: MealType
    recipe_id: str | None
    recipe_name: str | None
    free_text: str | None
    servings: int
    is_leftover: bool


class MealPlanRead(ContractModel):
    week_start: dt.date  # toujours un lundi
    entries: list[MealPlanEntryRead]