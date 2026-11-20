"""Prix directs d’une liste en préparation, sans brouillon ni prix client."""
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from decimal import Decimal, localcontext
from fractions import Fraction
from uuid import NAMESPACE_URL, UUID, uuid4, uuid5

from sqlalchemy import insert, select

from backend.app.catalog.models import Ingredient
from backend.app.catalog.pricing import purchase_total
from backend.app.catalog.sales import NormalizedSale
from backend.app.common.units import quantity_fraction
from .comparisons import SCENARIOS, _hash, _scenario, catalog_fingerprint, state_fingerprint
from .errors import ShoppingListError
from .models import ShoppingListAssignment, ShoppingListChoice, ShoppingListComparison
from .purchases import _ceil, _cents, _money, _quantity
from .schemas import (
    ShoppingAppliedComparison, ShoppingCalculatedLine,
    ShoppingComparedNeed, ShoppingComparisonRead, ShoppingDraftItem, ShoppingDraftPricingRead,
    ShoppingDraftPricingWrite, ShoppingDraftProduct,
)


def item_identity(index: int) -> UUID:
    return uuid5(NAMESPACE_URL, f'optimeal:creation:item:{index}')


def resolve_items(db, items):
    """Correspondances exactes et uniques de noms/alias ; aucune recherche floue."""
    ingredients = list(db.scalars(select(Ingredient)))
    by_id = {item.id: item for item in ingredients}
    names = defaultdict(set)
    for item in ingredients:
        for name in [item.name, *item.aliases]:
            names[name.strip().casefold()].add(item.id)
    result = []
    for item in items:
        identity = item.ingredient_id
        if identity and identity not in by_id:
            raise ShoppingListError(422, 'INGREDIENT_NOT_FOUND', 'Un ingrédient est absent du catalogue.')
        matches = names[item.name.strip().casefold()]
        if identity is None and len(matches) == 1:
            identity = next(iter(matches))
        result.append(item.model_copy(update={'ingredient_id': identity}))
    return result


def line_increment(line):
    if line.pricing_method == 'direct':
        return line.direct_increment
    return line.sale.content_per_package if line.sale.price_basis == 'package' else line.sale.sale_increment


def direct_cost(sale, count, reserved=0):
    if not count:
        return '0.00'
    prices = [p for p in (sale.raw_source.price, sale.raw_source.promo_price, sale.raw_source.price_after_limit) if p is not None]
    with localcontext() as context:
        context.prec = max([len(p) for p in prices] or [1]) + len(str(count + reserved)) + 10
        total = purchase_total(sale.raw_source, count + reserved, sale.evaluated_on)
        before = purchase_total(sale.raw_source, reserved, sale.evaluated_on) if reserved else Decimal(0)
    return None if total is None or before is None else _money(_cents(Fraction(total)) - _cents(Fraction(before)))


def _option(sale, quantities, unquantified, *, available=None, reserved=0):
    """Un produit, son prix direct et un nombre entier d’unités de vente."""
    unit_price = direct_cost(sale, 1, reserved)
    base = dict(product_id=sale.product_id, name=sale.raw_source.name, retailer=sale.raw_source.retailer,
        store_id=sale.raw_source.store_id, format=sale.format.raw, unit_price=unit_price)
    issue = None
    increment = None
    if sale.match_status == 'rejected':
        issue = 'Produit non associé à cet ingrédient.'
    elif unit_price is None:
        issue = 'Prix indisponible à la date des courses.'
    elif len(quantities) > 1:
        issue = 'Quantités dans des unités incompatibles.'
    else:
        unit = next(iter(quantities), None)
        parsed = sale.format
        if unit == 'unit' and (parsed.kind != 'fixed' or parsed.unit != 'unit'):
            increment = {'amount': '1', 'unit': 'unit'}
        elif parsed.kind == 'fixed' and (unit is None or parsed.unit == unit):
            increment = {'amount': format(parsed.quantity, 'f'), 'unit': parsed.unit}
        elif unit is None:
            increment = {'amount': '1', 'unit': 'unit'}
        else:
            issue = 'Format inconnu ou incompatible avec la quantité demandée.'
    if issue:
        return ShoppingDraftProduct(**base, item_id=item_identity(0), item_index=0, units=None, amount=None, issue=issue), None
    size = Fraction(Decimal(increment['amount']))
    required = next(iter(quantities.values()), Fraction()) + unquantified * size
    covered = (available or {}).get(increment['unit'], Fraction())
    count = max(0, _ceil((required - covered) / size))
    if count == 0:
        return ShoppingDraftProduct(**base, item_id=item_identity(0), item_index=0, units=0, amount='0.00', issue=None), None
    if count > 1_000_000:
        return ShoppingDraftProduct(**base, item_id=item_identity(0), item_index=0, units=None, amount=None, issue='Quantité trop élevée.'), None
    amount = direct_cost(sale, count, reserved)
    line = ShoppingCalculatedLine(sale=sale, pricing_method='direct', direct_increment=increment,
        sale_units=count, quantity=_quantity(size * count), amount=amount, estimated_weight=False)
    return ShoppingDraftProduct(**base, item_id=item_identity(0), item_index=0, units=count, amount=amount, issue=None), line


