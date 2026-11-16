"""Comparaisons privées sans mutation des achats, puis application explicite."""
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from fractions import Fraction
from hashlib import sha256
import json
from pathlib import Path
from uuid import UUID, uuid4
from typing import Callable

from fastapi import Request
from sqlalchemy.orm import Session
from backend.app.security import CurrentUser

from sqlalchemy import delete, insert, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from backend.app.catalog.sales import NormalizedSale, SaleReviewDocument, normalize_catalog, normalize_database
from backend.app.common.public_data import ROOT
from . import service
from .errors import ShoppingListError
from .models import ShoppingListAssignment, ShoppingListChoice, ShoppingListComparison
from .purchases import SearchLimits, calculate_coverage
from .schemas import (
    ShoppingAppliedComparison, ShoppingCalculatedLine, ShoppingCandidate,
    ShoppingComparedNeed, ShoppingComparisonRead, ShoppingListRead,
    ShoppingProductChoice, ShoppingQuantity, ShoppingScenario, ShoppingStoreTotal,
    ShoppingApplyComparison, ShoppingChoiceWrite,
)

SCENARIOS = ('maxi', 'metro', 'superc', 'cheapest')
MAX_GROUPS = 60
MAX_REFERENCES = 1000
SalesSource = Callable[[Session, date], list[NormalizedSale]]


def _hash(value):
    return sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()


def state_fingerprint(resource: ShoppingListRead) -> str:
    return _hash({'date': resource.purchase_date.isoformat(),
        'items': [i.model_dump(mode='json', exclude={'pricing_status'}) for i in resource.items],
        'purchases': [p.model_dump(mode='json') for p in resource.purchases],
        'choices': [c.model_dump(mode='json') for c in resource.choices]})


def catalog_fingerprint(sales: list[NormalizedSale]) -> str:
    return _hash([s.model_dump(mode='json') for s in sorted(sales, key=lambda s: (s.ingredient_id, s.product_id))])


def load_sales(request: Request, db: Session, on_date: date) -> list[NormalizedSale]:
    """Même source que Promos ; preuves opérateur facultatives, jamais du mobile."""
    try:
        path = request.app.state.sale_reviews_path
        reviews = SaleReviewDocument.model_validate_json((ROOT / Path(path)).read_text(encoding='utf-8')).reviews if path else []
        if request.app.state.offers_source == 'database':
            return normalize_database(db, on_date, reviews).items
        catalog = request.app.state.public_catalog
        if catalog is None:
            raise ValueError('Catalogue absent.')
        return normalize_catalog(catalog.source, on_date, reviews).items
    except (OSError, ValueError):
        raise ShoppingListError(503, 'CATALOG_UNAVAILABLE', 'Catalogue ou attestations indisponibles.') from None


def _amount(value):
    # Toutes les lignes sont déjà arrondies au centime. Somme entière exacte.
    cents = value * 100
    assert cents.denominator == 1
    n = cents.numerator
    return f'{n // 100}.{n % 100:02d}'


def _scenario(name, needs):
    totals = defaultdict(Fraction)
    for need in needs:
        for line in need.lines:
            source = line.sale.raw_source
            totals[(source.retailer, source.store_id)] += Fraction(Decimal(line.amount))
    stores = [ShoppingStoreTotal(retailer=key[0], store_id=key[1], amount=_amount(amount))
              for key, amount in sorted(totals.items(), key=lambda e: (e[0][0], e[0][1] or ''))]
    known = sum((Fraction(Decimal(n.amount)) for n in needs if n.amount is not None), Fraction())
    return ShoppingScenario(scenario=name, needs=needs, known_amount=_amount(known),
        complete=all(n.status in ('complete', 'owned') and 'PURCHASED_PRICE_UNKNOWN' not in n.warnings for n in needs),
        store_totals=stores, store_count=len(stores))


