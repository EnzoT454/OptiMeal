"""Courses : quantités, estimations stables et historique sans prix client."""
from uuid import uuid4
import pytest
from pydantic import ValidationError
from sqlalchemy import select, text

from backend.tests.test_shopping_list_storage import db, postgres, add, create  # noqa: F401
from backend.tests.test_shopping_comparisons import prepared, simulate, apply, source
from backend.tests.test_shopping_list_purchases import sale
from backend.tests.test_accounts import ALICE, BOB
from backend.app.shopping_lists import courses, service
from backend.app.shopping_lists.schemas import (
    ShoppingProductPurchaseWrite, ShoppingItemUpdate, ShoppingPossessionWrite,
    ShoppingCommand, ShoppingCompleteWrite,
)


def buy(db, resource, units, *, key=None, body=None, user=ALICE):
    need = resource.assignment.scenario.needs[0]
    body = body or ShoppingProductPurchaseWrite(expected_revision=resource.revision,
        comparison_id=resource.assignment.comparison_id, item_id=need.item_ids[0],
        product_id=need.lines[0].sale.product_id, purchased_units=units)
    return courses.set_product_purchase(db, resource.id, user, body, key or uuid4())


def assigned(db, loader=None):
    resource = prepared(db)
    loader = loader or source(sale(500, 3, 'rice'))
    return apply(db, resource, simulate(db, resource, loader), loader=loader)


def test_partial_check_uncheck_keep_stores_budget_and_history(db):
    resource = assigned(db)
    partial = buy(db, resource, 1)
    assert partial.items[0].coverage_status == 'partial'
    assert partial.totals.budget_known_amount == '6.00'
    assert partial.totals.remaining_known_amount == '3.00'
    assert not partial.assignment.stale
    full = buy(db, partial, 2)
    assert full.items[0].coverage_status == 'purchased'
    assert full.totals.budget_known_amount == '6.00'
    assert full.totals.remaining_known_amount == '0.00'
    assert full.totals.estimate_complete
    assert full.assignment == resource.assignment
    assert service.get_revision(db, resource.id, partial.revision, ALICE).snapshot == partial
    unchecked = buy(db, full, 0)
    assert unchecked.items[0].coverage_status == 'remaining'
    assert unchecked.totals.budget_known_amount == '6.00'
    assert unchecked.totals.remaining_known_amount == '6.00'


def test_need_increase_preserves_purchase_and_exposes_complement(db):
    full = buy(db, assigned(db), 2)
    changed = service.update_item(db, full.id, full.items[0].id, ALICE,
        ShoppingItemUpdate(expected_revision=full.revision, quantity={'amount': '1500', 'unit': 'g'}), uuid4())
    assert changed.product_purchases == full.product_purchases
    assert changed.items[0].coverage_status == 'partial'
    assert changed.assignment.stale
    assert not changed.totals.estimate_complete
    assert changed.totals.budget_known_amount == '6.00'
    loader = source(sale(500, 4, 'rice'))
    saved = apply(db, changed, simulate(db, changed, loader), loader=loader)
    assert saved.product_purchases == full.product_purchases
    assert saved.totals.budget_known_amount == '10.00'
    assert saved.totals.remaining_known_amount == '4.00'
    assert saved.assignment.scenario.needs[0].lines[0].sale_units == 1
    assert buy(db, saved, 1).totals.remaining_known_amount == '0.00'


def test_old_purchase_is_uncheckable_after_new_comparison(db):
    original = buy(db, assigned(db), 1)
    loader = source(sale(500, 4, 'other'))
    saved = apply(db, original, simulate(db, original, loader), loader=loader)
    old = original.product_purchases[0]
    body = ShoppingProductPurchaseWrite(expected_revision=saved.revision, comparison_id=old.comparison_id,
        item_id=old.item_ids[0], product_id=old.line.sale.product_id, purchased_units=0)
    changed = courses.set_product_purchase(db, saved.id, ALICE, body, uuid4())
    assert changed.items[0].coverage_status == 'remaining'
    assert changed.assignment.stale  # la proposition complémentaire ne couvre plus le tout


