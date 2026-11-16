"""Comparaison sans mutation, choix conservés, application et historique privés."""
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from sqlalchemy import func, select, text, update

from backend.app.shopping_lists import comparisons, service
from backend.app.shopping_lists.models import ShoppingListComparison, ShoppingListRevision
from backend.app.shopping_lists.schemas import (
    ShoppingApplyComparison, ShoppingChoiceWrite, ShoppingItemUpdate, ShoppingListUpdate,
)
from backend.tests.test_shopping_list_storage import db, create, add, postgres  # noqa: F401
from backend.tests.test_accounts import ALICE, BOB
from backend.tests.test_shopping_list_purchases import sale, DAY


def prepared(db):
    resource = create(db)
    resource = service.update_list(db, resource.id, ALICE,
        ShoppingListUpdate(expected_revision=resource.revision, purchase_date=DAY), uuid4())
    return add(db, resource, ingredient_id='ing_test_riz', quantity={'amount': '1000', 'unit': 'g'})


def source(*sales):
    return lambda db, day: list(sales or [sale(600, 4, 'a'), sale(400, 3, 'b')])


def simulate(db, resource, loader=None):
    return comparisons.compare(db, resource.id, ALICE, loader or source())


def apply(db, resource, comparison, scenario='cheapest', key=None, partial=False, loader=None):
    return comparisons.apply(db, resource.id, ALICE, ShoppingApplyComparison(
        expected_revision=resource.revision, comparison_id=comparison.id,
        scenario=scenario, accept_partial=partial), key or uuid4(), loader or source())


def test_comparison_does_not_change_list_or_revision(db):
    resource = prepared(db)
    comparison = simulate(db, resource)
    assert len(comparison.scenarios) == 4
    assert service.get_list(db, resource.id, ALICE) == resource
    assert db.scalar(select(func.count()).select_from(ShoppingListRevision)) == resource.revision
    cheapest = comparison.scenarios[-1]
    assert cheapest.known_amount == '7.00' and cheapest.complete
    assert cheapest.store_count == 1 and cheapest.needs[0].lines[0].sale_units == 1
    assert comparison.scenarios[1].known_amount == '0.00' and not comparison.scenarios[1].complete


def test_apply_is_atomic_replayable_and_history_keeps_estimate(db):
    resource = prepared(db)
    comparison = simulate(db, resource)
    key = uuid4()
    saved = apply(db, resource, comparison, key=key)
    assert saved.revision == resource.revision + 1
    assert saved.totals.budget_known_amount == '7.00'
    assert saved.totals.estimate_complete and saved.totals.uncovered_item_count == 0
    assert saved.assignment.scenario.scenario == 'cheapest'
    assert apply(db, resource, comparison, key=key, loader=lambda *args: pytest.fail('Rejeu avant sources')) == saved
    assert service.get_list(db, resource.id, ALICE) == saved
    assert service.get_revision(db, resource.id, resource.revision, ALICE).snapshot == resource
    renamed = service.update_list(db, resource.id, ALICE,
        ShoppingListUpdate(expected_revision=saved.revision, name='Dimanche'), uuid4())
    assert renamed.assignment == saved.assignment and renamed.totals.budget_known_amount == '7.00'


def test_changed_quantity_keeps_old_assignment_visible_but_stale(db):
    resource = prepared(db)
    saved = apply(db, resource, simulate(db, resource))
    changed = service.update_item(db, resource.id, resource.items[0].id, ALICE,
        ShoppingItemUpdate(expected_revision=saved.revision, quantity={'amount': '2', 'unit': 'kg'}), uuid4())
    assert changed.assignment.stale
    assert changed.assignment.scenario.known_amount == '7.00'
    assert not changed.totals.estimate_complete
    assert service.get_revision(db, resource.id, saved.revision, ALICE).snapshot == saved


@pytest.mark.parametrize('change', ['price', 'proof', 'expiry', 'list'])
def test_stale_proposal_is_refused_without_partial_write(db, change):
    resource = prepared(db)
    comparison = simulate(db, resource)
    loader = source()
    if change == 'price':
        loader = source(sale(600, 5, 'a'), sale(400, 3, 'b'))
    elif change == 'proof':
        changed = sale(600, 4, 'a')
        changed = changed.model_copy(update={'review': changed.review.model_copy(update={'reference': 'new evidence'})})
        loader = source(changed, sale(400, 3, 'b'))
    elif change == 'list':
        resource = add(db, resource, name='Sel')
    else:
        # Un instantané expiré peut être construit à la création ; la table
        # demeure immuable ensuite, y compris pour les comparaisons.
        expired = comparison.model_copy(update={'expires_at': datetime.now(timezone.utc) - timedelta(seconds=1)})
        with db.begin_nested():
            db.execute(text('ALTER TABLE public.shopping_list_comparison DISABLE TRIGGER shopping_list_comparison_immutable'))
            db.execute(update(ShoppingListComparison).where(ShoppingListComparison.id == comparison.id)
                       .values(data=expired.model_dump(mode='json')))
            db.execute(text('ALTER TABLE public.shopping_list_comparison ENABLE TRIGGER shopping_list_comparison_immutable'))
    with pytest.raises(service.ShoppingListError) as exc:
        apply(db, resource, comparison, loader=loader)
    assert exc.value.code == 'COMPARISON_STALE'
    assert service.get_list(db, resource.id, ALICE) == resource


