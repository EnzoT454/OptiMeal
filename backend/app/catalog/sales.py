"""Formats et tarifs vérifiables pour les achats, sans calcul de couverture.

Une preuve est liée à l'instantané exact du produit et de sa correspondance.
Aucun nom, prix unitaire publicitaire ou correspondance proposée ne suffit à
promouvoir une référence en achat fiable. Pas de collecte ni d'écriture ici.
"""
from collections import Counter
from datetime import date
from decimal import Decimal
from fractions import Fraction
from hashlib import sha256
import json
from typing import Annotated, Literal

from pydantic import AwareDatetime, Field, StringConstraints, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.common.contracts import ContractModel, DecimalText, IngredientId, Quantity
from backend.app.common.public_data import promotion, source_product_from_database
from backend.app.common.units import decimal_quantity
from .common_schemas import CommonCatalog, InputFingerprint, SourceProduct
from .formats import parse_format
from .models import ProductOffer
from .schemas import ProductFormat

Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
Fingerprint = Annotated[str, StringConstraints(pattern=r'^[a-f0-9]{64}$')]
BaseUnit = Literal['g', 'ml', 'unit']
Basis = Literal['package', 'weight', 'count', 'unknown']

# Unités de vente uniquement : « oz » sans distinction masse/volume reste inconnu.
SALE_FACTORS = {
    'g': ('g', '1'), 'kg': ('g', '1000'), 'lb': ('g', '453.59237'),
    'ml': ('ml', '1'), 'l': ('ml', '1000'),
    'unit': ('unit', '1'), 'un': ('unit', '1'), 'unité': ('unit', '1'),
    'unités': ('unit', '1'), 'units': ('unit', '1'), 'ea': ('unit', '1'),
}


class SaleQuantity(ContractModel):
    amount: Quantity
    unit: Text


class SaleBaseQuantity(ContractModel):
    amount: Quantity
    unit: BaseUnit


class SaleReview(ContractModel):
    """Attestation explicite ; ne constitue jamais une vérification automatique."""
    product_id: Text
    ingredient_id: IngredientId
    source_fingerprint: Fingerprint
    checked_at: AwareDatetime
    method: Literal['source_document', 'manual_review']
    reference: Text
    # Valeurs effectivement vérifiées, pas des valeurs inférées du nom.
    format_raw: str | None = None
    price_basis_raw: str | None = None
    price_basis: Basis = 'unknown'
    price_per_quantity: SaleQuantity | None = None
    sale_increment: SaleQuantity | None = None
    minimum_sale: SaleQuantity | None = None
    match_status: Literal['verified', 'proposed', 'rejected'] = 'proposed'
    scope: Literal['store', 'retailer', 'unknown'] = 'unknown'
    conditions: Literal['unconditional', 'member', 'coupon', 'multi_buy', 'unknown'] = 'unknown'
    zero_price_verified: bool = Field(default=False, strict=True)


class SaleReviewDocument(ContractModel):
    schema_version: Literal['sale-reviews-1.0'] = 'sale-reviews-1.0'
    reviews: list[SaleReview]

    @model_validator(mode='after')
    def unique_identity(self):
        keys = [(r.ingredient_id, r.product_id) for r in self.reviews]
        if len(keys) != len(set(keys)):
            raise ValueError('Plusieurs attestations pour le même produit et ingrédient.')
        return self


