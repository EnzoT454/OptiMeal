"""Recalcul explicite : prix directs du reste, achats immuables et commandes privées."""
from uuid import uuid4

import pytest
from sqlalchemy import func, select

from backend.app.shopping_lists import service, courses, draft_pricing, recalculation
from backend.app.shopping_lists.models import ShoppingListComparison, ShoppingListRevision
from backend.app.shopping_lists.schemas import (ShoppingRecalculatePricesWrite, ShoppingItemUpdate,
    ShoppingItemAdd, ShoppingManualPurchaseWrite, ShoppingPossessionWrite, ShoppingProductPurchaseWrite,
    ShoppingDraftPricingWrite, ShoppingListCreate)
from backend.app.shopping_lists.errors import ShoppingListError
from backend.tests.test_shopping_creation_pricing import sale, body, creation, DAY, INGREDIENT
from backend.tests.test_shopping_list_storage import db, postgres  # noqa: F401
from backend.tests.test_accounts import ALICE, BOB, accounts, login  # noqa: F401


def make(db, amount='1000', sales=None):
    sales = sales or [sale()]
    source = lambda db, day: sales
    request = body(amount)
    quote = draft_pricing.preview(db, ALICE, request, source)
    return service.create_list(db, ALICE, creation(request, quote), uuid4(), source)


def buy(db, resource, units):
    need = next(n for n in resource.assignment.scenario.needs if n.lines)
    return courses.set_product_purchase(db, resource.id, ALICE, ShoppingProductPurchaseWrite(
        expected_revision=resource.revision, comparison_id=resource.assignment.comparison_id,
        item_id=need.item_ids[0], product_id=need.lines[0].sale.product_id, purchased_units=units), uuid4())


def recalculate(db, resource, sales=None, **changes):
    return recalculation.recalculate(db, resource.id, ALICE, ShoppingRecalculatePricesWrite(
        expected_revision=resource.revision, **changes), uuid4(), lambda db, day: sales or [sale()])


@pytest.mark.parametrize('new_price,total,remaining', [('3', '9.00', '6.00'), ('5', '13.00', '10.00')])
def test_growing_need_reprices_only_the_remaining_quantity_and_keeps_paid_snapshots(db, new_price, total, remaining):
    partial = buy(db, make(db), 1)
    paid = partial.product_purchases[0].model_dump(mode='json')
    changed = service.update_item(db, partial.id, partial.items[0].id, ALICE,
        ShoppingItemUpdate(expected_revision=partial.revision, quantity={'amount': '1500', 'unit': 'g'}), uuid4())
    result = recalculate(db, changed, [sale(price=new_price)])
    assert result.product_purchases[0].model_dump(mode='json') == paid
    assert result.totals.budget_known_amount == total and result.totals.remaining_known_amount == remaining
    assert result.assignment.scenario.needs[0].lines[0].sale_units == 2
    assert not result.assignment.stale
    assert db.scalar(select(func.count()).select_from(ShoppingListRevision)) == 1


def test_promotion_allowance_is_not_reset_when_recalculating_after_a_partial_purchase(db):
    sales = [sale(price='9', is_promotion=True, promo_price='2', quantity_limit=1,
        price_after_limit='5', valid_from=DAY, valid_to=DAY)]
    partial = buy(db, make(db, sales=sales), 1)
    result = recalculate(db, partial, sales)
    assert result.totals.budget_known_amount == '7.00'
    assert result.totals.remaining_known_amount == '5.00'
    assert result.assignment.scenario.needs[0].lines[0].sale_units == 1
    full = buy(db, result, 1)
    assert full.totals.budget_known_amount == '7.00' and full.totals.remaining_known_amount == '0.00'
    old = [p.model_dump(mode='json') for p in full.product_purchases]
    again = recalculate(db, full, sales)
    assert not any(n.lines for n in again.assignment.scenario.needs)
    assert [p.model_dump(mode='json') for p in again.product_purchases] == old
    assert again.totals.budget_known_amount == '7.00'


def test_changing_store_changes_future_products_and_keeps_the_previous_paid_store(db):
    original = sale(price='3')
    other = sale(retailer='metro', identity='other', price='4')
    partial = buy(db, make(db, sales=[original, other]), 1)
    paid = partial.product_purchases[0].model_dump(mode='json')
    count = db.scalar(select(func.count()).select_from(ShoppingListComparison))
    options = recalculation.options(db, partial.id, ALICE, lambda db, day: [original, other])
    assert db.scalar(select(func.count()).select_from(ShoppingListComparison)) == count
    candidate = next(c for c in options.candidates if c.product_id == other.product_id)
    assert candidate.units == 1 and candidate.amount == '4.00'
    result = recalculate(db, partial, [original, other], choices=[{'item_id': partial.items[0].id, 'product_id': other.product_id}])
    assert result.product_purchases[0].model_dump(mode='json') == paid
    assert result.totals.budget_known_amount == '7.00' and result.totals.remaining_known_amount == '4.00'
    assert {s.retailer: s.amount for s in result.assignment.scenario.store_totals} == {'maxi': '3.00', 'metro': '4.00'}
    assert result.choices[0].product_id == other.product_id
    reset = recalculate(db, result, [original, other], choices=[{'item_id': result.items[0].id, 'product_id': None}])
    assert not reset.choices and reset.totals.budget_known_amount == '6.00'


