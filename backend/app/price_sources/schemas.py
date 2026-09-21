"""Contrat fournisseur : champs additionnels conservés, données requises validées."""
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field

Store = Literal['maxi', 'iga', 'superc', 'metro', 'provigo', 'walmart']
Money = Annotated[Decimal, Field(ge=0, allow_inf_nan=False)]


class SourceModel(BaseModel):
    model_config = ConfigDict(extra='allow')


class UnitPrice(SourceModel):
    value: Money | None = None
    unit: str
    raw: str


class Price(SourceModel):
    store: Store
    price: Money
    discounted: bool
    size: str | None = None
    unitPrice: UnitPrice | None = None
    link: str | None = None
    date: AwareDatetime
    timestamp: int


class Product(SourceModel):
    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    brand: str | None = None
    size: str | None = None
    category: int | None = None
    price: Money
    store: Store
    discounted: bool
    updated: AwareDatetime
    url: str
    prices: list[Price]


class SearchItem(SourceModel):
    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    price: Money
    store: Store


class SearchPage(SourceModel):
    count: int = Field(ge=0)
    limit: int = Field(ge=1, le=100)
    offset: int = Field(ge=0)
    hasMore: bool
    results: list[SearchItem]


class Category(SourceModel):
    id: int
    name: str


class Categories(SourceModel):
    count: int = Field(ge=0)
    categories: list[Category]