def build_scenarios(resource: ShoppingListRead, sales: list[NormalizedSale]) -> list[ShoppingScenario]:
    """Regroupement de liste entière avant les paliers, jamais par contribution."""
    if len(sales) > MAX_REFERENCES:
        raise ShoppingListError(422, 'COMPARISON_TOO_LARGE', 'Trop de références pour comparer cette liste.')
    groups = defaultdict(list)
    for item in resource.items:
        if not item.removed:
            groups[item.ingredient_id or str(item.id)].append(item)
    if len(groups) > MAX_GROUPS:
        raise ShoppingListError(422, 'COMPARISON_TOO_LARGE', 'Compare au maximum 60 besoins à la fois.')
    product_ingredients = defaultdict(set)
    for sale in sales:
        if sale.ingredient_id in groups:
            product_ingredients[sale.product_id].add(sale.ingredient_id)
    if any(len(ingredients) > 1 for ingredients in product_ingredients.values()):
        raise ShoppingListError(422, 'PRODUCT_MAPPING_AMBIGUOUS',
                                'Un produit correspond à plusieurs besoins. Vérifie le catalogue.')
    choices = {c.item_id: c.product_id for c in resource.choices}
    purchases = {p.item_id: p for p in resource.purchases if p.purchased}
    result = {name: [] for name in SCENARIOS}
    remaining_budget = 100_000
    for _, items in sorted(groups.items()):
        ingredient = items[0].ingredient_id
        base = dict(item_ids=[i.id for i in items], name=items[0].name, ingredient_id=ingredient,
                    unit=None, remaining=None)
        selected = {choices[i.id] for i in items if i.id in choices}
        warnings = []
        status = None
        if all(i.coverage_status == 'owned' for i in items):
            status = 'owned'
        elif all(i.coverage_status in ('owned', 'purchased') for i in items):
            status = 'purchased'
        elif ingredient is None or any(not i.required and i.coverage_status != 'owned' for i in items):
            status = 'unquantified'
        elif len(selected) > 1:
            status = 'manual_unavailable'
            warnings.append('CHOICES_CONFLICT')
        if status:
            for name in SCENARIOS:
                result[name].append(ShoppingComparedNeed(**base, status=status, manual=bool(selected),
                    amount='0.00' if status == 'owned' else None, warnings=warnings))
            continue
        candidates = [s for s in sales if s.ingredient_id == ingredient]
        if selected:
            candidates = [s for s in candidates if s.product_id in selected]
        quantities = [ShoppingQuantity(**q.model_dump()) for i in items for q in i.required]
        owned = [ShoppingQuantity(**q.model_dump()) for i in items for q in i.owned]
        bought = [ShoppingQuantity(**q.model_dump()) for i in items
                  for q in (purchases[i.id].coverage if i.id in purchases else [])]
        if remaining_budget < 1:
            for name in SCENARIOS:
                result[name].append(ShoppingComparedNeed(**base, status='search_limit', manual=bool(selected)))
            continue
        store_count = len({(s.raw_source.retailer, s.raw_source.store_id) for s in candidates})
        if store_count > remaining_budget:
            for name in SCENARIOS:
                result[name].append(ShoppingComparedNeed(**base, status='search_limit', manual=bool(selected)))
            continue
        limits = SearchLimits(max_combinations=min(10_000, remaining_budget // max(1, store_count)))
        has_purchases = any(i.id in purchases for i in items)
        if has_purchases and not bought:
            if any(s.quantity_limit is not None for s in candidates):
                warnings.append('PROMOTION_USAGE_UNKNOWN')
            candidates = [s for s in candidates if s.quantity_limit is None]
        coverage = calculate_coverage(ingredient, quantities, candidates, resource.purchase_date,
                                      owned=owned, purchased=bought, limits=limits)
        remaining_budget -= sum(s.combinations for s in coverage.stores if s.status == 'complete')
        base.update(unit=coverage.unit, remaining=coverage.remaining)
        warnings.extend(sorted({issue for _, issues in coverage.excluded for issue in issues}))
        if has_purchases:
            warnings.append('PURCHASED_PRICE_UNKNOWN')
        for name in SCENARIOS:
            stores = [s for s in coverage.stores if selected or name == 'cheapest' or s.retailer == name]
            available = [s for s in stores if s.status == 'complete']
            limited = any(s.status == 'search_limit' for s in stores)
            chosen = min(available, key=lambda s: (Decimal(s.amount), Decimal(s.surplus), len(s.lines),
                tuple((line.sale.product_id, line.sale_units) for line in s.lines))) if available and not limited else None
            notes = list(warnings)
            if chosen and selected and name != 'cheapest' and chosen.retailer != name:
                notes.append('MANUAL_CHOICE_OUTSIDE_SCENARIO')
            if coverage.status == 'incompatible_units':
                status = 'incompatible_units'
            elif coverage.status == 'already_covered':
                status = 'purchased' if bought else 'owned'
            elif limited:
                status = 'search_limit'
            elif chosen:
                status = 'complete'
            else:
                status = 'manual_unavailable' if selected else 'unpriced'
            lines = [ShoppingCalculatedLine(sale=line.sale, sale_units=line.sale_units,
                     quantity=line.quantity, amount=line.amount, estimated_weight=line.estimated_weight)
                     for line in chosen.lines] if chosen else []
            result[name].append(ShoppingComparedNeed(**base, status=status, manual=bool(selected),
                lines=lines, amount=chosen.amount if chosen else '0.00' if status == 'owned' else None,
                warnings=notes))
    return [_scenario(name, needs) for name, needs in result.items()]


def compare(db: Session, list_id: UUID, user: CurrentUser, source: SalesSource) -> ShoppingComparisonRead:
    """Le verrou de liste fige les besoins pendant la lecture du catalogue."""
    try:
        current = service._owned_list(db, list_id, user, lock=True)
        if current['status'] not in ('draft', 'active'):
            raise ShoppingListError(409, 'LIST_STATE_CONFLICT', 'Rouvre la liste avant de comparer.')
        resource = service.get_list(db, list_id, user)
        sales = source(db, resource.purchase_date)
        result = ShoppingComparisonRead(id=uuid4(), list_id=list_id, source_revision=resource.revision,
            purchase_date=resource.purchase_date, catalog_fingerprint=catalog_fingerprint(sales),
            state_fingerprint=state_fingerprint(resource), expires_at=datetime.now(timezone.utc) + timedelta(minutes=15),
            scenarios=build_scenarios(resource, sales), candidates=[ShoppingCandidate(
                ingredient_id=s.ingredient_id, product_id=s.product_id, name=s.raw_source.name,
                retailer=s.raw_source.retailer, store_id=s.raw_source.store_id,
                eligible=s.eligible_for_calculation, issues=s.issues) for s in sales])
        db.execute(insert(ShoppingListComparison).values(id=result.id, list_id=list_id, data=result.model_dump(mode='json')))
        db.commit()
        return result
    except Exception:
        db.rollback()
        raise


def apply(db: Session, list_id: UUID, user: CurrentUser, body: ShoppingApplyComparison,
          key: UUID, source: SalesSource) -> ShoppingListRead:
    def action(target):
        value = db.scalar(select(ShoppingListComparison.data).where(
            ShoppingListComparison.id == body.comparison_id, ShoppingListComparison.list_id == target))
        if value is None:
            service._not_found()
        comparison = ShoppingComparisonRead.model_validate(value)
        resource = service.get_list(db, target, user)
        if (comparison.expires_at <= datetime.now(timezone.utc) or
                comparison.source_revision != resource.revision or
                comparison.state_fingerprint != state_fingerprint(resource) or
                comparison.catalog_fingerprint != catalog_fingerprint(source(db, resource.purchase_date))):
            raise ShoppingListError(409, 'COMPARISON_STALE', 'La proposition a changé ou expiré. Compare de nouveau.')
        scenario = next(s for s in comparison.scenarios if s.scenario == body.scenario)
        if not scenario.complete and not body.accept_partial:
            raise ShoppingListError(409, 'COMPARISON_PARTIAL', 'Confirme les besoins sans estimation avant d’appliquer.')
        assignment = ShoppingAppliedComparison(comparison_id=comparison.id, source_revision=resource.revision,
            purchase_date=resource.purchase_date, state_fingerprint=comparison.state_fingerprint, scenario=scenario)
        data = assignment.model_dump(mode='json')
        db.execute(pg_insert(ShoppingListAssignment).values(list_id=target, comparison_id=comparison.id, data=data)
            .on_conflict_do_update(index_elements=['list_id'], set_={'comparison_id': comparison.id, 'data': data}))
        return target
    return service._mutate(db, user, key, 'apply_comparison', body, list_id, action)


def choose(db: Session, list_id: UUID, item_id: UUID, user: CurrentUser, body: ShoppingChoiceWrite,
           key: UUID, source: SalesSource) -> ShoppingListRead:
    def action(target):
        item = service._item(db, target, item_id)
        if body.product_id is None:
            db.execute(delete(ShoppingListChoice).where(ShoppingListChoice.item_id == item_id))
        else:
            resource = service.get_list(db, target, user)
            sales = source(db, resource.purchase_date)
            if not any(s.product_id == body.product_id and s.ingredient_id == item['ingredient_id'] for s in sales):
                raise ShoppingListError(422, 'PRODUCT_NOT_MATCHED', 'Produit absent ou sans correspondance à cet ingrédient.')
            db.execute(pg_insert(ShoppingListChoice).values(list_id=target, item_id=item_id, product_id=body.product_id)
                .on_conflict_do_update(index_elements=['item_id'], set_={'product_id': body.product_id}))
        return target
    return service._mutate(db, user, key, 'choice:' + str(item_id), body, list_id, action)


def decorate(db: Session, resource: ShoppingListRead) -> ShoppingListRead:
    """Relire des instantanés enregistrés, sans consulter les prix courants."""
    choices = [ShoppingProductChoice(item_id=row.item_id, product_id=row.product_id) for row in db.execute(
        select(ShoppingListChoice).where(ShoppingListChoice.list_id == resource.id).order_by(ShoppingListChoice.item_id)).scalars()]
    resource = resource.model_copy(update={'choices': choices})
    data = db.scalar(select(ShoppingListAssignment.data).where(ShoppingListAssignment.list_id == resource.id))
    if data is None:
        return resource
    assignment = ShoppingAppliedComparison.model_validate(data)
    stale = assignment.state_fingerprint != state_fingerprint(resource)
    assignment = assignment.model_copy(update={'stale': stale})
    if stale:
        return ShoppingListRead.model_validate({**resource.model_dump(), 'assignment': assignment,
            'warnings': [*resource.warnings, {'code': 'COMPARISON_STALE', 'message': 'Besoins ou choix modifiés : compare de nouveau.'}]})
    priced = {item_id for need in assignment.scenario.needs if need.status == 'complete'
              and 'PURCHASED_PRICE_UNKNOWN' not in need.warnings for item_id in need.item_ids}
    items = [i.model_copy(update={'pricing_status': 'known'}) if i.id in priced else i for i in resource.items]
    active = [i for i in items if not i.removed]
    unpriced = sum(i.coverage_status != 'owned' and i.pricing_status != 'known' for i in active)
    covered = {item_id for need in assignment.scenario.needs if need.status in ('complete', 'owned', 'purchased') for item_id in need.item_ids}
    uncovered = sum(i.id not in covered for i in active)
    total = assignment.scenario.known_amount
    totals = resource.totals.model_copy(update={'unpriced_item_count': unpriced, 'uncovered_item_count': uncovered,
        'budget_known_amount': total, 'remaining_known_amount': total,
        'estimate_complete': not (unpriced or uncovered)})
    warnings = [w for w in resource.warnings if w.code != 'ESTIMATE_UNAVAILABLE']
    if unpriced:
        warnings.append({'code': 'ESTIMATE_PARTIAL', 'message': 'Sous-total connu : certains achats ne sont pas chiffrés.'})
    return ShoppingListRead.model_validate({**resource.model_dump(), 'items': items, 'assignment': assignment,
                                           'totals': totals, 'warnings': warnings})
