"""Contraintes et services de listes sur PostgreSQL local jetable uniquement."""
from decimal import Decimal
from datetime import date, timedelta
from uuid import uuid4

from alembic import command
import pytest
from sqlalchemy import delete, func, inspect, insert, select, text, update
from sqlalchemy.exc import IntegrityError, DBAPIError
from sqlalchemy.orm import Session

from backend.app.accounts.models import Profile
from backend.app.catalog.models import Ingredient
from backend.app.shopping_lists import service
from backend.app.shopping_lists.models import (
    ShoppingList, ShoppingListCommand, ShoppingListContribution, ShoppingListItem,
    ShoppingListPurchase, ShoppingListPurchaseQuantity, ShoppingListQuantity, ShoppingListRevision,
)
from backend.app.shopping_lists.schemas import (
    ShoppingCommand, ShoppingItemAdd, ShoppingItemUpdate, ShoppingListCreate,
    ShoppingListUpdate, ShoppingManualPurchaseWrite, ShoppingPossessionWrite,
)
from backend.tests.test_accounts import ALICE, BOB
from backend.tests.test_ingredient_import import postgres, alembic_config  # noqa: F401

TABLES = (ShoppingList, ShoppingListItem, ShoppingListQuantity, ShoppingListContribution,
          ShoppingListPurchase, ShoppingListPurchaseQuantity, ShoppingListRevision, ShoppingListCommand)


@pytest.fixture
def db(postgres):
    for user in (ALICE, BOB):
        postgres.execute(text('INSERT INTO auth.users(id) VALUES (:id)'), {'id': user.id})
    postgres.execute(insert(Ingredient).values(id='ing_test_riz', name='Riz', category='Épicerie', aliases=[]))
    with Session(bind=postgres, join_transaction_mode='create_savepoint') as value:
        yield value


def create(db, user=ALICE, key=None):
    return service.create_list(db, user, ShoppingListCreate(name='Courses'), key or uuid4())


def add(db, resource, *, quantity=None, ingredient_id=None, name='Riz', merge='add'):
    return service.add_item(db, resource.id, ALICE, ShoppingItemAdd(
        expected_revision=resource.revision, name=name, ingredient_id=ingredient_id,
        quantity=quantity, merge=merge), uuid4())


def test_migration_matches_metadata_and_all_private_tables_have_rls(db):
    connection = db.connection()
    command.check(alembic_config(connection))
    for model in TABLES:
        assert model.__tablename__ in inspect(connection).get_table_names(schema='public')
        assert connection.scalar(text('SELECT relrowsecurity FROM pg_class WHERE oid=CAST(:name AS regclass)'),
                                 {'name': 'public.' + model.__tablename__})
        assert connection.scalar(text('SELECT count(*) FROM pg_policies WHERE schemaname=\'public\' AND tablename=:name'),
                                 {'name': model.__tablename__}) == 0


def test_create_replay_keeps_exact_result_but_only_current_state_is_stored(db):
    key = uuid4()
    original = create(db, key=key)
    assert original.revision == 1 and original.status == 'draft'
    changed = service.update_list(db, original.id, ALICE, ShoppingListUpdate(expected_revision=1, name='Dimanche'), uuid4())
    replay = create(db, key=key)
    assert replay == original and service.get_list(db, original.id, ALICE) == changed
    assert db.scalar(select(func.count()).select_from(ShoppingList)) == 1
    assert db.scalar(select(func.count()).select_from(ShoppingListRevision)) == 1


def test_reused_key_with_other_body_conflicts_without_new_list(db):
    key = uuid4()
    create(db, key=key)
    with pytest.raises(service.ShoppingListError) as exc:
        service.create_list(db, ALICE, ShoppingListCreate(name='Autre'), key)
    assert exc.value.code == 'IDEMPOTENCY_KEY_REUSED'
    assert db.scalar(select(func.count()).select_from(ShoppingList)) == 1


