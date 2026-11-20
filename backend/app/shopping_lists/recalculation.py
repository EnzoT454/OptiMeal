"""Recalcul direct du reste à acheter, sans réévaluer les achats enregistrés."""
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from fractions import Fraction
from uuid import uuid4

from sqlalchemy import delete, insert, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert

from backend.app.catalog.models import Ingredient
from . import service
from .comparisons import SCENARIOS, _hash, _scenario, catalog_fingerprint, state_fingerprint
from .courses import planning_fingerprint, purchase_coverage
from .draft_pricing import _option, resolve_items
from .errors import ShoppingListError
from .models import ShoppingList, ShoppingListAssignment, ShoppingListChoice, ShoppingListComparison, ShoppingListItem
from .purchases import _quantity
from .schemas import ShoppingAppliedComparison, ShoppingComparedNeed, ShoppingComparisonRead, ShoppingDraftPricingRead


def remaining_prices(resource, sales):
    active = [item for item in resource.items if not item.removed]
    if len(active) > 500:
        raise ShoppingListError(422, 'COMPARISON_TOO_LARGE', 'Recalcule au maximum 500 articles.')
    relevant = [sale for sale in sales if sale.ingredient_id in {item.ingredient_id for item in active}]
    if len(relevant) > 2000 or len({(s.ingredient_id, s.product_id) for s in relevant}) != len(relevant):
        raise ShoppingListError(422, 'COMPARISON_TOO_LARGE', 'Catalogue trop grand ou références dupliquées.')
    mapped = defaultdict(set)
    for sale in relevant:
        mapped[sale.product_id].add(sale.ingredient_id)
    if any(len(ids) > 1 for ids in mapped.values()):
        raise ShoppingListError(422, 'PRODUCT_MAPPING_AMBIGUOUS', 'Un produit correspond à plusieurs ingrédients.')
    groups = defaultdict(list)
    for index, item in enumerate(active):
        groups[item.ingredient_id or f'free:{item.id}'].append((index, item))
    choices = {choice.item_id: choice.product_id for choice in resource.choices}
    coverage = purchase_coverage(resource.purchases, resource.product_purchases)
    manual = {purchase.item_id for purchase in resource.purchases if purchase.purchased}
    reserved = defaultdict(int)
    for purchase in resource.product_purchases:
        reserved[purchase.line.sale.product_id] += purchase.purchased_units
    result = {scenario: [] for scenario in SCENARIOS}
    candidates = []
    for entries in groups.values():
        index, first = entries[0]
        ids = [item.id for _, item in entries]
        amounts, available, unquantified = defaultdict(Fraction), defaultdict(Fraction), 0
        unknown_paid = bool(set(ids) & manual)
        warnings = ['PURCHASED_PRICE_UNKNOWN'] if unknown_paid else []
        for _, item in entries:
            for q in item.required:
                amounts[q.unit] += Fraction(Decimal(q.amount))
            for q in item.owned:
                available[q.unit] += Fraction(Decimal(q.amount))
            bought = coverage.get(item.id)
            if bought:
                for q in bought.coverage:
                    available[q.unit] += Fraction(Decimal(q.amount))
            if not item.required and item.owned_unquantified_need_revision != item.need_revision:
                # Un achat manuel sans quantité couvre un produit sans inventer son prix/format.
                paid = next((p for p in resource.purchases if p.item_id == item.id and p.purchased), None)
                if not paid or paid.confirmed_need_revision != item.need_revision:
                    unquantified += 1
        selected = {choices[i] for i in ids if i in choices}
        base = dict(item_ids=ids, name=first.name, ingredient_id=first.ingredient_id,
            unit=next(iter(amounts)) if len(amounts) == 1 else None,
            remaining=_quantity(max(Fraction(), next(iter(amounts.values())) - available.get(next(iter(amounts)), Fraction()))) if len(amounts) == 1 else None)
        all_covered = all(item.coverage_status in ('owned', 'purchased') for _, item in entries)
        covered_quantities = bool(amounts) and not unquantified and all(available[unit] >= amount for unit, amount in amounts.items())
        if all_covered or covered_quantities:
            owned = all(item.coverage_status == 'owned' for _, item in entries)
            for scenario in SCENARIOS:
                result[scenario].append(ShoppingComparedNeed(**base, status='owned' if owned else 'purchased',
                    amount='0.00' if owned else None, manual=bool(selected), purchased_price_known=not unknown_paid,
                    warnings=warnings))
            continue
        options = []
        for sale in relevant:
            if sale.ingredient_id != first.ingredient_id:
                continue
            candidate, line = _option(sale, amounts, unquantified, available=available, reserved=reserved[sale.product_id])
            candidates.append(candidate.model_copy(update={'item_id': first.id, 'item_index': index}))
            if candidate.amount is not None:
                options.append((candidate, line))
        for scenario in SCENARIOS:
            options_here = [(candidate, line) for candidate, line in options
                if (candidate.product_id in selected if selected else scenario == 'cheapest' or candidate.retailer == scenario)]
            chosen = min(options_here, key=lambda pair: (Decimal(pair[0].amount), pair[0].retailer, pair[0].product_id)) if options_here and len(selected) <= 1 else None
            notes = list(warnings)
            if chosen and selected and scenario != 'cheapest' and chosen[0].retailer != scenario:
                notes.append('MANUAL_CHOICE_OUTSIDE_SCENARIO')
            if chosen and chosen[1] is not None:
                line = chosen[1]
                status, amount, lines = 'complete', line.amount, [line]
            elif chosen:
                status, amount, lines = 'purchased', None, []
            else:
                status, amount, lines = ('manual_unavailable' if selected else 'unpriced'), None, []
            result[scenario].append(ShoppingComparedNeed(**base, status=status, amount=amount, lines=lines,
                manual=bool(selected), warnings=notes, purchased_price_known=status == 'purchased' and not unknown_paid))
    return ShoppingDraftPricingRead(fingerprint=_hash({'state': state_fingerprint(resource),
        'products': [p.model_dump(mode='json') for p in resource.product_purchases],
        'catalog': catalog_fingerprint(relevant), 'method': 'direct-remaining-v1'}),
        scenarios=[_scenario(name, needs, resource.product_purchases) for name, needs in result.items()], candidates=candidates)