def test_removing_a_bought_item_and_adding_another_does_not_erase_past_cost(db):
    partial = buy(db, make(db), 1)
    paid = partial.product_purchases[0].model_dump(mode='json')
    changed = service.update_item(db, partial.id, partial.items[0].id, ALICE,
        ShoppingItemUpdate(expected_revision=partial.revision, removed=True), uuid4())
    changed = service.add_item(db, changed.id, ALICE,
        ShoppingItemAdd(expected_revision=changed.revision, name='Serviettes'), uuid4())
    result = recalculate(db, changed)
    assert result.product_purchases[0].model_dump(mode='json') == paid
    assert result.totals.budget_known_amount == '3.00' and result.totals.remaining_known_amount == '0.00'
    assert not result.totals.estimate_complete
    assert result.assignment.scenario.needs[0].name == 'Serviettes'


@pytest.mark.parametrize('owned', [False, True])
def test_owned_and_manual_purchased_quantities_reduce_future_purchases_without_inventing_paid_prices(db, owned):
    resource = make(db)
    write = ShoppingPossessionWrite(expected_revision=resource.revision, coverage={'quantities': [{'amount': '300', 'unit': 'g'}]}) if owned else ShoppingManualPurchaseWrite(
        expected_revision=resource.revision, purchased=True, coverage={'quantities': [{'amount': '300', 'unit': 'g'}]})
    changed = service.set_possession(db, resource.id, resource.items[0].id, ALICE, write, uuid4()) if owned else service.set_manual_purchase(
        db, resource.id, resource.items[0].id, ALICE, write, uuid4())
    manual = [p.model_dump(mode='json') for p in changed.purchases]
    result = recalculate(db, changed)
    assert result.assignment.scenario.needs[0].lines[0].sale_units == 2  # plafond de 700 / 500
    assert result.totals.budget_known_amount == '6.00'
    assert [p.model_dump(mode='json') for p in result.purchases] == manual
    assert result.totals.estimate_complete == owned


def test_recalculation_preserves_the_selected_store_without_a_manual_product_change(db):
    sales = [sale(price='3'), sale(retailer='metro', identity='other', price='4')]
    request = body('750'); quote = draft_pricing.preview(db, ALICE, request, lambda db, day: sales)
    write = creation(request, quote); write.pricing.scenario = 'metro'
    resource = service.create_list(db, ALICE, write, uuid4(), lambda db, day: sales)
    result = recalculate(db, resource, sales)
    assert result.assignment.scenario.scenario == 'metro'
    assert result.totals.budget_known_amount == '8.00'


def test_recalculation_is_idempotent_and_conflicts_do_not_change_purchases_or_plan(db):
    resource = buy(db, make(db), 1)
    key = uuid4(); write = ShoppingRecalculatePricesWrite(expected_revision=resource.revision)
    result = recalculation.recalculate(db, resource.id, ALICE, write, key, lambda db, day: [sale()])
    assert recalculation.recalculate(db, resource.id, ALICE, write, key,
        lambda *args: pytest.fail('Un rejeu ne relit pas les prix')) == result
    with pytest.raises(ShoppingListError) as failure:
        recalculation.recalculate(db, result.id, ALICE, write, uuid4(), lambda *args: pytest.fail('Conflit avant catalogue'))
    assert failure.value.code == 'LIST_REVISION_CONFLICT'
    assert service.get_list(db, result.id, ALICE) == result


def test_invalid_or_foreign_product_choices_roll_back_all_changes(db):
    resource = make(db)
    for item_id, product in [(uuid4(), sale().product_id), (resource.items[0].id, 'missing')]:
        with pytest.raises(ShoppingListError):
            recalculate(db, resource, choices=[{'item_id': item_id, 'product_id': product}])
        assert service.get_list(db, resource.id, ALICE) == resource
    with pytest.raises(ShoppingListError) as failure:
        recalculation.recalculate(db, resource.id, BOB, ShoppingRecalculatePricesWrite(expected_revision=1), uuid4(),
            lambda *args: pytest.fail('Pas de lecture du catalogue pour une liste étrangère'))
    assert failure.value.status == 404


def test_unquantified_duplicate_items_keep_partial_purchases_and_recalculate_one_remaining_product(db):
    request = ShoppingDraftPricingWrite(purchase_date=DAY, items=[{'name': 'Riz', 'ingredient_id': INGREDIENT, 'required': []}] * 2)
    source = lambda db, day: [sale()]
    quote = draft_pricing.preview(db, ALICE, request, source)
    write = ShoppingListCreate(name='Courses', activate=True, purchase_date=DAY, items=[{'name': 'Riz', 'ingredient_id': INGREDIENT}] * 2,
        pricing={'fingerprint': quote.fingerprint, 'scenario': 'cheapest'})
    partial = buy(db, service.create_list(db, ALICE, write, uuid4(), source), 1)
    assert [item.coverage_status for item in partial.items] == ['purchased', 'remaining']
    paid = partial.product_purchases[0].model_dump(mode='json')
    result = recalculate(db, partial)
    assert result.assignment.scenario.needs[0].lines[0].sale_units == 1
    assert result.totals.budget_known_amount == '6.00' and result.totals.remaining_known_amount == '3.00'
    assert result.product_purchases[0].model_dump(mode='json') == paid
    full = buy(db, result, 1)
    assert all(item.coverage_status == 'purchased' for item in full.items)