def test_creation_retry_keeps_resolved_date_and_utc_timestamps(db, monkeypatch):
    key = uuid4()
    monkeypatch.setattr(service, 'today', lambda: date(2026, 11, 14))
    original = create(db, key=key)
    monkeypatch.setattr(service, 'today', lambda: date(2026, 11, 15))
    assert create(db, key=key).purchase_date == date(2026, 11, 14)
    assert original.created_at.utcoffset() == timedelta(0)
    assert service.get_list(db, original.id, ALICE).updated_at.utcoffset() == timedelta(0)


def test_list_filters_pagination_and_independent_list_ids(db):
    first, second = create(db), create(db)
    service.change_status(db, first.id, ALICE, 'activate', ShoppingCommand(expected_revision=1), uuid4())
    rows, total = service.list_lists(db, ALICE, status='draft', limit=1)
    assert total == 1 and [row.id for row in rows] == [second.id]
    rows, total = service.list_lists(db, ALICE, limit=1, offset=1)
    assert total == 2 and len(rows) == 1


def test_same_key_is_scoped_by_account_and_reads_are_private(db):
    key = uuid4()
    a, b = create(db, ALICE, key), create(db, BOB, key)
    assert a.id != b.id
    for call in [lambda: service.get_list(db, a.id, BOB),
                 lambda: service.update_list(db, a.id, BOB, ShoppingListUpdate(expected_revision=1, name='Vol'), uuid4())]:
        with pytest.raises(service.ShoppingListError) as exc:
            call()
        assert exc.value.status == 404
    rows, count = service.list_lists(db, ALICE)
    assert count == 1 and [row.id for row in rows] == [a.id]


def test_revision_conflict_is_structured_and_does_not_consume_key(db):
    resource = create(db)
    resource = add(db, resource)
    key = uuid4()
    with pytest.raises(service.ShoppingListError) as exc:
        service.update_list(db, resource.id, ALICE, ShoppingListUpdate(expected_revision=1, name='Modifié'), key)
    assert exc.value.error.current_revision == 2 and exc.value.error.expected_revision == 1
    changed = service.update_list(db, resource.id, ALICE, ShoppingListUpdate(expected_revision=2, name='Modifié'), key)
    assert changed.revision == 3


def test_manual_quantities_merge_and_mixed_coverage_are_exact(db):
    resource = add(db, create(db), quantity={'amount': '1.5', 'unit': 'kg'}, ingredient_id='ing_test_riz')
    resource = add(db, resource, quantity={'amount': '500', 'unit': 'g'}, ingredient_id='ing_test_riz')
    assert len(resource.items) == 1
    item = resource.items[0]
    assert Decimal(item.required[0].amount) == 2000 and len(item.contributions) == 2
    resource = service.set_possession(db, resource.id, item.id, ALICE, ShoppingPossessionWrite(
        expected_revision=resource.revision, coverage={'quantities': [{'amount': '500', 'unit': 'g'}]}), uuid4())
    assert resource.totals.partial_item_count == 1
    key = uuid4()
    body = ShoppingManualPurchaseWrite(expected_revision=resource.revision, purchased=True,
                                       coverage={'quantities': [{'amount': '1500', 'unit': 'g'}]})
    resource = service.set_manual_purchase(db, resource.id, item.id, ALICE, body, key)
    assert resource.totals.purchased_item_count == 1 and resource.totals.owned_item_count == 0
    assert resource.totals.remaining_item_count == 0 and not resource.totals.estimate_complete
    assert service.set_manual_purchase(db, resource.id, item.id, ALICE, body, key) == resource
    resource = service.update_item(db, resource.id, item.id, ALICE, ShoppingItemUpdate(
        expected_revision=resource.revision, quantity={'amount': '3', 'unit': 'kg'}), uuid4())
    assert resource.items[0].coverage_status == 'partial' and resource.totals.remaining_item_count == 1
    assert len(resource.items[0].contributions) == 2


