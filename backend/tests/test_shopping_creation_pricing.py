"""Création en deux étapes : prix directs, plafonds exacts et validation atomique."""
from uuid import uuid4
from datetime import timedelta
from decimal import localcontext

import pytest
from sqlalchemy import func, select

from backend.app.catalog.sales import normalize_sale
from backend.app.shopping_lists import draft_pricing as pricing, service, courses
from backend.app.shopping_lists.errors import ShoppingListError
from backend.app.shopping_lists.models import ShoppingList, ShoppingListAssignment, ShoppingListCommand, ShoppingListComparison, ShoppingListItem, ShoppingListRevision
from backend.app.shopping_lists.schemas import (
    ShoppingDraftPricingWrite, ShoppingListCreate, ShoppingProductPurchaseWrite, ShoppingItemUpdate,
)
from backend.tests.test_sale_normalization import product, INGREDIENT, DAY
from backend.tests.test_shopping_list_storage import db, postgres  # noqa: F401
from backend.tests.test_accounts import ALICE


def sale(retailer='maxi', price='3', size='500', identity='a', **changes):
    return normalize_sale(INGREDIENT, product(retailer=retailer, price=price, quantity=size,
        external_product_id=identity, **changes), DAY)


def body(amount=None, unit='g', **changes):
    return ShoppingDraftPricingWrite(purchase_date=DAY, items=[dict(name='Riz', ingredient_id=INGREDIENT,
        required=[] if amount is None else [dict(amount=str(amount), unit=unit)])], **changes)


def selected(quote, scenario='cheapest'):
    return next(s for s in quote.scenarios if s.scenario == scenario)


@pytest.mark.parametrize('amount,unit,size,units,total', [
    (None, 'g', '500', 1, '3.00'), ('750', 'g', '500', 2, '6.00'),
    ('500', 'g', '500', 1, '3.00'), ('500.000000000000000001', 'g', '500', 2, '6.00'),
    ('0.0001', 'g', '500', 1, '3.00'), ('1.1', 'unit', '500', 2, '6.00'),
    ('0.75', 'kg', '500', 2, '6.00'),
])
def test_direct_prices_and_ceil_without_review_or_float(amount, unit, size, units, total):
    candidate = sale(size=size)
    assert not candidate.eligible_for_calculation
    with localcontext() as context:
        context.prec = 3
        quote = pricing.build(body(amount, unit), [candidate])
    line = selected(quote).needs[0].lines[0]
    assert line.sale_units == units and line.amount == total
    assert line.pricing_method == 'direct' and not line.sale.eligible_for_calculation
    assert quote.candidates[0].unit_price == '3.00'


def test_choose_by_total_required_products_not_by_the_smallest_sticker_price():
    quote = pricing.build(body('750'), [sale(price='1', size='100', identity='small'), sale(retailer='metro', price='3', identity='large')])
    assert [s.scenario for s in quote.scenarios] == ['maxi', 'metro', 'superc', 'cheapest']
    assert selected(quote, 'maxi').known_amount == '8.00'
    assert selected(quote, 'metro').known_amount == '6.00'
    assert selected(quote).needs[0].lines[0].sale.product_id.endswith(':large')


def test_product_override_changes_cheapest_only_and_is_bound_to_ingredient():
    sales = [sale(price='2'), sale(retailer='metro', price='4', identity='other')]
    request = body('750', choices=[{'item_index': 0, 'product_id': sales[1].product_id}])
    quote = pricing.build(request, sales)
    assert selected(quote, 'maxi').known_amount == '4.00'
    assert selected(quote).known_amount == '8.00' and selected(quote).needs[0].manual
    assert selected(quote).store_totals[0].retailer == 'metro'
    with pytest.raises(ShoppingListError):
        pricing.build(body(choices=[{'item_index': 0, 'product_id': 'missing'}]), sales)


def test_formats_and_prices_missing_are_not_converted_into_zero_or_invented():
    assert not selected(pricing.build(body('750'), [sale(size=None, unit=None)])).complete
    quote = pricing.build(body(), [sale(size=None, unit=None)])
    assert selected(quote).known_amount == '3.00'
    assert not selected(pricing.build(body(), [sale(price=None)])).complete
    assert selected(pricing.build(body(), [sale(price=None)])).needs[0].amount is None
    assert not selected(pricing.build(body('750', 'ml'), [sale()])).complete