def test_direct_price_rounding_is_consistent_across_partial_purchases():
    product = sale(price='0.005')
    assert draft_pricing.direct_cost(product, 2) == '0.01'
    assert draft_pricing.direct_cost(product, 1) == '0.01'
    assert draft_pricing.direct_cost(product, 1, reserved=1) == '0.00'


def test_mixed_quantified_and_unquantified_group_keeps_one_product_remaining_after_a_partial_purchase(db):
    request = ShoppingDraftPricingWrite(purchase_date=DAY, items=[
        {'name': 'Riz', 'ingredient_id': INGREDIENT, 'required': [{'amount': '750', 'unit': 'g'}]},
        {'name': 'Riz', 'ingredient_id': INGREDIENT, 'required': []}])
    source = lambda db, day: [sale()]
    quote = draft_pricing.preview(db, ALICE, request, source)
    write = ShoppingListCreate(name='Courses', activate=True, purchase_date=DAY, items=[
        {'name': 'Riz', 'ingredient_id': INGREDIENT, 'quantity': {'amount': '750', 'unit': 'g'}},
        {'name': 'Riz', 'ingredient_id': INGREDIENT}], pricing={'fingerprint': quote.fingerprint, 'scenario': 'cheapest'})
    partial = buy(db, service.create_list(db, ALICE, write, uuid4(), source), 2)
    old = partial.product_purchases[0].model_dump(mode='json')
    assert partial.items[1].coverage_status == 'remaining'
    result = recalculate(db, partial)
    assert result.assignment.scenario.needs[0].lines[0].sale_units == 1
    assert result.totals.budget_known_amount == '9.00' and result.totals.remaining_known_amount == '3.00'
    assert result.product_purchases[0].model_dump(mode='json') == old


def test_recalculation_http_is_private_idempotent_and_preserves_saved_purchases(accounts, monkeypatch):
    from backend.app.catalog.sales import normalize_sale
    from backend.tests.test_sale_normalization import product
    from backend.app.shopping_lists import comparisons
    from backend.tests.test_shopping_list_http import command, ROOT
    client, app = accounts
    ingredient = 'ing_riz_basmati_blanc'
    state = {'price': '3'}
    monkeypatch.setattr(comparisons, 'load_sales', lambda req, db, day: [normalize_sale(ingredient, product(price=state['price']), day)])
    assert client.post(ROOT + '/' + str(uuid4()) + '/recalculate-prices', json={'expected_revision': 1}).status_code == 401
    login(app, ALICE)
    request = {'purchase_date': str(DAY), 'items': [{'name': 'Riz', 'ingredient_id': ingredient, 'required': [{'amount': '1000', 'unit': 'g'}]}]}
    quote = client.post(ROOT + '/creation-prices', json=request).json()['item']
    created = command(client, body={'name': 'Courses', 'activate': True, 'purchase_date': str(DAY),
        'items': [{'name': 'Riz', 'ingredient_id': ingredient, 'quantity': {'amount': '1000', 'unit': 'g'}}],
        'pricing': {'fingerprint': quote['fingerprint'], 'scenario': 'cheapest'}}).json()['item']
    path = ROOT + '/' + created['id']
    partial = command(client, path + '/product-purchases', {'expected_revision': created['revision'],
        'comparison_id': created['assignment']['comparison_id'], 'item_id': created['items'][0]['id'],
        'product_id': 'maxi:8661:test', 'purchased_units': 1}, method='put').json()['item']
    price_options = client.get(path + '/price-options')
    assert price_options.status_code == 200, price_options.text
    assert price_options.json()['item']['candidates'][0]['units'] == 1
    assert client.get(path).json()['item'] == partial  # lecture sans modification
    body = {'expected_revision': partial['revision']}
    assert client.post(path + '/recalculate-prices', json=body).status_code == 422  # clé requise
    assert command(client, path + '/recalculate-prices', body | {'price': '0.01'}).status_code == 422
    state['price'] = '5'; key = uuid4()
    result = command(client, path + '/recalculate-prices', body, key)
    assert result.status_code == 200, result.text
    saved = result.json()['item']
    assert saved['product_purchases'] == partial['product_purchases']
    assert saved['totals']['budget_known_amount'] == '8.00' and saved['totals']['remaining_known_amount'] == '5.00'
    assert command(client, path + '/recalculate-prices', body, key).json()['item'] == saved
    login(app, BOB)
    assert client.get(path + '/price-options').status_code == 404
    assert command(client, path + '/recalculate-prices', {'expected_revision': saved['revision']}).status_code == 404
