"""Contrats du lot A : routes privées, services et parcours mobile raccordés.

Les vérifications de relations en base, de couverture calculée et de droits
appartiennent aux services. Ces modèles fixent les formes échangées et
rejettent les commandes structurellement ambiguës.
"""
from datetime import date
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from pydantic import AwareDatetime, Field, StrictBool, StringConstraints, model_validator

from backend.app.common.contracts import (
    ApiError, ContractModel, DecimalText, IngredientId, Quantity,
)

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
Revision = Annotated[int, Field(strict=True, ge=1)]
Count = Annotated[int, Field(strict=True, ge=0)]
Fingerprint = Annotated[str, StringConstraints(pattern=r'^[a-f0-9]{64}$')]
InputUnit = Literal['g', 'kg', 'ml', 'L', 'unit', 'cup', 'tbsp', 'tsp']
BaseUnit = Literal['g', 'ml', 'unit']
ListStatus = Literal['draft', 'active', 'completed', 'archived']


class ShoppingQuantity(ContractModel):
    amount: Quantity
    unit: InputUnit


class ShoppingBaseQuantity(ContractModel):
    amount: Quantity
    unit: BaseUnit


def unique_units(values: list[ShoppingBaseQuantity]) -> None:
    if len({q.unit for q in values}) != len(values):
        raise ValueError('Une seule quantité normalisée par unité est autorisée.')


class ShoppingPeriod(ContractModel):
    start_date: date
    end_date: date

    @model_validator(mode='after')
    def ordered(self):
        if self.end_date < self.start_date:
            raise ValueError('La date de fin précède la date de début.')
        return self


class ShoppingCommandHeaders(ContractModel):
    """Valeur extraite de l'en-tête HTTP Idempotency-Key, pas du corps métier."""
    idempotency_key: UUID


class ShoppingListCreate(ContractModel):
    name: Name
    purchase_date: date | None = None  # défaut résolu par le service à Toronto


class ShoppingCommand(ContractModel):
    expected_revision: Revision


class ShoppingListUpdate(ShoppingCommand):
    name: Name | None = None
    purchase_date: date | None = None

    @model_validator(mode='after')
    def actual_change(self):
        fields = self.model_fields_set - {'expected_revision'}
        if not fields or any(getattr(self, f) is None for f in fields):
            raise ValueError('Indiquer un nom ou une date non nuls à modifier.')
        return self


class ShoppingItemAdd(ShoppingCommand):
    ingredient_id: IngredientId | None = None
    name: Name
    quantity: ShoppingQuantity | None = None
    merge: Literal['add', 'separate'] = 'add'


class ShoppingItemUpdate(ShoppingCommand):
    name: Name | None = None
    quantity: ShoppingQuantity | None = None
    removed: StrictBool | None = None

    @model_validator(mode='after')
    def actual_change(self):
        fields = self.model_fields_set - {'expected_revision'}
        if not fields:
            raise ValueError('Indiquer une modification de l’article.')
        if any(getattr(self, f) is None for f in fields - {'quantity'}):
            raise ValueError('Seule la quantité peut être explicitement effacée.')
        return self


class ShoppingCoverage(ContractModel):
    """Couverture explicite, ou confirmation d'un besoin sans quantité."""
    quantities: list[ShoppingBaseQuantity] = Field(default_factory=list, max_length=3)
    confirms_unquantified: StrictBool = False

    @model_validator(mode='after')
    def coherent(self):
        unique_units(self.quantities)
        if self.quantities and self.confirms_unquantified:
            raise ValueError('Choisir une couverture quantifiée ou une confirmation sans quantité.')
        return self


class ShoppingPossessionWrite(ShoppingCommand):
    coverage: ShoppingCoverage


class ShoppingManualPurchaseWrite(ShoppingCommand):
    purchased: StrictBool
    coverage: ShoppingCoverage

    @model_validator(mode='after')
    def explicit_target(self):
        has_coverage = bool(self.coverage.quantities) or self.coverage.confirms_unquantified
        if self.purchased != has_coverage:
            raise ValueError('Un achat coché exige une couverture ; décocher la retire.')
        return self


class ShoppingCalendarPreviewWrite(ShoppingPeriod):
    purchase_date: date | None = None


class ShoppingFromCalendar(ShoppingCalendarPreviewWrite):
    name: Name
    preview_fingerprint: Fingerprint
    accept_partial: StrictBool = False