class NormalizedSale(ContractModel):
    """Instantané autonome ; un format lisible ne garantit ni tarif ni équivalence."""
    product_id: Text
    ingredient_id: IngredientId
    source_fingerprint: Fingerprint
    raw_source: SourceProduct
    review: SaleReview | None
    review_status: Literal['missing', 'matched', 'stale', 'identity_mismatch']
    format: ProductFormat
    format_status: Literal['candidate', 'verified', 'unknown']
    # Contenu net d'une unité de vente, uniquement pour un conditionnement fixe.
    content_per_package: SaleBaseQuantity | None
    dimension: Literal['mass', 'volume', 'count'] | None
    price_basis: Basis
    # None pour package : tarif d'un paquet, jamais d'un gramme ou d'une pièce.
    price_per_quantity: SaleBaseQuantity | None
    sale_increment: SaleBaseQuantity | None
    minimum_sale: SaleBaseQuantity | None
    applicable_price: DecimalText | None
    applicable_price_kind: Literal['regular', 'promotion', 'unknown']
    quantity_limit: int | None = Field(ge=1)
    price_after_limit: DecimalText | None
    evaluated_on: date
    match_status: Literal['verified', 'proposed', 'rejected']
    scope: Literal['store', 'retailer', 'unknown']
    conditions: Literal['unconditional', 'member', 'coupon', 'multi_buy', 'unknown']
    issues: list[str]
    eligible_for_calculation: bool

    @model_validator(mode='after')
    def coherent(self):
        if self.eligible_for_calculation != (not self.issues):
            raise ValueError('Admissibilité incompatible avec les motifs de blocage.')
        if self.product_id != self.raw_source.id:
            raise ValueError('Identité incompatible avec la source.')
        if self.eligible_for_calculation and (self.review_status != 'matched'
                or self.match_status != 'verified' or self.applicable_price is None
                or self.price_basis == 'unknown'):
            raise ValueError('Achat admissible sans preuve complète.')
        return self


class SaleNormalizationReport(ContractModel):
    schema_version: Literal['sale-normalization-1.0'] = 'sale-normalization-1.0'
    source_kind: Literal['common_catalog', 'postgresql']
    source_inputs: list[InputFingerprint]
    evaluated_on: date
    product_count: int = Field(ge=0)
    eligible_count: int = Field(ge=0)
    issue_counts: dict[str, int]
    items: list[NormalizedSale]

    @model_validator(mode='after')
    def coherent_counts(self):
        keys = [(item.ingredient_id, item.product_id) for item in self.items]
        if (len(keys) != len(set(keys)) or self.product_count != len(self.items)
                or self.eligible_count != sum(item.eligible_for_calculation for item in self.items)
                or self.issue_counts != dict(Counter(code for item in self.items for code in item.issues))
                or any(item.evaluated_on != self.evaluated_on for item in self.items)):
            raise ValueError('Comptages, identités ou dates incompatibles avec les références du rapport.')
        return self


def source_fingerprint(ingredient_id: str, product: SourceProduct) -> str:
    # Les photos ne changent pas le contenu commercial. Le prix, la date,
    # le magasin, la variante et la correspondance font partie de l'attestation.
    payload = {'ingredient_id': ingredient_id,
               'product': product.model_dump(mode='json', exclude={'image_url', 'image_source'})}
    return sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False,
        separators=(',', ':')).encode()).hexdigest()


def _normalized(quantity: SaleQuantity | None) -> SaleBaseQuantity | None:
    if quantity is None:
        return None
    factor = SALE_FACTORS.get(quantity.unit.casefold())
    if factor is None:
        return None
    unit, multiplier = factor
    # Multiplication exacte indépendante de la précision Decimal globale.
    amount, _ = decimal_quantity(Fraction(Decimal(quantity.amount)) * Fraction(Decimal(multiplier)))
    return SaleBaseQuantity(amount=format(amount, 'f'), unit=unit)


def _raw_format(product: SourceProduct) -> str | None:
    if product.quantity is not None and product.unit is not None:
        return f'{product.quantity} {product.unit}'
    return product.unit


def _applicable_price(product: SourceProduct, on_date: date):
    if promotion(product, on_date).status == 'active' and product.promo_price is not None:
        return product.promo_price, 'promotion', product.quantity_limit, product.price_after_limit
    if product.price is not None:
        return product.price, 'regular', None, None
    return None, 'unknown', None, None


