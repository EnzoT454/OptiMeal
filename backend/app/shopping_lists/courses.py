"""Achats effectifs : instantanés serveur, couverture exacte et coches stables."""
from collections import defaultdict
from dataclasses import dataclass
from decimal import Decimal
from fractions import Fraction
from uuid import UUID, uuid5

from sqlalchemy import select
from sqlalchemy.orm import Session
from backend.app.security import CurrentUser
from sqlalchemy.dialects.postgresql import insert

from . import service
from .errors import ShoppingListError
from .models import ShoppingListProductPurchase
from .purchases import _line_cost, _money, _quantity
from .schemas import (
    ShoppingProductPurchaseRead, ShoppingBaseQuantity, ShoppingCompleteWrite,
    ShoppingProductPurchaseWrite, ShoppingListRead, ShoppingAppliedComparison, ShoppingScenario,
    ShoppingManualPurchaseRead,
)


def planning_fingerprint(resource: ShoppingListRead, comparison_id: UUID | None = None,
                         scenario: ShoppingScenario | None = None) -> str:
    from .comparisons import _hash
    priced_ids = {item_id for need in scenario.needs if need.lines for item_id in need.item_ids} if scenario else set()
    return _hash({'date': resource.purchase_date.isoformat(),
        'items': [i.model_dump(mode='json', exclude={'pricing_status', 'coverage_status'}) for i in resource.items],
        'purchases': [p.model_dump(mode='json') for p in resource.purchases if p.item_id in priced_ids],
        'choices': [c.model_dump(mode='json') for c in resource.choices],
        'previous_products': [p.model_dump(mode='json') for p in resource.product_purchases
                              if p.comparison_id != comparison_id and p.purchased_units]})


def read_purchases(db: Session, list_id: UUID) -> list[ShoppingProductPurchaseRead]:
    return [ShoppingProductPurchaseRead.model_validate(data) for data in db.scalars(
        select(ShoppingListProductPurchase.data).where(ShoppingListProductPurchase.list_id == list_id)
        .order_by(ShoppingListProductPurchase.id))]


@dataclass(frozen=True)
class PurchaseCoverage:
    # Vue interne : une ancienne couverture mesurée peut coexister avec une
    # confirmation récente d'un besoin désormais non quantifié.
    purchased: bool
    coverage: list[ShoppingBaseQuantity]
    confirmed_need_revision: int | None


def purchase_coverage(manual: list[ShoppingManualPurchaseRead], products: list[ShoppingProductPurchaseRead]
                      ) -> dict[UUID, ShoppingManualPurchaseRead | PurchaseCoverage]:
    """Vue interne pour le calcul commun ; les achats exposés restent distincts."""
    amounts = defaultdict(lambda: defaultdict(Fraction))
    originals = {p.item_id: p for p in manual}
    for p in manual:
        if p.purchased:
            for q in p.coverage:
                amounts[p.item_id][q.unit] += Fraction(Decimal(q.amount))
    for purchase in products:
        for allocation in purchase.allocations:
            q = allocation.quantity
            amounts[allocation.item_id][q.unit] += Fraction(Decimal(q.amount))
    result = dict(originals)
    for item_id, quantities in amounts.items():
        original = originals.get(item_id)
        result[item_id] = PurchaseCoverage(purchased=True,
            confirmed_need_revision=original.confirmed_need_revision if original and original.purchased else None,
            coverage=[ShoppingBaseQuantity(unit=u, amount=_quantity(a)) for u, a in sorted(quantities.items()) if a])
    return result