def test_product_command_replay_and_revision_conflict(db):
    resource = assigned(db)
    line = resource.assignment.scenario.needs[0].lines[0]
    body = ShoppingProductPurchaseWrite(expected_revision=resource.revision,
        comparison_id=resource.assignment.comparison_id, item_id=resource.items[0].id,
        product_id=line.sale.product_id, purchased_units=1)
    key = uuid4()
    first = buy(db, resource, 1, body=body, key=key)
    assert buy(db, first, 1, body=body, key=key) == first
    with pytest.raises(service.ShoppingListError) as exc:
        buy(db, first, 1, body=body)
    assert exc.value.code == 'LIST_REVISION_CONFLICT'
    with pytest.raises(service.ShoppingListError) as exc:
        buy(db, resource, 1, user=BOB)
    assert exc.value.status == 404


def test_grouped_needs_do_not_duplicate_purchase_or_coverage(db):
    resource = prepared(db)
    resource = add(db, resource, ingredient_id='ing_test_riz', merge='separate', quantity={'amount': '500', 'unit': 'g'})
    loader = source(sale(500, 3, 'rice'))
    saved = apply(db, resource, simulate(db, resource, loader), loader=loader)
    bought = buy(db, saved, 3)
    assert len(bought.product_purchases) == 1
    assert bought.totals.purchased_item_count == 2
    assert sum(int(a.quantity.amount) for a in bought.product_purchases[0].allocations) == 1500
    assert bought.totals.budget_known_amount == '9.00'


def test_possession_and_product_purchase_cover_together(db):
    resource = prepared(db)
    resource = service.set_possession(db, resource.id, resource.items[0].id, ALICE,
        ShoppingPossessionWrite(expected_revision=resource.revision,
            coverage={'quantities': [{'amount': '500', 'unit': 'g'}]}), uuid4())
    loader = source(sale(500, 3, 'rice'))
    saved = apply(db, resource, simulate(db, resource, loader), loader=loader)
    bought = buy(db, saved, 1)
    assert bought.totals.purchased_item_count == 1
    assert bought.totals.owned_item_count == 0
    assert bought.totals.budget_known_amount == '3.00'


def test_promotional_limit_is_not_reset_by_recomparison(db):
    loader = source(sale(500, 12, 'limited', is_promotion=True, promo_price='7.77', quantity_limit=1,
                        price_after_limit='10', valid_from='2026-11-12', valid_to='2026-11-18'))
    partial = buy(db, assigned(db, loader), 1)
    assert partial.product_purchases[0].estimated_amount == '7.77'
    assert partial.totals.remaining_known_amount == '10.00'
    saved = apply(db, partial, simulate(db, partial, loader), loader=loader)
    assert saved.assignment.scenario.needs[0].amount == '10.00'
    assert saved.totals.budget_known_amount == '17.77'


def test_complete_requires_remaining_confirmation_and_can_reopen(db):
    resource = assigned(db)
    resource = service.change_status(db, resource.id, ALICE, 'activate', ShoppingCommand(expected_revision=resource.revision), uuid4())
    with pytest.raises(service.ShoppingListError) as exc:
        courses.complete(db, resource.id, ALICE, ShoppingCompleteWrite(expected_revision=resource.revision), uuid4())
    assert exc.value.code == 'COURSES_REMAINING'
    completed = courses.complete(db, resource.id, ALICE, ShoppingCompleteWrite(expected_revision=resource.revision, accept_remaining=True), uuid4())
    assert completed.status == 'completed'
    with pytest.raises(service.ShoppingListError):
        buy(db, completed, 1)
    reopened = service.change_status(db, completed.id, ALICE, 'reopen', ShoppingCommand(expected_revision=completed.revision), uuid4())
    assert reopened.status == 'active'