def normalize_sale(ingredient_id: str, product: SourceProduct, on_date: date,
                   review: SaleReview | None = None) -> NormalizedSale:
    fingerprint = source_fingerprint(ingredient_id, product)
    status = ('missing' if review is None else 'identity_mismatch'
              if (review.product_id, review.ingredient_id) != (product.id, ingredient_id)
              else 'matched' if review.source_fingerprint == fingerprint else 'stale')
    trusted = review if status == 'matched' else None
    issues = []
    if status != 'matched':
        issues.append({'missing': 'REVIEW_MISSING', 'identity_mismatch': 'REVIEW_IDENTITY_MISMATCH',
                       'stale': 'REVIEW_STALE'}[status])
    raw = trusted.format_raw if trusted and trusted.format_raw is not None else _raw_format(product)
    parsed = parse_format(raw)
    format_status = ('verified' if trusted and trusted.format_raw is not None
                     and parsed.kind != 'unknown' else 'candidate' if parsed.kind != 'unknown' else 'unknown')
    if format_status != 'verified':
        issues.append('FORMAT_UNKNOWN' if format_status == 'unknown' else 'FORMAT_UNVERIFIED')
    basis = trusted.price_basis if trusted else 'unknown'
    match = trusted.match_status if trusted else 'proposed'
    scope = trusted.scope if trusted else 'unknown'
    conditions = trusted.conditions if trusted else 'unknown'
    price, price_kind, limit, after_limit = _applicable_price(product, on_date)
    denominator = _normalized(trusted.price_per_quantity) if trusted else None
    increment = _normalized(trusted.sale_increment) if trusted else None
    minimum = _normalized(trusted.minimum_sale) if trusted else None
    content = None

    if basis == 'unknown':
        issues.append('PRICE_BASIS_UNKNOWN')
    if not trusted or not (trusted.price_basis_raw or '').strip():
        issues.append('PRICE_BASIS_EVIDENCE_MISSING')
    if match != 'verified':
        issues.append('MATCH_REJECTED' if match == 'rejected' else 'MATCH_UNVERIFIED')
    if scope == 'unknown' or (scope == 'store' and not product.store_id):
        issues.append('SCOPE_UNVERIFIED')
    if conditions != 'unconditional':
        issues.append('CONDITIONS_UNKNOWN' if conditions == 'unknown' else 'CONDITIONS_UNSUPPORTED')
    if price is None:
        issues.append('PRICE_UNKNOWN')
    if price == '0' or (price is not None and Decimal(price) == 0):
        if not trusted or not trusted.zero_price_verified:
            issues.append('ZERO_PRICE_UNVERIFIED')
    if after_limit is not None and Decimal(after_limit) == 0 and (not trusted or not trusted.zero_price_verified):
        issues.append('ZERO_PRICE_UNVERIFIED')

    if basis == 'package':
        if format_status == 'verified' and parsed.kind == 'fixed':
            content = SaleBaseQuantity(amount=format(parsed.quantity, 'f'), unit=parsed.unit)
        else:
            issues.append('PACKAGE_CONTENT_UNKNOWN')
        if trusted.price_per_quantity is not None:
            issues.append('PACKAGE_PRICE_DENOMINATOR_CONFLICT')
        # Le paquet est l'unité de vente discrète, distincte de son contenu net.
        increment = increment or SaleBaseQuantity(amount='1', unit='unit')
        minimum = minimum or SaleBaseQuantity(amount='1', unit='unit')
        denominator = None
        if any(q.unit != 'unit' or Decimal(q.amount) != 1 for q in (increment, minimum)):
            issues.append('PACKAGE_SALE_CONSTRAINT_UNSUPPORTED')
    elif basis in ('weight', 'count'):
        expected_unit = 'g' if basis == 'weight' else 'unit'
        if denominator is None or denominator.unit != expected_unit:
            issues.append('PRICE_DENOMINATOR_UNKNOWN_OR_INCOMPATIBLE')
        if increment is None or increment.unit != expected_unit:
            issues.append('SALE_INCREMENT_UNKNOWN_OR_INCOMPATIBLE')
        if minimum is None or minimum.unit != expected_unit:
            issues.append('MINIMUM_SALE_UNKNOWN_OR_INCOMPATIBLE')
        if basis == 'count' and any(q is not None and Decimal(q.amount) != Decimal(q.amount).to_integral_value()
                                  for q in (denominator, increment, minimum)):
            issues.append('FRACTIONAL_COUNT_SALE_UNSUPPORTED')
        if increment and minimum and increment.unit == minimum.unit:
            if Fraction(Decimal(minimum.amount)) % Fraction(Decimal(increment.amount)):
                issues.append('MINIMUM_NOT_MULTIPLE_OF_INCREMENT')
        if basis == 'weight' and format_status == 'verified' and parsed.kind == 'fixed':
            # Un conditionnement fixe payé au poids exige un modèle de vente
            # distinct ; ne pas le traiter comme du vrac librement divisible.
            issues.append('FIXED_PACKAGE_WITH_MEASURED_PRICE')
        if basis == 'weight' and (format_status != 'verified' or parsed.kind != 'variable_weight'):
            issues.append('MEASURED_SALE_MODE_UNVERIFIED')
        if basis == 'count' and (format_status != 'verified' or parsed.kind != 'fixed' or parsed.unit != 'unit'):
            issues.append('COUNT_SALE_MODE_UNVERIFIED')
        if (basis == 'count' and parsed.kind == 'fixed' and parsed.unit == 'unit'
                and increment and increment.unit == 'unit'
                and parsed.quantity != Decimal(increment.amount)):
            issues.append('COUNT_FORMAT_INCREMENT_CONFLICT')
        if limit is not None:
            # quantity_limit du catalogue porte sur des unités de vente entières.
            # Sa portée en grammes/pièces mesurées n'est pas attestée ici.
            issues.append('MEASURED_SALE_PROMOTION_LIMIT_UNSUPPORTED')

    if trusted:
        for value, normalized, code in ((trusted.sale_increment, increment, 'SALE_INCREMENT_UNIT_UNKNOWN'),
                                       (trusted.minimum_sale, minimum, 'MINIMUM_SALE_UNIT_UNKNOWN')):
            if value is not None and _normalized(value) is None:
                issues.append(code)
    dimension_unit = content.unit if content else denominator.unit if denominator else None
    dimension = {'g': 'mass', 'ml': 'volume', 'unit': 'count'}.get(dimension_unit)
    issues = sorted(set(issues))
    return NormalizedSale(product_id=product.id, ingredient_id=ingredient_id,
        source_fingerprint=fingerprint, raw_source=product, review=review, review_status=status,
        format=parsed, format_status=format_status, content_per_package=content, dimension=dimension,
        price_basis=basis, price_per_quantity=denominator, sale_increment=increment, minimum_sale=minimum,
        applicable_price=price, applicable_price_kind=price_kind, quantity_limit=limit,
        price_after_limit=after_limit, evaluated_on=on_date, match_status=match,
        scope=scope, conditions=conditions, issues=issues, eligible_for_calculation=not issues)