def options(db, list_id, user, source):
    resource = service.get_list(db, list_id, user)
    if resource.status not in ('draft', 'active'):
        raise ShoppingListError(409, 'LIST_STATE_CONFLICT', 'Rouvre la liste avant de recalculer ses prix.')
    # Lecture sans écriture ; les correspondances exactes seront persistées au recalcul.
    resource = resource.model_copy(update={'items': resolve_items(db, resource.items)})
    return remaining_prices(resource, source(db, resource.purchase_date))


def recalculate(db, list_id, user, body, key, source):
    def action(target):
        resource = service.get_list(db, target, user)
        if body.expected_fingerprint is not None:
            before = options(db, target, user, source)
            if before.fingerprint != body.expected_fingerprint:
                raise ShoppingListError(409, 'COMPARISON_STALE', 'Les prix ou les besoins ont changé. Compare de nouveau.')
        if body.refresh_date:
            db.execute(update(ShoppingList).where(ShoppingList.id == target).values(purchase_date=service.today()))
            resource = service._snapshot(db, target, user)
        resolved = resolve_items(db, resource.items)
        for original, item in zip(resource.items, resolved):
            if original.ingredient_id != item.ingredient_id:
                category = db.scalar(select(Ingredient.category).where(Ingredient.id == item.ingredient_id))
                db.execute(update(ShoppingListItem).where(ShoppingListItem.id == item.id).values(ingredient_id=item.ingredient_id, category=category))
        resource = service._snapshot(db, target, user)
        sales = source(db, resource.purchase_date)
        items = {item.id: item for item in resource.items if not item.removed}
        changed_groups = set()
        for choice in body.choices:
            item = items.get(choice.item_id)
            if item is None:
                service._not_found()
            group = item.ingredient_id or str(item.id)
            if group in changed_groups:
                raise ShoppingListError(422, 'INVALID_PRODUCT_CHOICE', 'Choisis un seul produit par ingrédient.')
            changed_groups.add(group)
            if choice.product_id is not None and not any(s.product_id == choice.product_id and s.ingredient_id == item.ingredient_id for s in sales):
                raise ShoppingListError(422, 'PRODUCT_NOT_MATCHED', 'Produit absent ou sans correspondance à cet ingrédient.')
            group_ids = [i.id for i in items.values() if (i.ingredient_id == item.ingredient_id if item.ingredient_id else i.id == item.id)]
            db.execute(delete(ShoppingListChoice).where(ShoppingListChoice.item_id.in_(group_ids)))
            if choice.product_id is not None:
                db.execute(insert(ShoppingListChoice), [dict(list_id=target, item_id=i, product_id=choice.product_id) for i in group_ids])
        resource = service._snapshot(db, target, user)
        quote = remaining_prices(resource, sales)
        for choice in body.choices:
            if choice.product_id is not None:
                need = next(n for n in quote.scenarios[-1].needs if choice.item_id in n.item_ids)
                if need.status == 'manual_unavailable':
                    raise ShoppingListError(422, 'INVALID_PRODUCT_CHOICE', 'Produit incompatible avec la quantité ou prix indisponible.')
        scenario_name = body.scenario or ('cheapest' if body.choices else resource.assignment.scenario.scenario if resource.assignment else 'cheapest')
        scenario = next(s for s in quote.scenarios if s.scenario == scenario_name)
        if body.expected_fingerprint is not None and not scenario.complete and not body.accept_partial:
            raise ShoppingListError(409, 'COMPARISON_PARTIAL', 'Confirme les articles sans prix avant d’appliquer.')
        store_quote(db, target, resource, quote, scenario_name, sales)
        return target
    return service._mutate(db, user, key, 'recalculate_prices', body, list_id, action)