@pytest.mark.parametrize('change', [{'purchased_units': True}, {'purchased_units': -1}, {'purchased_units': 1.5}, {'purchased_units': 1000001}, {'price': '0.01'}])
def test_purchase_rejects_ambiguous_quantity_and_client_price(change):
    with pytest.raises(ValidationError):
        ShoppingProductPurchaseWrite.model_validate(dict(expected_revision=1, comparison_id=uuid4(), item_id=uuid4(),
            product_id='product', purchased_units=1) | change)


def test_courses_migration_is_private(db):
    assert db.scalar(text("SELECT relrowsecurity FROM pg_class WHERE oid='public.shopping_list_product_purchase'::regclass"))
    assert db.scalar(text("SELECT count(*) FROM pg_policies WHERE tablename='shopping_list_product_purchase'")) == 0


def test_weight_sale_steps_are_checked_and_estimated(db):
    from backend.tests.test_shopping_list_purchases import measured
    resource = prepared(db)
    resource = service.update_item(db, resource.id, resource.items[0].id, ALICE,
        ShoppingItemUpdate(expected_revision=resource.revision, quantity={'amount': '350', 'unit': 'g'}), uuid4())
    loader = source(measured())
    saved = apply(db, resource, simulate(db, resource, loader), loader=loader)
    with pytest.raises(service.ShoppingListError) as exc:
        buy(db, saved, 2)
    assert exc.value.code == 'SALE_MINIMUM'
    partial = buy(db, saved, 3)
    assert partial.product_purchases[0].purchased_quantity == '300'
    assert partial.product_purchases[0].estimated_amount == '1.14'
    assert partial.totals.remaining_known_amount == '0.38'
    assert partial.items[0].coverage_status == 'partial'


def test_comparison_includes_known_purchases_without_repricing_them(db):
    partial = buy(db, assigned(db), 1)
    loader = source(sale(500, 4, 'rice'))
    proposal = simulate(db, partial, loader).scenarios[-1]
    assert proposal.known_amount == '7.00' and proposal.purchased_known_amount == '3.00'
    assert proposal.complete
    assert sum(float(s.amount) for s in proposal.store_totals) == 7
    saved = apply(db, partial, simulate(db, partial, loader), loader=loader)
    assert saved.totals.budget_known_amount == '7.00'
    assert saved.product_purchases[0].estimated_amount == '3.00'


def test_overbuying_preserves_surplus_and_purchase_estimate(db):
    bought = buy(db, assigned(db), 3)
    assert bought.product_purchases[0].purchased_quantity == '1500'
    assert bought.totals.budget_known_amount == '9.00'
    assert bought.totals.remaining_known_amount == '0.00'
    assert bought.items[0].coverage_status == 'purchased'


def test_purchase_failure_rolls_back_state_and_history(db, monkeypatch):
    resource = assigned(db)
    monkeypatch.setattr(service, '_snapshot', lambda *args: (_ for _ in ()).throw(RuntimeError('Interruption')))
    with pytest.raises(RuntimeError):
        buy(db, resource, 1)
    assert service.get_list(db, resource.id, ALICE) == resource


from backend.tests.test_shopping_comparisons import comparison_database  # noqa: E402, F401
from backend.tests.test_recipe_rating_concurrency import concurrent_database  # noqa: E402, F401


@pytest.mark.parametrize('same_key', [False, True])
def test_concurrent_purchase_commands(comparison_database, same_key):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    from sqlalchemy.orm import Session
    engine = comparison_database
    with Session(engine) as session:
        resource = assigned(session)
    first = uuid4()
    keys = [first, first if same_key else uuid4()]
    barrier = Barrier(2)
    def run(key):
        with Session(engine) as session:
            barrier.wait(timeout=5)
            try:
                return buy(session, resource, 1, key=key)
            except service.ShoppingListError as error:
                return error.code
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(run, keys))
    if same_key:
        assert results[0] == results[1]
    else:
        assert sum(r == 'LIST_REVISION_CONFLICT' for r in results if isinstance(r, str)) == 1
    with Session(engine) as session:
        saved = service.get_list(session, resource.id, ALICE)
        assert saved.revision == resource.revision + 1
        assert len(saved.product_purchases) == 1