def _report(products, on_date, reviews, source_kind, source_inputs):
    index = {(r.ingredient_id, r.product_id): r for r in reviews}
    if len(index) != len(reviews):
        raise ValueError('Attestations dupliquées.')
    known = {(ingredient_id, product.id) for ingredient_id, product in products}
    if set(index) - known:
        raise ValueError('Une attestation référence un produit ou ingrédient absent de cette source.')
    items = [normalize_sale(ingredient_id, product, on_date, index.get((ingredient_id, product.id)))
             for ingredient_id, product in sorted(products, key=lambda entry: (entry[0], entry[1].id))]
    return SaleNormalizationReport(source_kind=source_kind, source_inputs=source_inputs,
        evaluated_on=on_date, product_count=len(items),
        eligible_count=sum(item.eligible_for_calculation for item in items),
        issue_counts=dict(sorted(Counter(code for item in items for code in item.issues).items())), items=items)


def normalize_catalog(catalog: CommonCatalog, on_date: date,
                      reviews: list[SaleReview] | None = None) -> SaleNormalizationReport:
    return _report([(ingredient.id, product) for ingredient in catalog.ingredients
                    for product in ingredient.products], on_date, reviews or [], 'common_catalog', catalog.inputs)


def normalize_database(db: Session, on_date: date,
                       reviews: list[SaleReview] | None = None) -> SaleNormalizationReport:
    """Une lecture groupée ; la transaction de l'appelant reste sous son contrôle."""
    products = [(row.ingredient_id, source_product_from_database(row)) for row in db.scalars(
        select(ProductOffer).order_by(ProductOffer.ingredient_id, ProductOffer.id))]
    return _report(products, on_date, reviews or [], 'postgresql', [])