def test_duplicate_ingredients_are_grouped_before_rounding_and_promotion_limits():
    request = body('300')
    request.items.append(request.items[0])
    quote = pricing.build(request, [sale(price='8', is_promotion=True, promo_price='2',
        quantity_limit=1, price_after_limit='5', valid_from=DAY, valid_to=DAY)])
    need = selected(quote).needs[0]
    assert len(need.item_ids) == 2 and len(need.lines) == 1
    assert need.lines[0].sale_units == 2 and need.amount == '7.00'


def test_quantity_free_and_quantified_same_ingredient_add_one_whole_product():
    request = body('750')
    request.items.append(body().items[0])
    assert selected(pricing.build(request, [sale()])).needs[0].lines[0].sale_units == 3


def test_promotion_uses_the_date_of_shopping_and_known_regular_price_after_expiry():
    quote = pricing.build(body('1000'), [sale(price='4', is_promotion=True, promo_price='1',
        quantity_limit=1, price_after_limit='3', valid_from=DAY-timedelta(days=2), valid_to=DAY-timedelta(days=1))])
    assert selected(quote).known_amount == '8.00'


def creation(request, quote, **changes):
    item = request.items[0]
    return ShoppingListCreate(name='Courses', activate=True, purchase_date=request.purchase_date,
        items=[dict(name=item.name, ingredient_id=item.ingredient_id, quantity=item.required[0] if item.required else None)],
        pricing=dict(fingerprint=quote.fingerprint, scenario='cheapest', choices=request.choices, **changes))


def test_preview_writes_nothing_then_final_creation_saves_the_selected_prices_atomically(db):
    sales = [sale(), sale(retailer='metro', price='4')]
    source = lambda db, day: sales
    request = body('750', choices=[dict(item_index=0, product_id=sales[1].product_id)])
    quote = pricing.preview(db, ALICE, request, source)
    for model in (ShoppingList, ShoppingListComparison, ShoppingListCommand):
        assert db.scalar(select(func.count()).select_from(model)) == 0
    key = uuid4()
    saved = service.create_list(db, ALICE, creation(request, quote), key, source)
    assert saved.revision == 1 and saved.status == 'active'
    assert saved.totals.budget_known_amount == '8.00' and saved.totals.estimate_complete
    assert saved.assignment.scenario.needs[0].item_ids == [saved.items[0].id]
    assert not saved.assignment.stale
    assert saved.choices[0].product_id == sales[1].product_id
    assert service.create_list(db, ALICE, creation(request, quote), key,
        lambda *args: pytest.fail('Le rejeu ne recalcule pas les prix')) == saved
    assert db.scalar(select(func.count()).select_from(ShoppingListRevision)) == 1


@pytest.mark.parametrize('change', ['price', 'quantity', 'partial'])
def test_stale_or_unconfirmed_prices_roll_back_the_whole_creation(db, change):
    sales = [sale()]
    request = body('750')
    quote = pricing.preview(db, ALICE, request, lambda *args: sales)
    if change == 'price':
        source = lambda *args: [sale(price='9')]
    elif change == 'quantity':
        request = body('1500')
        source = lambda *args: sales
    else:
        source = lambda *args: []
        quote = pricing.preview(db, ALICE, request, source)
    with pytest.raises(ShoppingListError) as error:
        service.create_list(db, ALICE, creation(request, quote), uuid4(), source)
    assert error.value.code == ('COMPARISON_PARTIAL' if change == 'partial' else 'COMPARISON_STALE')
    for model in (ShoppingList, ShoppingListItem, ShoppingListAssignment, ShoppingListCommand, ShoppingListRevision):
        assert db.scalar(select(func.count()).select_from(model)) == 0


def test_manual_name_matches_catalog_exactly_but_does_not_guess_unknown_products(db):
    request = body()
    request.items[0].ingredient_id = None
    quote = pricing.preview(db, ALICE, request, lambda *args: [sale()])
    saved = service.create_list(db, ALICE, creation(request, quote), uuid4(), lambda *args: [sale()])
    assert saved.items[0].ingredient_id == INGREDIENT and saved.totals.budget_known_amount == '3.00'


