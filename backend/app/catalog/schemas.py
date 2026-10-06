"""Contrat du premier livrable catalogue, sans persistance ni approbation implicite."""
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field


class CatalogModel(BaseModel):
    model_config = ConfigDict(extra='forbid')


class Ingredient(CatalogModel):
    id: str
    name: str
    category: str
    aliases: list[str] = Field(min_length=1)
    excluded_terms: list[str]
    required_any: list[str] = Field(default_factory=list)


class ProductFormat(CatalogModel):
    raw: str | None
    kind: Literal['fixed', 'variable_weight', 'unknown']
    quantity: Annotated[Decimal, Field(gt=0, allow_inf_nan=False)] | None = None
    unit: Literal['g', 'ml', 'unit'] | None = None
    package_count: int | None = Field(default=None, gt=0)
    warnings: list[str] = Field(default_factory=list)


class CatalogProduct(CatalogModel):
    id: str
    external_product_id: str
    identity_status: Literal['source_candidate'] = 'source_candidate'
    name: str
    brand: str | None
    barcode: str | None = None
    format: ProductFormat


class CatalogOffer(CatalogModel):
    id: str
    product_id: str
    retailer_id: str
    store_id: str | None = None
    scope_kind: Literal['unknown', 'source_reported_store'] = 'unknown'
    source_name: Literal['apify_loblaws']
    external_store_id: str | None = None
    source_unit_price: str | None = None
    multi_buy_deal: str | None = None
    loyalty_offer: str | None = None
    amount: Annotated[Decimal, Field(ge=0, allow_inf_nan=False)]
    regular_price: Annotated[Decimal, Field(ge=0, allow_inf_nan=False)] | None = None
    currency: Literal['CAD'] = 'CAD'
    price_kind: Literal['commercial'] = 'commercial'
    basis: Literal['unknown'] = 'unknown'
    is_promotion: bool | None
    loyalty_required: bool | None = None
    valid_from: None = None
    valid_to: None = None
    observed_at: AwareDatetime
    retrieved_at: AwareDatetime
    source_url: str
    retailer_url: str | None
    capture_id: str
    review_required: Literal[True] = True
    eligible_for_optimizer: Literal[False] = False
    warnings: list[str]


class IngredientMatch(CatalogModel):
    ingredient_id: str
    product_id: str
    status: Literal['suggested', 'rejected']
    method: Literal['alias_rules'] = 'alias_rules'
    reasons: list[str]


class Coverage(CatalogModel):
    ingredient_id: str
    candidate_count: int
    offer_count: int
    verified_store_offer_count: Literal[0] = 0
    status: Literal['review_required', 'no_reference_found']


class CatalogExport(CatalogModel):
    schema_version: Literal['catalog-pilot-1.0'] = 'catalog-pilot-1.0'
    status: Literal['review_required'] = 'review_required'
    dataset_kind: Literal['real', 'demo']
    evaluated_at: AwareDatetime
    target_store: dict
    ingredients: list[Ingredient]
    products: list[CatalogProduct]
    offers: list[CatalogOffer]
    matches: list[IngredientMatch]
    coverage: list[Coverage]
    collection: dict
    warnings: list[str]