def refresh_current_prices(db, list_id, user, source, *, sales=None):
    """Recalcul dans la transaction de modification, sans seconde commande ni achat réécrit."""
    if source is None:
        raise ShoppingListError(503, 'CATALOG_UNAVAILABLE', 'Catalogue indisponible.')
    db.execute(update(ShoppingList).where(ShoppingList.id == list_id).values(purchase_date=service.today()))
    resource = service._snapshot(db, list_id, user)
    sales = sales if sales is not None else source(db, resource.purchase_date)
    quote = remaining_prices(resource, sales)
    scenario = resource.assignment.scenario.scenario if resource.assignment else 'cheapest'
    store_quote(db, list_id, resource, quote, scenario, sales)


def store_quote(db, target, resource, quote, scenario_name, sales, selected_products=None):
    scenario = next(s for s in quote.scenarios if s.scenario == scenario_name)
    comparison = ShoppingComparisonRead(id=uuid4(), list_id=target, source_revision=resource.revision,
        purchase_date=resource.purchase_date, catalog_fingerprint=catalog_fingerprint(sales),
        state_fingerprint=state_fingerprint(resource), expires_at=datetime.now(timezone.utc) + timedelta(minutes=15),
        scenarios=quote.scenarios, candidates=[])
    db.execute(insert(ShoppingListComparison).values(id=comparison.id, list_id=target, data=comparison.model_dump(mode='json')))
    assignment = ShoppingAppliedComparison(comparison_id=comparison.id, source_revision=resource.revision,
        purchase_date=resource.purchase_date, state_fingerprint=comparison.state_fingerprint, scenario=scenario,
        planning_fingerprint=planning_fingerprint(resource, comparison.id, scenario),
        selected_products=selected_products if selected_products is not None else (resource.assignment.selected_products if resource.assignment else {}))
    db.execute(pg_insert(ShoppingListAssignment).values(list_id=target, comparison_id=comparison.id, data=assignment.model_dump(mode='json'))
        .on_conflict_do_update(index_elements=['list_id'], set_={'comparison_id': comparison.id, 'data': assignment.model_dump(mode='json')}))


def apply_product_selection(db, list_id, item_id, user, product_id, source):
    """Choix ciblé, sans chiffrer les autres ingrédients génériques."""
    resource = service._snapshot(db, list_id, user)
    item = next((i for i in resource.items if i.id == item_id and not i.removed), None)
    if item is None:
        service._not_found()
    if source is None:
        raise ShoppingListError(503, 'CATALOG_UNAVAILABLE', 'Catalogue indisponible.')
    if resource.kind == 'products' and resource.purchase_date != service.today():
        db.execute(update(ShoppingList).where(ShoppingList.id == list_id).values(purchase_date=service.today()))
        resource = service._snapshot(db, list_id, user)
    sales = source(db, resource.purchase_date)
    chosen = next((s for s in sales if s.product_id == product_id and s.ingredient_id == item.ingredient_id), None)
    if chosen is None or item.ingredient_id is None or chosen.match_status == 'rejected':
        raise ShoppingListError(422, 'PRODUCT_NOT_MATCHED', 'Produit absent ou incompatible avec cet ingrédient.')
    group_ids = [i.id for i in resource.items if not i.removed and i.ingredient_id == item.ingredient_id]
    db.execute(delete(ShoppingListChoice).where(ShoppingListChoice.item_id.in_(group_ids)))
    db.execute(insert(ShoppingListChoice), [dict(list_id=list_id, item_id=i, product_id=product_id) for i in group_ids])
    allowed = {product_id}
    metadata = dict(resource.assignment.selected_products) if resource.assignment else {}
    if resource.assignment:
        allowed.update(line.sale.product_id for need in resource.assignment.scenario.needs
                       if need.ingredient_id != item.ingredient_id for line in need.lines)
    metadata[product_id] = chosen.raw_source
    resource = service._snapshot(db, list_id, user)
    allowed.update(c.product_id for c in resource.choices)
    restricted = [sale for sale in sales if sale.product_id in allowed]
    quote = remaining_prices(resource, restricted)
    store_quote(db, list_id, resource, quote, 'cheapest', sales, metadata)


def select_product(db, list_id, item_id, user, body, key, source):
    def action(target):
        if body.product_id is None:
            raise ShoppingListError(422, 'PRODUCT_NOT_MATCHED', 'Sélectionne un produit explicite.')
        apply_product_selection(db, target, item_id, user, body.product_id, source)
        return target
    return service._mutate(db, user, key, 'select_product:' + str(item_id), body, list_id, action)