class ShoppingContributionRead(ContractModel):
    id: UUID
    source: Literal['manual', 'calendar']
    original_quantity: ShoppingQuantity | None
    normalized_quantity: ShoppingBaseQuantity | None
    meal_entry_id: UUID | None = None
    recipe_id: Annotated[str, StringConstraints(pattern=r'^recipe_[a-z0-9_]+$')] | None = None
    recipe_name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)] | None = None
    recipe_version: Revision | None = None
    recipe_servings: Annotated[int, Field(strict=True, ge=1)] | None = None
    meal_date: date | None = None
    servings: Annotated[int, Field(strict=True, ge=1, le=50)] | None = None

    @model_validator(mode='after')
    def origin(self):
        recipe_fields = (self.meal_entry_id, self.recipe_id, self.recipe_name,
                         self.recipe_version, self.recipe_servings, self.meal_date, self.servings)
        if self.source == 'calendar':
            if any(v is None for v in recipe_fields) or self.original_quantity is None or self.normalized_quantity is None:
                raise ValueError('Une contribution calendrier exige sa provenance complète et ses quantités.')
        elif any(v is not None for v in recipe_fields):
            raise ValueError('Une contribution manuelle ne possède pas de provenance calendrier.')
        return self


class ShoppingItemRead(ContractModel):
    id: UUID
    ingredient_id: IngredientId | None
    name: Name
    category: Name
    need_revision: Revision
    required: list[ShoppingBaseQuantity] = Field(max_length=3)
    owned: list[ShoppingBaseQuantity] = Field(default_factory=list, max_length=3)
    owned_unquantified_need_revision: Revision | None = None
    contributions: list[ShoppingContributionRead]
    removed: StrictBool = False
    coverage_status: Literal['remaining', 'partial', 'purchased', 'owned']
    pricing_status: Literal['unpriced', 'known', 'needs_review']

    @model_validator(mode='after')
    def coherent_quantities(self):
        unique_units(self.required)
        unique_units(self.owned)
        if self.owned_unquantified_need_revision is not None:
            if (self.owned_unquantified_need_revision > self.need_revision or
                    (self.owned_unquantified_need_revision == self.need_revision and (self.required or self.owned))):
                raise ValueError('Confirmation de possession sans quantité incohérente.')
        if len({c.id for c in self.contributions}) != len(self.contributions):
            raise ValueError('Identifiants de contributions dupliqués.')
        return self


class ShoppingManualPurchaseRead(ContractModel):
    """Achat déclaratif du lot A, sans prix de caisse ou produit inventé.

    Le lot B étendra les achats avec une variante de produit et son instantané.
    Une confirmation sans quantité est liée à la révision du besoin consulté.
    """
    id: UUID
    item_id: UUID
    kind: Literal['manual'] = 'manual'
    purchased: StrictBool
    coverage: list[ShoppingBaseQuantity] = Field(default_factory=list, max_length=3)
    confirmed_need_revision: Revision | None = None
    product_id: None = None
    estimated_amount: None = None

    @model_validator(mode='after')
    def coherent_coverage(self):
        unique_units(self.coverage)
        if self.coverage and self.confirmed_need_revision is not None:
            raise ValueError('Deux modes de couverture incompatibles.')
        has_coverage = bool(self.coverage) or self.confirmed_need_revision is not None
        if self.purchased != has_coverage:
            raise ValueError('État et couverture de l’achat manuel incohérents.')
        return self


class ShoppingTotals(ContractModel):
    currency: Literal['CAD'] = 'CAD'
    item_count: Count
    remaining_item_count: Count
    purchased_item_count: Count
    owned_item_count: Count
    partial_item_count: Count
    unpriced_item_count: Count
    uncovered_item_count: Count
    budget_known_amount: DecimalText
    remaining_known_amount: DecimalText
    estimate_complete: StrictBool

    @model_validator(mode='after')
    def disjoint_counts(self):
        if self.item_count != self.remaining_item_count + self.purchased_item_count + self.owned_item_count:
            raise ValueError('Les catégories de couverture doivent former une partition des articles.')
        if self.partial_item_count > self.remaining_item_count:
            raise ValueError('Les articles partiels sont inclus dans les articles restants.')
        if max(self.unpriced_item_count, self.uncovered_item_count) > self.item_count:
            raise ValueError('Compteur supérieur au nombre d’articles.')
        if Decimal(self.remaining_known_amount) > Decimal(self.budget_known_amount):
            raise ValueError('Le reste connu dépasse le budget connu.')
        if self.estimate_complete and (self.unpriced_item_count or self.uncovered_item_count):
            raise ValueError('Une estimation incomplète ne peut pas être annoncée complète.')
        return self