def test_unquantified_purchase_stays_old_after_new_quantity_and_can_be_unchecked(db):
    resource = add(db, create(db), name='Papier cuisson')
    item_id = resource.items[0].id
    resource = service.set_manual_purchase(db, resource.id, item_id, ALICE, ShoppingManualPurchaseWrite(
        expected_revision=resource.revision, purchased=True, coverage={'confirms_unquantified': True}), uuid4())
    assert resource.items[0].coverage_status == 'purchased'
    resource = service.update_item(db, resource.id, item_id, ALICE, ShoppingItemUpdate(
        expected_revision=resource.revision, quantity={'amount': '2', 'unit': 'unit'}), uuid4())
    assert resource.items[0].coverage_status == 'remaining'
    assert resource.items[0].pricing_status == 'needs_review'
    assert resource.purchases[0].confirmed_need_revision == 1
    resource = service.set_manual_purchase(db, resource.id, item_id, ALICE, ShoppingManualPurchaseWrite(
        expected_revision=resource.revision, purchased=False, coverage={}), uuid4())
    assert resource.purchases[0].confirmed_need_revision is None


def test_incompatible_dimensions_stay_separate_in_one_canonical_item(db):
    resource = add(db, create(db), ingredient_id='ing_test_riz', quantity={'amount': '10', 'unit': 'g'})
    resource = add(db, resource, ingredient_id='ing_test_riz', quantity={'amount': '1', 'unit': 'cup'})
    assert len(resource.items) == 1
    assert {q.unit: Decimal(q.amount) for q in resource.items[0].required} == {'g': Decimal(10), 'ml': Decimal(250)}
    assert resource.items[0].pricing_status == 'needs_review'
    assert any(w.code == 'INCOMPATIBLE_UNITS' for w in resource.warnings)


def test_normalization_keeps_more_than_default_decimal_precision(db):
    amount = '1000000000000000000000000000.000001'
    resource = add(db, create(db), quantity={'amount': amount, 'unit': 'kg'})
    assert Decimal(resource.items[0].required[0].amount) == Decimal('1000000000000000000000000000000.001')


def test_possession_alone_wins_and_free_articles_do_not_merge_by_name(db):
    resource = add(db, create(db))
    resource = add(db, resource)
    assert len(resource.items) == 2
    item_id = resource.items[0].id
    resource = service.set_possession(db, resource.id, item_id, ALICE, ShoppingPossessionWrite(
        expected_revision=resource.revision, coverage={'confirms_unquantified': True}), uuid4())
    assert resource.totals.owned_item_count == 1 and resource.totals.remaining_item_count == 1
    resource = service.update_item(db, resource.id, item_id, ALICE, ShoppingItemUpdate(
        expected_revision=resource.revision, removed=True), uuid4())
    assert resource.totals.item_count == 1
    resource = service.update_item(db, resource.id, item_id, ALICE, ShoppingItemUpdate(
        expected_revision=resource.revision, removed=False), uuid4())
    assert resource.totals.item_count == 2 and resource.totals.owned_item_count == 1


def test_cross_list_items_and_incompatible_coverage_are_rejected(db):
    first = add(db, create(db), quantity={'amount': '10', 'unit': 'g'})
    second = create(db)
    with pytest.raises(service.ShoppingListError) as exc:
        service.update_item(db, second.id, first.items[0].id, ALICE,
                            ShoppingItemUpdate(expected_revision=second.revision, removed=True), uuid4())
    assert exc.value.status == 404
    for coverage in [{'quantities': [{'amount': '1', 'unit': 'ml'}]}, {'confirms_unquantified': True}]:
        with pytest.raises(service.ShoppingListError) as exc:
            service.set_possession(db, first.id, first.items[0].id, ALICE,
                ShoppingPossessionWrite(expected_revision=first.revision, coverage=coverage), uuid4())
        assert exc.value.code == 'COVERAGE_INCOMPATIBLE'