def build(body: ShoppingDraftPricingWrite, sales: list[NormalizedSale]) -> ShoppingDraftPricingRead:
    choices = {}
    for choice in body.choices:
        if choice.item_index >= len(body.items) or choice.item_index in choices:
            raise ShoppingListError(422, 'INVALID_PRODUCT_CHOICE', 'Choix de produit dupliqué ou hors de la liste.')
        choices[choice.item_index] = choice.product_id
    relevant = [s for s in sales if s.ingredient_id in {i.ingredient_id for i in body.items}]
    if len(relevant) > 2000:
        raise ShoppingListError(422, 'COMPARISON_TOO_LARGE', 'Trop de références pour cette liste.')
    identities = [(s.ingredient_id, s.product_id) for s in relevant]
    if len(identities) != len(set(identities)):
        raise ShoppingListError(422, 'PRODUCT_MAPPING_AMBIGUOUS', 'Un produit est dupliqué dans le catalogue.')
    product_ingredients = defaultdict(set)
    for sale in relevant:
        product_ingredients[sale.product_id].add(sale.ingredient_id)
    if any(len(values) > 1 for values in product_ingredients.values()):
        raise ShoppingListError(422, 'PRODUCT_MAPPING_AMBIGUOUS', 'Un produit correspond à plusieurs ingrédients.')
    normalized, groups = [], defaultdict(list)
    for index, item in enumerate(body.items):
        quantities = defaultdict(Fraction)
        for q in item.required:
            amount, unit = quantity_fraction(Decimal(q.amount), q.unit)
            quantities[unit] += amount
        normalized.append({'name': item.name, 'ingredient_id': item.ingredient_id,
            'required': {unit: str(value) for unit, value in sorted(quantities.items())}})
        groups[item.ingredient_id or f'free:{index}'].append((index, item, quantities))
    result = {name: [] for name in SCENARIOS}
    candidates = []
    for entries in groups.values():
        index, item, _ = entries[0]
        amounts, unquantified = defaultdict(Fraction), 0
        for _, _, quantities in entries:
            if not quantities:
                unquantified += 1
            for unit, amount in quantities.items():
                amounts[unit] += amount
        picked = {choices[i] for i, _, _ in entries if i in choices}
        if len(picked) > 1:
            raise ShoppingListError(422, 'INVALID_PRODUCT_CHOICE', 'Choisis un seul produit pour cet ingrédient.')
        options = []
        for sale in relevant:
            if sale.ingredient_id != item.ingredient_id:
                continue
            candidate, line = _option(sale, amounts, unquantified)
            candidates.append(candidate.model_copy(update={'item_index': index, 'item_id': item_identity(index)}))
            if line:
                options.append(line)
        if picked and not any(line.sale.product_id in picked for line in options):
            raise ShoppingListError(422, 'INVALID_PRODUCT_CHOICE', 'Ce produit ne permet pas de chiffrer la quantité demandée.')
        for name in SCENARIOS:
            available = [line for line in options if name == 'cheapest' or line.sale.raw_source.retailer == name]
            if name == 'cheapest' and picked:
                available = [line for line in available if line.sale.product_id in picked]
            chosen = min(available, key=lambda line: (Decimal(line.amount), line.sale.raw_source.retailer, line.sale.product_id)) if available else None
            result[name].append(ShoppingComparedNeed(item_ids=[item_identity(i) for i, _, _ in entries],
                name=item.name, ingredient_id=item.ingredient_id, unit=next(iter(amounts)) if len(amounts) == 1 else None,
                remaining=_quantity(next(iter(amounts.values()))) if len(amounts) == 1 else None,
                status='complete' if chosen else 'unpriced', manual=name == 'cheapest' and bool(picked),
                lines=[chosen] if chosen else [], amount=chosen.amount if chosen else None))
    fingerprint = _hash({'items': normalized, 'date': body.purchase_date.isoformat(),
        'catalog': catalog_fingerprint(relevant), 'choices': sorted(choices.items()), 'method': 'direct-ceil-v1'})
    return ShoppingDraftPricingRead(fingerprint=fingerprint,
        scenarios=[_scenario(name, needs) for name, needs in result.items()], candidates=candidates)