def test_foreign_comparison_and_list_are_hidden(db):
    resource = prepared(db)
    comparison = simulate(db, resource)
    with pytest.raises(service.ShoppingListError) as exc:
        comparisons.compare(db, resource.id, BOB, source())
    assert exc.value.status == 404
    other = create(db)
    with pytest.raises(service.ShoppingListError) as exc:
        apply(db, other, comparison)
    assert exc.value.status == 404


def test_partial_requires_explicit_confirmation_and_remains_subtotal(db):
    resource = add(db, prepared(db), name='Article libre')
    comparison = simulate(db, resource)
    with pytest.raises(service.ShoppingListError) as exc:
        apply(db, resource, comparison)
    assert exc.value.code == 'COMPARISON_PARTIAL'
    saved = apply(db, resource, comparison, partial=True)
    assert saved.totals.budget_known_amount == '7.00'
    assert saved.totals.unpriced_item_count == 1 and not saved.totals.estimate_complete
    assert saved.totals.uncovered_item_count == 1


def test_manual_store_choice_is_kept_in_every_scenario_and_can_be_cleared(db):
    resource = prepared(db)
    loader = source(sale(1000, 9, 'manual', retailer='metro', store='2'), sale(1000, 1, 'auto'))
    chosen = comparisons.choose(db, resource.id, resource.items[0].id, ALICE,
        ShoppingChoiceWrite(expected_revision=resource.revision, product_id='metro:2:manual'), uuid4(), loader)
    comparison = simulate(db, chosen, loader)
    for scenario in comparison.scenarios:
        assert scenario.known_amount == '9.00' and scenario.needs[0].manual
        assert scenario.needs[0].lines[0].sale.raw_source.retailer == 'metro'
    assert 'MANUAL_CHOICE_OUTSIDE_SCENARIO' in comparison.scenarios[0].needs[0].warnings
    cleared = comparisons.choose(db, resource.id, resource.items[0].id, ALICE,
        ShoppingChoiceWrite(expected_revision=chosen.revision, product_id=None), uuid4(), loader)
    assert not cleared.choices
    assert simulate(db, cleared, loader).scenarios[-1].known_amount == '1.00'


def test_disappeared_manual_product_is_not_replaced_silently(db):
    resource = prepared(db)
    chosen = comparisons.choose(db, resource.id, resource.items[0].id, ALICE,
        ShoppingChoiceWrite(expected_revision=resource.revision, product_id='maxi:8661:a'), uuid4(), source())
    comparison = simulate(db, chosen, source(sale(1000, 1, 'other')))
    assert all(s.needs[0].status == 'manual_unavailable' and not s.needs[0].lines for s in comparison.scenarios)
    assert service.get_list(db, resource.id, ALICE).choices == chosen.choices


def test_separate_canonical_rows_share_one_product_limit(db):
    resource = prepared(db)
    resource = add(db, resource, ingredient_id='ing_test_riz', merge='separate', quantity={'amount': '1500', 'unit': 'g'})
    loader = source(sale(500, 12, 'limited', is_promotion=True, promo_price='7.77', quantity_limit=4,
                         price_after_limit='10', valid_from='2026-11-12', valid_to='2026-11-18'))
    comparison = simulate(db, resource, loader)
    assert comparison.scenarios[-1].known_amount == '41.08'
    assert len(comparison.scenarios[-1].needs[0].item_ids) == 2


def test_choosing_foreign_item_or_unmatched_product_fails(db):
    resource = prepared(db)
    other = add(db, create(db), name='Autre')
    for item_id, product_id, expected in [(other.items[0].id, 'maxi:8661:a', 404),
                                         (resource.items[0].id, 'missing', 422)]:
        with pytest.raises(service.ShoppingListError) as exc:
            comparisons.choose(db, resource.id, item_id, ALICE,
                ShoppingChoiceWrite(expected_revision=resource.revision, product_id=product_id), uuid4(), source())
        assert exc.value.status == expected


def test_manual_purchases_are_preserved_and_cannot_make_total_complete(db):
    from backend.app.shopping_lists.schemas import ShoppingManualPurchaseWrite
    resource = prepared(db)
    resource = service.set_manual_purchase(db, resource.id, resource.items[0].id, ALICE,
        ShoppingManualPurchaseWrite(expected_revision=resource.revision, purchased=True,
            coverage={'quantities': [{'amount': '500', 'unit': 'g'}]}), uuid4())
    comparison = simulate(db, resource, source(sale()))
    assert not comparison.scenarios[-1].complete
    saved = apply(db, resource, comparison, partial=True, loader=source(sale()))
    assert saved.purchases == resource.purchases
    assert saved.totals.budget_known_amount == '3.00'
    assert saved.totals.unpriced_item_count == 1 and not saved.totals.estimate_complete