@pytest.mark.parametrize('quantified', [False, True])
def test_direct_product_purchases_keep_price_coverage_and_unchecking_correct(db, quantified):
    request = body('750' if quantified else None)
    source = lambda *args: [sale()]
    quote = pricing.preview(db, ALICE, request, source)
    saved = service.create_list(db, ALICE, creation(request, quote), uuid4(), source)
    line = saved.assignment.scenario.needs[0].lines[0]
    def buy(current, units):
        return courses.set_product_purchase(db, current.id, ALICE, ShoppingProductPurchaseWrite(
            expected_revision=current.revision, comparison_id=current.assignment.comparison_id,
            item_id=current.items[0].id, product_id=line.sale.product_id, purchased_units=units), uuid4())
    bought = buy(saved, line.sale_units)
    assert bought.items[0].coverage_status == 'purchased'
    assert bought.totals.remaining_known_amount == '0.00' and not bought.assignment.stale
    assert bought.totals.budget_known_amount == saved.totals.budget_known_amount
    unchecked = buy(bought, 0)
    assert unchecked.items[0].coverage_status == 'remaining'
    assert unchecked.totals.remaining_known_amount == saved.totals.budget_known_amount

from backend.tests.test_shopping_list_calendar import database, concurrent_database, add_meal, preview as calendar_preview, creation_request, RICE  # noqa: E402, F401
from backend.tests.test_accounts import accounts, login  # noqa: E402, F401


def test_calendar_adjustments_are_priced_and_saved_without_rewriting_the_calendar(database):
    from sqlalchemy.orm import Session
    add_meal(database)
    original = calendar_preview(database)
    source = lambda db, day: [normalize_sale(RICE, product(), day)]
    request = ShoppingDraftPricingWrite(purchase_date=original.purchase_date,
        items=[{'name': original.items[0].name, 'ingredient_id': RICE, 'required': [{'amount': '750', 'unit': 'g'}]}])
    with Session(database) as db:
        quote = pricing.preview(db, ALICE, request, source)
        db.rollback()  # la création calendrier exige sa propre transaction cohérente
        saved = service.create_from_calendar(db, ALICE, creation_request(original, activate=True,
            adjusted_items=[{'item_id': original.items[0].id, 'required': [{'amount': '750', 'unit': 'g'}]}],
            pricing={'fingerprint': quote.fingerprint, 'scenario': 'cheapest'}), uuid4(), source)
        assert saved.items[0].required[0].amount == '750'
        assert saved.assignment.scenario.needs[0].lines[0].sale_units == 2
        assert saved.totals.budget_known_amount == '7.58' and not saved.assignment.stale
    assert calendar_preview(database).items[0].required[0].amount == original.items[0].required[0].amount


def test_creation_prices_http_is_private_read_only_and_final_creation_uses_server_prices(accounts, monkeypatch):
    from backend.app.shopping_lists import comparisons
    from backend.tests.test_shopping_list_http import command, ROOT
    client, app = accounts
    request = body('750').model_dump(mode='json')
    request['items'][0]['ingredient_id'] = 'ing_riz_basmati_blanc'
    source = lambda req, db, day: [normalize_sale('ing_riz_basmati_blanc', product(price='3'), day)]
    monkeypatch.setattr(comparisons, 'load_sales', source)
    assert client.post(ROOT + '/creation-prices', json=request).status_code == 401
    login(app, ALICE)
    quote = client.post(ROOT + '/creation-prices', json=request)
    assert quote.status_code == 200, quote.text
    assert client.get(ROOT).json()['total'] == 0
    assert client.post(ROOT + '/creation-prices', json={**request, 'price': '0.01'}).status_code == 422
    create = {'name': 'Courses', 'activate': True, 'purchase_date': str(DAY),
        'items': [{'name': 'Riz', 'ingredient_id': request['items'][0]['ingredient_id'], 'quantity': {'amount': '750', 'unit': 'g'}}],
        'pricing': {'fingerprint': quote.json()['item']['fingerprint'], 'scenario': 'maxi'}}
    response = command(client, body=create)
    assert response.status_code == 201, response.text
    value = response.json()['item']
    assert value['totals']['budget_known_amount'] == '6.00' and value['status'] == 'active'
    assert value['assignment']['scenario']['scenario'] == 'maxi'