def set_product_purchase(db: Session, list_id: UUID, user: CurrentUser,
                         body: ShoppingProductPurchaseWrite, key: UUID) -> ShoppingListRead:
    def action(target):
        resource = service.get_list(db, target, user)
        # Une ancienne ligne déjà achetée reste décochable après recomparaison.
        existing = next((p for p in resource.product_purchases
            if p.comparison_id == body.comparison_id and body.item_id in p.item_ids
            and p.line.sale.product_id == body.product_id), None)
        assignment = resource.assignment
        if existing:
            line, ids = existing.line, existing.item_ids
            reserved = existing.reserved_units
        else:
            if assignment is None or assignment.comparison_id != body.comparison_id or assignment.stale:
                raise ShoppingListError(409, 'COMPARISON_STALE', 'Compare et applique une proposition avant cet achat.')
            need = next((n for n in assignment.scenario.needs if body.item_id in n.item_ids), None)
            line = next((l for l in need.lines if l.sale.product_id == body.product_id), None) if need else None
            if line is None:
                service._not_found()
            ids = need.item_ids
            reserved = sum(p.purchased_units for p in resource.product_purchases
                if p.line.sale.product_id == body.product_id)
        if body.purchased_units and any(service._item(db, target, i)['removed'] for i in ids):
            raise ShoppingListError(409, 'LIST_STATE_CONFLICT', 'Rétablis les articles avant cet achat.')
        sale = line.sale
        increment = sale.content_per_package if sale.price_basis == 'package' else sale.sale_increment
        quantity = Fraction(Decimal(increment.amount)) * body.purchased_units
        if body.purchased_units and sale.price_basis != 'package' and quantity < Fraction(Decimal(sale.minimum_sale.amount)):
            raise ShoppingListError(422, 'SALE_MINIMUM', 'La quantité est inférieure au minimum de vente.')
        other = [p for p in resource.product_purchases if existing is None or p.id != existing.id]
        covered = purchase_coverage(resource.purchases, other)
        remaining, allocations = quantity, []
        items = {i.id: i for i in resource.items}
        # Ordre enregistré dans la proposition ; le surplus reste sur le dernier
        # article, sans perte de quantité ni redistribution des anciens achats.
        for index, item_id in enumerate(ids):
            item = items[item_id]
            unit = increment.unit
            required = next((Fraction(Decimal(q.amount)) for q in item.required if q.unit == unit), Fraction())
            owned = next((Fraction(Decimal(q.amount)) for q in item.owned if q.unit == unit), Fraction())
            bought = sum((Fraction(Decimal(q.amount)) for q in covered[item_id].coverage if q.unit == unit), Fraction()) if item_id in covered else Fraction()
            allocated = remaining if index == len(ids) - 1 else min(remaining, max(Fraction(), required - owned - bought))
            if allocated:
                allocations.append({'item_id': item_id, 'quantity': {'amount': _quantity(allocated), 'unit': unit}})
            remaining -= allocated
        if existing and existing.purchased_units == body.purchased_units:
            allocations = existing.allocations
        identity = uuid5(body.comparison_id, '|'.join(sorted(map(str, ids))) + ':' + body.product_id)
        purchase = ShoppingProductPurchaseRead(id=identity, comparison_id=body.comparison_id,
            item_ids=ids, line=line, purchased_units=body.purchased_units, reserved_units=reserved,
            purchased_quantity=_quantity(quantity),
            estimated_amount=_money(_line_cost(sale, body.purchased_units, reserved)) if body.purchased_units else '0.00',
            allocations=allocations)
        db.execute(insert(ShoppingListProductPurchase).values(id=identity, list_id=target,
            comparison_id=body.comparison_id, data=purchase.model_dump(mode='json'))
            .on_conflict_do_update(index_elements=['id'], set_={'data': purchase.model_dump(mode='json')}))
        return target
    return service._mutate(db, user, key, 'product_purchase', body, list_id, action)


def complete(db: Session, list_id: UUID, user: CurrentUser,
             body: ShoppingCompleteWrite, key: UUID) -> ShoppingListRead:
    from sqlalchemy import update
    from .models import ShoppingList
    def action(target):
        resource = service.get_list(db, target, user)
        if resource.status != 'active':
            raise ShoppingListError(409, 'LIST_STATE_CONFLICT', 'Active la liste avant de terminer les courses.')
        if resource.totals.remaining_item_count and not body.accept_remaining:
            raise ShoppingListError(409, 'COURSES_REMAINING', 'Des besoins restent à acheter. Confirme pour terminer.')
        db.execute(update(ShoppingList).where(ShoppingList.id == target).values(status='completed'))
        return target
    return service._mutate(db, user, key, 'complete', body, list_id, action)


def decorate(resource: ShoppingListRead, assignment: ShoppingAppliedComparison | None) -> ShoppingListRead:
    """Coût du panier conservé, reste diminué par les seuls achats produits.

    Aucun prix de caisse n'est déduit. Une proposition périmée conserve les
    estimations des achats effectués ; les compléments demandent une comparaison.
    """
    products = resource.product_purchases
    bought = sum((Fraction(Decimal(p.estimated_amount)) for p in products), Fraction())
    budget, remaining = bought, Fraction()
    priced, covered = set(), set()
    manual = {p.item_id for p in resource.purchases if p.purchased}
    if assignment and not assignment.stale:
        for need in assignment.scenario.needs:
            if need.status in ('complete', 'owned', 'purchased'):
                covered.update(need.item_ids)
            if need.status == 'complete' and not (set(need.item_ids) & manual):
                priced.update(need.item_ids)
            for line in need.lines:
                matches = [p for p in products if p.comparison_id == assignment.comparison_id
                    and p.item_ids == need.item_ids and p.line.sale.product_id == line.sale.product_id]
                paid = sum((Fraction(Decimal(p.estimated_amount)) for p in matches), Fraction())
                balance = max(Fraction(), Fraction(Decimal(line.amount)) - paid)
                budget += balance
                remaining += balance
    known_bought = {a.item_id for p in products if p.purchased_units for a in p.allocations}
    items = []
    for item in resource.items:
        known = item.id in priced or (item.coverage_status == 'purchased' and item.id in known_bought and item.id not in manual)
        items.append(item.model_copy(update={'pricing_status': 'known' if known else item.pricing_status}))
    active = [i for i in items if not i.removed]
    unpriced = sum(i.coverage_status != 'owned' and i.pricing_status != 'known' for i in active)
    uncovered = sum(i.coverage_status in ('remaining', 'partial') and i.id not in covered for i in active)
    warnings = [w for w in resource.warnings if w.code != 'ESTIMATE_UNAVAILABLE']
    if unpriced:
        warnings.append({'code': 'ESTIMATE_PARTIAL', 'message': 'Certains achats ou compléments restent sans estimation.'})
    totals = resource.totals.model_copy(update={'budget_known_amount': _money(int(budget * 100)),
        'remaining_known_amount': _money(int(remaining * 100)), 'unpriced_item_count': unpriced,
        'uncovered_item_count': uncovered, 'estimate_complete': not (unpriced or uncovered)})
    return resource.model_validate({**resource.model_dump(), 'items': items, 'totals': totals,
                                   'assignment': assignment, 'warnings': warnings})