def test_status_transitions_preserve_items_and_history(db):
    resource = add(db, create(db))
    for operation in ['activate', 'archive']:
        resource = service.change_status(db, resource.id, ALICE, operation,
                                         ShoppingCommand(expected_revision=resource.revision), uuid4())
    archived = resource
    with pytest.raises(service.ShoppingListError) as exc:
        add(db, resource)
    assert exc.value.code == 'LIST_STATE_CONFLICT'
    resource = service.change_status(db, resource.id, ALICE, 'reopen',
                                     ShoppingCommand(expected_revision=resource.revision), uuid4())
    assert resource.status == 'active' and len(resource.items) == 1
    assert service.get_list(db, resource.id, ALICE).status == 'active'


@pytest.mark.parametrize('failure_phase', ['snapshot', 'revision'])
def test_failure_after_mutation_rolls_back_state_revision_and_command(db, monkeypatch, failure_phase):
    resource = create(db)
    key = uuid4()
    def broken(*args):
        raise RuntimeError('échec après mutation')
    with monkeypatch.context() as patch:
        if failure_phase == 'snapshot':
            patch.setattr(service, '_snapshot', broken)
        else:
            original_execute = db.execute
            def execute(statement, *args, **kwargs):
                if getattr(statement, 'is_insert', False) and statement.table.name == 'shopping_list_revision':
                    raise RuntimeError('échec après insertion de la commande')
                return original_execute(statement, *args, **kwargs)
            patch.setattr(db, 'execute', execute)
        with pytest.raises(RuntimeError):
            service.add_item(db, resource.id, ALICE, ShoppingItemAdd(expected_revision=1, name='Essai'), key)
    assert service.get_list(db, resource.id, ALICE) == resource
    assert db.scalar(select(func.count()).select_from(ShoppingListItem)) == 0
    assert db.scalar(select(func.count()).select_from(ShoppingListCommand)) == 1


def test_deletion_pending_blocks_new_and_replayed_commands(db):
    key = uuid4()
    create(db, key=key)
    db.execute(update(Profile).where(Profile.id == ALICE.id).values(deletion_pending=True))
    db.commit()
    with pytest.raises(service.ShoppingListError) as exc:
        create(db, key=key)
    assert exc.value.code == 'ACCOUNT_DELETION_PENDING'


def test_account_deletion_cascades_all_private_data(db):
    resource = add(db, create(db), quantity={'amount': '250', 'unit': 'g'})
    resource = service.set_manual_purchase(db, resource.id, resource.items[0].id, ALICE,
        ShoppingManualPurchaseWrite(expected_revision=resource.revision, purchased=True,
            coverage={'quantities': [{'amount': '250', 'unit': 'g'}]}), uuid4())
    other = create(db, BOB)
    db.execute(text('DELETE FROM auth.users WHERE id=:id'), {'id': ALICE.id})
    db.commit()
    assert service.get_list(db, other.id, BOB).id == other.id
    assert db.scalar(select(func.count()).select_from(ShoppingListItem)) == 0
    assert db.scalar(select(func.count()).select_from(ShoppingListCommand)) == 1
    assert db.scalar(select(func.count()).select_from(ShoppingListRevision)) == 1


@pytest.mark.parametrize('amount', ['0', '-1', 'NaN', 'Infinity', '-Infinity'])
def test_database_rejects_nonpositive_or_nonfinite_quantities(db, amount):
    resource = add(db, create(db))
    with pytest.raises(IntegrityError), db.begin_nested():
        db.execute(insert(ShoppingListQuantity).values(item_id=resource.items[0].id,
            kind='required', unit='g', amount=Decimal(amount)))