def test_changed_to_unquantified_need_can_be_confirmed_without_losing_product_history(db):
    from backend.app.shopping_lists.schemas import ShoppingManualPurchaseWrite
    resource = buy(db, assigned(db), 1)
    resource = service.update_item(db, resource.id, resource.items[0].id, ALICE,
        ShoppingItemUpdate(expected_revision=resource.revision, quantity=None), uuid4())
    assert resource.items[0].coverage_status == 'remaining'
    saved = service.set_manual_purchase(db, resource.id, resource.items[0].id, ALICE,
        ShoppingManualPurchaseWrite(expected_revision=resource.revision, purchased=True,
            coverage={'confirms_unquantified': True}), uuid4())
    assert saved.items[0].coverage_status == 'purchased'
    assert saved.product_purchases == resource.product_purchases
    assert not saved.totals.estimate_complete


def test_unchanged_purchase_target_preserves_allocations_after_need_changes(db):
    resource = prepared(db)
    resource = add(db, resource, ingredient_id='ing_test_riz', merge='separate', quantity={'amount': '500', 'unit': 'g'})
    loader = source(sale(500, 3, 'rice'))
    saved = apply(db, resource, simulate(db, resource, loader), loader=loader)
    saved = buy(db, saved, 3)
    changed = service.update_item(db, saved.id, saved.items[0].id, ALICE,
        ShoppingItemUpdate(expected_revision=saved.revision, quantity={'amount': '2000', 'unit': 'g'}), uuid4())
    assert buy(db, changed, 3).product_purchases == saved.product_purchases


def test_unpriced_checkbox_keeps_other_product_stores_and_budget(db):
    from backend.app.shopping_lists.schemas import ShoppingManualPurchaseWrite
    resource = add(db, prepared(db), name='Papier cuisson')
    loader = source(sale(500, 3, 'rice'))
    saved = apply(db, resource, simulate(db, resource, loader), partial=True, loader=loader)
    paper = saved.items[-1]
    checked = service.set_manual_purchase(db, saved.id, paper.id, ALICE,
        ShoppingManualPurchaseWrite(expected_revision=saved.revision, purchased=True,
            coverage={'confirms_unquantified': True}), uuid4())
    assert not checked.assignment.stale
    assert checked.assignment == saved.assignment
    assert checked.totals.budget_known_amount == saved.totals.budget_known_amount == '6.00'
    assert checked.totals.purchased_item_count == 1
    assert not checked.totals.estimate_complete


def test_legacy_purchased_scenario_remains_readable_without_retroactive_price():
    from backend.app.shopping_lists.schemas import ShoppingScenario
    scenario = ShoppingScenario.model_validate({'scenario': 'cheapest', 'needs': [{
        'item_ids': [uuid4()], 'name': 'Riz', 'ingredient_id': None, 'unit': None,
        'remaining': None, 'status': 'purchased', 'manual': False, 'lines': [], 'amount': None, 'warnings': [],
    }], 'known_amount': '0.00', 'complete': False, 'store_totals': [], 'store_count': 0})
    assert not ShoppingScenario.model_validate(scenario.model_dump()).complete


def test_legacy_assignment_gains_stable_checks_without_rewriting_history(db):
    from backend.app.shopping_lists.models import ShoppingListAssignment
    from sqlalchemy import update
    resource = assigned(db)
    old = resource.assignment.model_dump(mode='json', exclude={'planning_fingerprint'})
    db.execute(update(ShoppingListAssignment).where(ShoppingListAssignment.list_id == resource.id).values(data=old))
    db.commit()
    partial = buy(db, resource, 1)
    assert not partial.assignment.stale
    assert partial.totals.budget_known_amount == '6.00'
    assert partial.totals.remaining_known_amount == '3.00'
    assert service.get_revision(db, resource.id, resource.revision, ALICE).snapshot == resource