class ShoppingWarning(ContractModel):
    code: Annotated[str, StringConstraints(pattern=r'^[A-Z][A-Z0-9_]+$')]
    message: Name
    item_id: UUID | None = None


class ShoppingListRead(ContractModel):
    id: UUID
    name: Name
    source: Literal['manual', 'calendar']
    status: ListStatus
    revision: Revision
    period: ShoppingPeriod | None
    purchase_date: date
    items: list[ShoppingItemRead]
    purchases: list[ShoppingManualPurchaseRead]
    totals: ShoppingTotals
    warnings: list[ShoppingWarning] = Field(default_factory=list)
    created_at: AwareDatetime
    updated_at: AwareDatetime

    @model_validator(mode='after')
    def coherent_resource(self):
        if (self.source == 'calendar') != (self.period is not None):
            raise ValueError('Seule une liste calendrier possède une période source.')
        if self.updated_at < self.created_at:
            raise ValueError('Horodatages de liste inversés.')
        items = {i.id: i for i in self.items}
        if len(items) != len(self.items) or len({p.id for p in self.purchases}) != len(self.purchases):
            raise ValueError('Identifiants d’articles ou d’achats dupliqués.')
        if len({p.item_id for p in self.purchases}) != len(self.purchases):
            raise ValueError('Un seul achat manuel courant est autorisé par article.')
        for purchase in self.purchases:
            item = items.get(purchase.item_id)
            if item is None:
                raise ValueError('Achat rattaché à un article absent de cette liste.')
            if purchase.confirmed_need_revision is not None and (
                    purchase.confirmed_need_revision > item.need_revision or
                    (item.required and purchase.confirmed_need_revision == item.need_revision)):
                raise ValueError('Confirmation d’achat sans quantité incohérente.')
        active = [i for i in self.items if not i.removed]
        expected = {'item_count': len(active),
                    'remaining_item_count': sum(i.coverage_status in ('remaining', 'partial') for i in active),
                    'purchased_item_count': sum(i.coverage_status == 'purchased' for i in active),
                    'owned_item_count': sum(i.coverage_status == 'owned' for i in active),
                    'partial_item_count': sum(i.coverage_status == 'partial' for i in active),
                    'unpriced_item_count': sum(i.coverage_status != 'owned' and i.pricing_status != 'known' for i in active)}
        if any(getattr(self.totals, k) != v for k, v in expected.items()):
            raise ValueError('Compteurs différents des articles de la liste.')
        if any(i.pricing_status == 'known' and i.coverage_status != 'owned' for i in active) or (
                Decimal(self.totals.budget_known_amount) != 0 or Decimal(self.totals.remaining_known_amount) != 0):
            raise ValueError('Le lot A ne dispose pas encore d’achats chiffrés.')
        return self


class ShoppingRevisionRead(ContractModel):
    list_id: UUID
    revision: Revision
    command_id: UUID
    recorded_at: AwareDatetime
    snapshot: ShoppingListRead

    @model_validator(mode='after')
    def same_revision(self):
        if self.list_id != self.snapshot.id or self.revision != self.snapshot.revision:
            raise ValueError('Instantané d’une autre liste ou révision.')
        return self


class ShoppingExcludedMeal(ContractModel):
    meal_entry_id: UUID
    reason: Literal['recipe_unavailable']


class ShoppingCalendarPreviewRead(ContractModel):
    period: ShoppingPeriod
    purchase_date: date
    preview_fingerprint: Fingerprint
    included_meal_count: Count
    skipped_note_count: Count
    skipped_leftover_count: Count
    excluded_meals: list[ShoppingExcludedMeal]
    excluded_ingredient_ids: list[IngredientId]
    items: list[ShoppingItemRead]
    warnings: list[ShoppingWarning] = Field(default_factory=list)


class ShoppingConflict(ApiError):
    code: Literal['LIST_REVISION_CONFLICT', 'IDEMPOTENCY_KEY_REUSED',
                  'CALENDAR_PREVIEW_STALE', 'ACCOUNT_DELETION_PENDING', 'LIST_STATE_CONFLICT']
    list_id: UUID | None = None
    expected_revision: Revision | None = None
    current_revision: Revision | None = None

    @model_validator(mode='after')
    def conflict_context(self):
        if self.code == 'LIST_REVISION_CONFLICT':
            if self.list_id is None or self.expected_revision is None or self.current_revision is None:
                raise ValueError('Un conflit de révision exige sa liste et les deux révisions.')
        return self


class ShoppingConflictResponse(ContractModel):
    error: ShoppingConflict
