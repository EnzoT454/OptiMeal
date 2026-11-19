"""Forme des données des produits suivis : identique au type Follow de mobile/components/follows.ts."""
import datetime as dt
from typing import Literal

from pydantic import Field, field_validator

from backend.app.common.contracts import ContractModel

Retailer = Literal['maxi', 'metro', 'superc']


class FollowWrite(ContractModel):
    """Ce que l'app envoie pour suivre un produit (appel répétable sans doublon)."""
    product_id: str = Field(min_length=1, max_length=200)
    retailer: Retailer
    name: str = Field(min_length=1, max_length=200)
    # Seulement pour transférer les suivis déjà sur le téléphone en gardant leur date.
    since: dt.datetime | None = None

    @field_validator('name')
    @classmethod
    def strip_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError('Le nom du produit ne peut pas être vide.')
        return value


class FollowRead(ContractModel):
    product_id: str
    retailer: Retailer
    name: str
    since: dt.datetime


class FollowListRead(ContractModel):
    items: list[FollowRead]