def test_database_rejects_cross_list_purchase_and_cross_owner_ledger(db):
    resource = add(db, create(db))
    other = create(db, BOB)
    with pytest.raises(IntegrityError), db.begin_nested():
        db.execute(insert(ShoppingListPurchase).values(id=uuid4(), list_id=other.id,
            item_id=resource.items[0].id, purchased=False))
    with pytest.raises(IntegrityError), db.begin_nested():
        db.execute(insert(ShoppingListCommand).values(owner_id=BOB.id, idempotency_key=uuid4(),
            list_id=resource.id, signature='a' * 64, result=resource.model_dump(mode='json')))


def test_history_is_immutable_and_nonempty_downgrade_refused(db):
    resource = create(db)
    for model in (ShoppingListRevision, ShoppingListCommand):
        with pytest.raises(IntegrityError), db.begin_nested():
            column = model.snapshot if model == ShoppingListRevision else model.result
            db.execute(update(model).values({column: resource.model_dump(mode='json')}))
    with pytest.raises(DBAPIError), db.begin_nested():
        command.downgrade(alembic_config(db.connection()), '0016_offer_quantity_limits')


def test_empty_downgrade_then_upgrade_preserves_existing_tables(db):
    connection = db.connection()
    command.downgrade(alembic_config(connection), '0016_offer_quantity_limits')
    assert 'shopping_list' not in inspect(connection).get_table_names(schema='public')
    assert 'ingredient' in inspect(connection).get_table_names(schema='public')
    command.upgrade(alembic_config(connection), 'head')
    command.check(alembic_config(connection))


def test_complete_creation_is_one_atomic_active_list_with_normalized_initial_items(db):
    body = ShoppingListCreate(name='Barbecue', activate=True, purchase_date='2026-11-21', items=[
        {'name': 'Riz', 'ingredient_id': 'ing_test_riz', 'quantity': {'amount': '2', 'unit': 'kg'}},
        {'name': 'Serviettes'},
    ])
    key = uuid4()
    result = service.create_list(db, ALICE, body, key)
    assert result.status == 'active' and result.revision == 1
    assert [item.name for item in result.items] == ['Riz', 'Serviettes']
    assert result.items[0].required[0].amount == '2000'
    assert result.items[0].required[0].unit == 'g'
    assert result.items[0].category == 'Épicerie'
    assert result.items[0].contributions[0].source == 'manual'
    assert not result.items[1].required
    assert service.create_list(db, ALICE, body, key) == result
    assert db.scalar(select(func.count()).select_from(ShoppingListCommand)) == 1
    assert db.scalar(select(func.count()).select_from(ShoppingListRevision)) == 1


def test_complete_creation_refuses_empty_lists_without_persisting_anything(db):
    with pytest.raises(service.ShoppingListError) as failure:
        service.create_list(db, ALICE, ShoppingListCreate(name='Vide', activate=True), uuid4())
    assert failure.value.code == 'EMPTY_LIST'
    assert db.scalar(select(func.count()).select_from(ShoppingList)) == 0
    assert db.scalar(select(func.count()).select_from(ShoppingListCommand)) == 0


def test_invalid_initial_ingredient_rolls_back_the_entire_list_and_all_previous_items(db):
    key = uuid4()
    with pytest.raises(service.ShoppingListError) as failure:
        service.create_list(db, ALICE, ShoppingListCreate(name='Fête', activate=True, items=[
            {'name': 'Pain'}, {'name': 'Absent', 'ingredient_id': 'ing_absent'},
        ]), key)
    assert failure.value.code == 'INGREDIENT_NOT_FOUND'
    for model in (ShoppingList, ShoppingListItem, ShoppingListContribution, ShoppingListCommand, ShoppingListRevision):
        assert db.scalar(select(func.count()).select_from(model)) == 0
    result = service.create_list(db, ALICE, ShoppingListCreate(name='Fête', activate=True, items=[{'name': 'Pain'}]), key)
    assert len(result.items) == 1