@pytest.mark.parametrize('scenario,retailer', [('cheapest', 'maxi'), ('maxi', 'maxi'), ('metro', 'metro'), ('superc', 'superc')])
def test_calendar_product_list_persists_exact_scenario_choices_and_is_ready_to_shop(database, scenario, retailer):
    from sqlalchemy.orm import Session
    add_meal(database)
    original = calendar_preview(database)
    sales = [normalize_sale(RICE, product(retailer=store, price=price), original.purchase_date)
             for store, price in [('maxi', '2'), ('metro', '3'), ('superc', '4')]]
    source = lambda *_: sales
    request = ShoppingDraftPricingWrite(purchase_date=original.purchase_date,
        items=[dict(name=i.name, ingredient_id=i.ingredient_id, required=[q.model_dump() for q in i.required]) for i in original.items])
    with Session(database) as db:
        quote = pricing.preview(db, ALICE, request, source); db.rollback()
        body = creation_request(original, kind='products', activate=True,
            pricing=dict(fingerprint=quote.fingerprint, scenario=scenario))
        key = uuid4()
        saved = service.create_from_calendar(db, ALICE, body, key, source)
        assert saved.kind == 'products' and saved.status == 'active'
        assert saved.period == original.period and not saved.assignment.stale
        assert saved.assignment.scenario.scenario == scenario
        assert saved.totals.budget_known_amount == selected(quote, scenario).known_amount
        assert len(saved.choices) == len(saved.items)
        chosen = saved.choices[0].product_id
        assert saved.assignment.selected_products[chosen].retailer == retailer
        assert saved.assignment.scenario.needs[0].lines[0].sale.product_id == chosen
        assert saved.items[0].contributions and saved.product_purchases == []
        assert service.create_from_calendar(db, ALICE, body, key, lambda *_: pytest.fail('Pas de recalcul au rejeu')) == saved
        # La coche est immédiatement utilisable, sans actualisation intermédiaire.
        bought = courses.set_product_purchase(db, saved.id, ALICE, ShoppingProductPurchaseWrite(expected_revision=saved.revision,
            comparison_id=saved.assignment.comparison_id, item_id=saved.items[0].id, product_id=chosen, purchased_units=1), uuid4())
        assert bought.product_purchases[0].purchased_units == 1
    assert calendar_preview(database).preview_fingerprint == original.preview_fingerprint


def test_calendar_products_refuses_missing_product_even_if_partial_prices_are_accepted(database):
    from sqlalchemy.orm import Session
    add_meal(database)
    original = calendar_preview(database)
    request = ShoppingDraftPricingWrite(purchase_date=original.purchase_date,
        items=[dict(name=i.name, ingredient_id=i.ingredient_id, required=[q.model_dump() for q in i.required]) for i in original.items])
    quote = pricing.build(request, [])
    with Session(database) as db:
        with pytest.raises(ShoppingListError) as failure:
            service.create_from_calendar(db, ALICE, creation_request(original, kind='products', activate=True,
                pricing=dict(fingerprint=quote.fingerprint, scenario='maxi', accept_partial=True)), uuid4(), lambda *_: [])
        assert failure.value.code == 'LIST_KIND_CONFLICT'
        assert db.scalar(select(func.count()).select_from(ShoppingList)) == 0


