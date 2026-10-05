"""Contrat JSON des reçus OCR, distinct des prix commerciaux du catalogue."""
from datetime import date
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

Money = Annotated[Decimal, Field(ge=0, allow_inf_nan=False, decimal_places=2)]
Quantity = Annotated[Decimal, Field(gt=0, allow_inf_nan=False)]


class ReceiptModel(BaseModel):
    model_config = ConfigDict(extra='forbid')


class OCRBlock(ReceiptModel):
    text: str
    confidence: float = Field(ge=0, le=1)
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    width: float = Field(gt=0, le=1)
    height: float = Field(gt=0, le=1)
    line_key: str | None = None


class ReceiptItem(ReceiptModel):
    line_id: int = Field(gt=0)
    product_code: str | None = None
    name: str = Field(min_length=1)
    category_raw: str | None = None
    format_raw: str | None = None
    quantity: Quantity | None = None
    unit: Literal['unit', 'kg', 'lb'] | None = None
    quantity_source: Literal['explicit', 'unknown'] = 'unknown'
    unit_price: Money | None = None
    line_total: Money | None = None
    source_lines: list[str]
    review_required: Literal[True] = True
    warnings: list[str] = Field(default_factory=list)


class ReceiptAdjustment(ReceiptModel):
    amount: Annotated[Decimal, Field(allow_inf_nan=False, decimal_places=2)] | None
    effect: Literal['applied', 'informational', 'unknown']
    source_line: str
    review_required: Literal[True] = True


class ReceiptTotals(ReceiptModel):
    subtotal: Money | None = None
    total: Money | None = None
    taxes: Money | None = None
    items_sum: Money
    calculated_subtotal: Decimal | None = None
    difference_from_subtotal: Decimal | None = None
    arithmetic_status: Literal['matches', 'mismatch', 'unverifiable']
    tax_check_status: Literal['matches', 'mismatch', 'unverifiable'] = 'unverifiable'


class ReceiptSource(ReceiptModel):
    filename: str
    sha256: str = Field(pattern=r'^[a-f0-9]{64}$')
    engine: str
    elapsed_seconds: float = Field(ge=0)


class ReceiptExtraction(ReceiptModel):
    schema_version: Literal['receipt-1.1'] = 'receipt-1.1'
    parsing_profile: Literal['maxi', 'metro', 'generic'] = 'generic'
    status: Literal['review_required'] = 'review_required'
    source_kind: Literal['receipt'] = 'receipt'
    currency: Literal['CAD'] = 'CAD'
    retailer: str | None = None
    store_id: str | None = None
    purchase_date: date | None = None
    date_order: Literal['ymd', 'dmy']
    source: ReceiptSource
    items: list[ReceiptItem]
    adjustments: list[ReceiptAdjustment] = Field(default_factory=list)
    totals: ReceiptTotals
    unparsed_lines: list[str]
    warnings: list[str]