def preview(db, user, body, source):
    items = resolve_items(db, body.items)
    return build(body.model_copy(update={'items': items}), source(db, body.purchase_date))


def attach(db, list_id, user, pricing, source):
    """Recalcul serveur et enregistrement atomique du panier confirmé."""
    from . import service
    from .courses import planning_fingerprint
    resource = service._snapshot(db, list_id, user)
    body = ShoppingDraftPricingWrite(purchase_date=resource.purchase_date, choices=pricing.choices,
        items=[ShoppingDraftItem(name=i.name, ingredient_id=i.ingredient_id, required=[q.model_dump() for q in i.required]) for i in resource.items])
    quote = build(body, source(db, resource.purchase_date))
    if quote.fingerprint != pricing.fingerprint:
        raise ShoppingListError(409, 'COMPARISON_STALE', 'Les prix ou les ingrédients ont changé. Vérifie les prix de nouveau.')
    selected = next(s for s in quote.scenarios if s.scenario == pricing.scenario)
    if not selected.complete and not pricing.accept_partial:
        raise ShoppingListError(409, 'COMPARISON_PARTIAL', 'Confirme les produits sans prix avant de créer la liste.')
    identities = {item_identity(index): item.id for index, item in enumerate(resource.items)}
    scenarios = [s.model_copy(update={'needs': [n.model_copy(update={'item_ids': [identities[i] for i in n.item_ids]}) for n in s.needs]}) for s in quote.scenarios]
    selected = next(s for s in scenarios if s.scenario == pricing.scenario)
    # Les listes de produits figent tous les choix du scénario, sans toucher aux anciens clients.
    chosen_needs = [n for n in selected.needs if n.lines and (resource.kind == 'products' or
        pricing.scenario == 'cheapest' and n.manual)]
    for need in chosen_needs:
        for item_id in need.item_ids:
            db.execute(insert(ShoppingListChoice).values(list_id=list_id, item_id=item_id, product_id=need.lines[0].sale.product_id))
    # Relire les choix dans l'ordre canonique du stockage (UUID), et non celui des rayons.
    # Sinon un panier de plusieurs ingrédients peut être périmé dès sa première lecture.
    resource = service._snapshot(db, list_id, user)
    comparison = ShoppingComparisonRead(id=uuid4(), list_id=list_id, source_revision=resource.revision,
        purchase_date=resource.purchase_date, catalog_fingerprint=quote.fingerprint, state_fingerprint=state_fingerprint(resource),
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=15), scenarios=scenarios, candidates=[])
    db.execute(insert(ShoppingListComparison).values(id=comparison.id, list_id=list_id, data=comparison.model_dump(mode='json')))
    assignment = ShoppingAppliedComparison(comparison_id=comparison.id, source_revision=resource.revision,
        purchase_date=resource.purchase_date, state_fingerprint=comparison.state_fingerprint, scenario=selected,
        planning_fingerprint=planning_fingerprint(resource, comparison.id, selected),
        selected_products={line.sale.product_id: line.sale.raw_source for need in selected.needs for line in need.lines}
            if resource.kind == 'products' else {})
    db.execute(insert(ShoppingListAssignment).values(list_id=list_id, comparison_id=comparison.id, data=assignment.model_dump(mode='json')))