def test_calendar_products_can_confirm_excluded_unpriced_ingredients(database):
    from sqlalchemy.orm import Session
    from sqlalchemy import insert
    from decimal import Decimal
    from backend.app.recipes.models import RecipeIngredient
    from backend.tests.test_shopping_list_calendar import RECIPE, MILK
    with database.begin() as connection:
        connection.execute(insert(RecipeIngredient).values(recipe_id=RECIPE, ingredient_id=MILK,
            position=2, quantity=Decimal('100'), unit='ml'))
    add_meal(database)
    original = calendar_preview(database)
    rice = next(i for i in original.items if i.ingredient_id == RICE)
    milk = next(i for i in original.items if i.ingredient_id == MILK)
    source = lambda *_: [normalize_sale(RICE, product(), original.purchase_date)]
    request = ShoppingDraftPricingWrite(purchase_date=original.purchase_date,
        items=[dict(name=rice.name, ingredient_id=RICE, required=[q.model_dump() for q in rice.required])])
    with Session(database) as db:
        quote = pricing.preview(db, ALICE, request, source); db.rollback()
        saved = service.create_from_calendar(db, ALICE, creation_request(original, kind='products', activate=True,
            excluded_item_ids=[milk.id], pricing=dict(fingerprint=quote.fingerprint, scenario='cheapest')), uuid4(), source)
        assert len(saved.items) == 1 and saved.items[0].ingredient_id == RICE
        assert saved.totals.estimate_complete and not saved.assignment.stale
        assert len(saved.choices) == 1
    assert len(calendar_preview(database).items) == 2


@pytest.mark.parametrize('scenario', ['cheapest', 'maxi', 'metro', 'superc'])
def test_calendar_multi_product_creation_is_fresh_regardless_of_generated_uuid_order(database, monkeypatch, scenario):
    from sqlalchemy.orm import Session
    from sqlalchemy import insert
    from decimal import Decimal
    from itertools import count
    from uuid import UUID
    from backend.app.recipes.models import RecipeIngredient
    from backend.tests.test_shopping_list_calendar import RECIPE, MILK
    with database.begin() as connection:
        connection.execute(insert(RecipeIngredient).values(recipe_id=RECIPE, ingredient_id=MILK,
            position=2, quantity=Decimal('100'), unit='ml'))
    add_meal(database)
    original = calendar_preview(database)
    # L'ordre lexical des UUID est délibérément l'inverse de l'ordre de création.
    identities = count(1_000_000, -1)
    monkeypatch.setattr(service, 'uuid4', lambda: UUID(int=next(identities)))
    sales = [normalize_sale(ingredient, product(retailer=store, price=price, unit=unit,
        external_product_id=ingredient), original.purchase_date)
        for ingredient, unit in [(RICE, 'g'), (MILK, 'ml')]
        for store, price in [('maxi', '2'), ('metro', '3'), ('superc', '4')]]
    source = lambda *_: sales
    request = ShoppingDraftPricingWrite(purchase_date=original.purchase_date,
        items=[dict(name=i.name, ingredient_id=i.ingredient_id, required=[q.model_dump() for q in i.required]) for i in original.items])
    with Session(database) as db:
        quote = pricing.preview(db, ALICE, request, source); db.rollback()
        key = uuid4()
        body = creation_request(original, kind='products', activate=True,
            pricing=dict(fingerprint=quote.fingerprint, scenario=scenario))
        saved = service.create_from_calendar(db, ALICE, body, key, source)
        assert len(saved.choices) == 2
        assert not saved.assignment.stale
        assert saved.totals.estimate_complete
        assert not any(w.code in ('COMPARISON_STALE', 'ESTIMATE_UNAVAILABLE', 'ESTIMATE_PARTIAL') for w in saved.warnings)
        assert saved.totals.budget_known_amount == selected(quote, scenario).known_amount
        reopened = service.get_list(db, saved.id, ALICE)
        assert not reopened.assignment.stale
        assert reopened.assignment.comparison_id == saved.assignment.comparison_id
        db.rollback()  # Terminer la transaction de lecture avant la reprise calendrier.
        assert service.create_from_calendar(db, ALICE, body, key,
            lambda *_: pytest.fail('Le rejeu ne recalcule pas')) == saved
        # Chaque produit est cochable immédiatement : aucun Actualiser les prix préalable.
        current = reopened
        for choice in current.choices:
            current = courses.set_product_purchase(db, current.id, ALICE, ShoppingProductPurchaseWrite(
                expected_revision=current.revision, comparison_id=current.assignment.comparison_id,
                item_id=choice.item_id, product_id=choice.product_id, purchased_units=1), uuid4())
            assert not current.assignment.stale
        assert current.totals.remaining_item_count == 0
    assert calendar_preview(database).preview_fingerprint == original.preview_fingerprint
