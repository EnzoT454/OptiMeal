"""Conventions JSON partagées par Recettes et Promos, contrat HTTP v1."""
from decimal import Decimal
from typing import Annotated, Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, AfterValidator, model_validator


class ContractModel(BaseModel):
    model_config = ConfigDict(extra='forbid')


def positive(value: str) -> str:
    if Decimal(value) <= 0:
        raise ValueError('La quantité doit être strictement positive.')
    return value


# Des chaînes à l'entrée comme à la sortie : aucun passage par un float.
DecimalText = Annotated[str, StringConstraints(pattern=r'^(0|[1-9][0-9]*)(\.[0-9]+)?$')]
Quantity = Annotated[DecimalText, AfterValidator(positive)]
IngredientId = Annotated[str, StringConstraints(pattern=r'^ing_[a-z0-9_]+$')]
RecipeUnit = Literal['g', 'ml', 'unit']
Retailer = Literal['maxi', 'metro', 'superc']


class Price(ContractModel):
    kind: Literal['commercial', 'declared', 'estimated', 'unknown']
    currency: Literal['CAD'] = 'CAD'
    amount: DecimalText | None = None
    min_amount: DecimalText | None = None
    max_amount: DecimalText | None = None
    basis: Literal['source_unspecified'] = 'source_unspecified'

    @model_validator(mode='after')
    def coherent_amounts(self):
        if self.kind in ('commercial', 'declared'):
            valid = self.amount is not None and self.min_amount is None and self.max_amount is None
        elif self.kind == 'estimated':
            valid = (self.amount is None and self.min_amount is not None and self.max_amount is not None
                     and Decimal(self.min_amount) <= Decimal(self.max_amount))
        else:
            valid = self.amount is None and self.min_amount is None and self.max_amount is None
        if not valid:
            raise ValueError('Montants incompatibles avec la nature du prix.')
        return self


class ResponseMeta(ContractModel):
    contract_version: Literal['1.0'] = '1.0'
    data_source: Literal['local_json', 'postgresql'] = 'local_json'
    dataset_kind: Literal['source_snapshot', 'demo', 'user_content', 'mixed']
    review_required: bool = True
    warnings: list[str] = Field(default_factory=list)


T = TypeVar('T')


class Page(ContractModel, Generic[T]):
    items: list[T]
    total: int = Field(ge=0)
    limit: int = Field(ge=1, le=100)
    offset: int = Field(ge=0)
    meta: ResponseMeta


class Detail(ContractModel, Generic[T]):
    item: T
    meta: ResponseMeta


class ErrorField(ContractModel):
    field: str
    message: str


class ApiError(ContractModel):
    code: str
    message: str
    details: list[ErrorField] = Field(default_factory=list)


class ErrorResponse(ContractModel):
    error: ApiError