def test_failed_snapshot_rolls_back_assignment_and_revision(db, monkeypatch):
    from backend.app.shopping_lists.models import ShoppingListAssignment
    resource = prepared(db)
    comparison = simulate(db, resource)
    def fail(*args, **kwargs):
        raise RuntimeError('Interruption avant sauvegarde de révision')
    monkeypatch.setattr(service, '_snapshot', fail)
    with pytest.raises(RuntimeError):
        apply(db, resource, comparison)
    assert service.get_list(db, resource.id, ALICE) == resource
    assert db.scalar(select(func.count()).select_from(ShoppingListAssignment)) == 0


def test_new_tables_are_private_and_comparisons_immutable(db):
    from sqlalchemy.exc import IntegrityError
    for table in ('shopping_list_comparison', 'shopping_list_choice', 'shopping_list_assignment'):
        assert db.scalar(text('SELECT relrowsecurity FROM pg_class WHERE oid=CAST(:name AS regclass)'), {'name': 'public.' + table})
        assert db.scalar(text('SELECT count(*) FROM pg_policies WHERE tablename=:name'), {'name': table}) == 0
    comparison = simulate(db, prepared(db))
    with pytest.raises(IntegrityError), db.begin_nested():
        db.execute(update(ShoppingListComparison).where(ShoppingListComparison.id == comparison.id).values(data={}))


def test_unknown_real_catalog_is_never_promoted_by_comparison(db):
    from backend.app.catalog.common_schemas import CommonCatalog
    from backend.app.catalog.sales import normalize_catalog
    from backend.app.common.public_data import DEFAULT_CATALOG
    catalog = CommonCatalog.model_validate_json(DEFAULT_CATALOG.read_text())
    sales = normalize_catalog(catalog, DAY).items
    resource = prepared(db)
    scenarios = comparisons.build_scenarios(resource, sales)
    assert all(not s.complete and s.known_amount == '0.00' and not s.needs[0].lines for s in scenarios)


from backend.tests.test_recipe_rating_concurrency import concurrent_database  # noqa: E402, F401


@pytest.fixture
def comparison_database(concurrent_database):
    from backend.app.catalog.models import Ingredient
    from sqlalchemy import insert, delete
    with concurrent_database.begin() as connection:
        connection.execute(insert(Ingredient).values(id='ing_test_riz', name='Riz', category='Test', aliases=[]))
    yield concurrent_database
    with concurrent_database.begin() as connection:
        connection.execute(delete(Ingredient).where(Ingredient.id == 'ing_test_riz'))


@pytest.mark.parametrize('same_key', [False, True])
def test_concurrent_applications_preserve_one_revision(comparison_database, same_key):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    from sqlalchemy.orm import Session
    engine = comparison_database
    with Session(engine) as session:
        resource = prepared(session)
        comparison = simulate(session, resource)
    barrier = Barrier(2)
    first_key = uuid4()
    keys = [first_key, first_key if same_key else uuid4()]
    def run(key):
        with Session(engine) as session:
            barrier.wait(timeout=5)
            try:
                return apply(session, resource, comparison, key=key)
            except service.ShoppingListError as error:
                return error.code
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(run, keys))
    if same_key:
        assert results[0] == results[1]
    else:
        assert sum(value == 'LIST_REVISION_CONFLICT' for value in results if isinstance(value, str)) == 1
    with Session(engine) as session:
        saved = service.get_list(session, resource.id, ALICE)
        assert saved.revision == resource.revision + 1
        assert saved.totals.budget_known_amount == '7.00'


def test_unquantified_purchase_cannot_reset_a_promotion_after_need_changes(db):
    from backend.app.shopping_lists.schemas import ShoppingManualPurchaseWrite
    resource = add(db, create(db), ingredient_id='ing_test_riz')
    resource = service.set_manual_purchase(db, resource.id, resource.items[0].id, ALICE,
        ShoppingManualPurchaseWrite(expected_revision=resource.revision, purchased=True,
            coverage={'confirms_unquantified': True}), uuid4())
    resource = service.update_item(db, resource.id, resource.items[0].id, ALICE,
        ShoppingItemUpdate(expected_revision=resource.revision, quantity={'amount': '1000', 'unit': 'g'}), uuid4())
    resource = service.update_list(db, resource.id, ALICE,
        ShoppingListUpdate(expected_revision=resource.revision, purchase_date=DAY), uuid4())
    loader = source(sale(500, 12, 'limited', is_promotion=True, promo_price='7.77', quantity_limit=4,
                         price_after_limit='10', valid_from='2026-11-12', valid_to='2026-11-18'))
    proposal = simulate(db, resource, loader).scenarios[-1]
    assert not proposal.complete and not proposal.needs[0].lines
    assert 'PROMOTION_USAGE_UNKNOWN' in proposal.needs[0].warnings
