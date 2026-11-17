"""Commandes et suppression en concurrence réelle, sur deux connexions locales."""
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier, Event
from uuid import uuid4

import pytest
from sqlalchemy import event, func, select, update
from sqlalchemy.orm import Session

from backend.app.accounts.models import Profile
from backend.app.shopping_lists import service
from backend.app.shopping_lists.models import ShoppingList, ShoppingListCommand, ShoppingListRevision
from backend.app.shopping_lists.schemas import ShoppingListCreate, ShoppingListUpdate
from backend.tests.test_accounts import ALICE
from backend.tests.test_recipe_rating_concurrency import concurrent_database  # noqa: F401


def test_duplicate_creations_share_one_list_and_one_command(concurrent_database):
    engine = concurrent_database
    barrier, key = Barrier(2), uuid4()
    def submit():
        with Session(engine) as db:
            barrier.wait(timeout=5)
            return service.create_list(db, ALICE, ShoppingListCreate(name='Courses'), key)
    with ThreadPoolExecutor(max_workers=2) as executor:
        first, second = executor.submit(submit), executor.submit(submit)
        a, b = first.result(timeout=15), second.result(timeout=15)
    assert a == b and a.revision == 1
    with Session(engine) as db:
        for table in (ShoppingList, ShoppingListCommand, ShoppingListRevision):
            assert db.scalar(select(func.count()).select_from(table)) == 1


def test_conflicting_payloads_do_not_create_two_lists(concurrent_database):
    engine = concurrent_database
    barrier, key = Barrier(2), uuid4()
    def submit(name):
        with Session(engine) as db:
            barrier.wait(timeout=5)
            try:
                return service.create_list(db, ALICE, ShoppingListCreate(name=name), key)
            except service.ShoppingListError as exc:
                return exc.code
    with ThreadPoolExecutor(max_workers=2) as executor:
        first, second = executor.submit(submit, 'A'), executor.submit(submit, 'B')
        results = [first.result(timeout=15), second.result(timeout=15)]
    assert sum(value == 'IDEMPOTENCY_KEY_REUSED' for value in results) == 1
    with Session(engine) as db:
        assert db.scalar(select(func.count()).select_from(ShoppingList)) == 1


def test_two_changes_of_same_revision_have_one_winner(concurrent_database):
    engine = concurrent_database
    with Session(engine) as db:
        resource = service.create_list(db, ALICE, ShoppingListCreate(name='Courses'), uuid4())
    barrier = Barrier(2)
    def submit(name):
        with Session(engine) as db:
            barrier.wait(timeout=5)
            try:
                return service.update_list(db, resource.id, ALICE,
                    ShoppingListUpdate(expected_revision=1, name=name), uuid4())
            except service.ShoppingListError as exc:
                assert exc.error.current_revision == 2
                return exc.code
    with ThreadPoolExecutor(max_workers=2) as executor:
        first, second = executor.submit(submit, 'A'), executor.submit(submit, 'B')
        results = [first.result(timeout=15), second.result(timeout=15)]
    assert sum(value == 'LIST_REVISION_CONFLICT' for value in results) == 1
    with Session(engine) as db:
        assert service.get_list(db, resource.id, ALICE).revision == 2
        assert db.scalar(select(func.count()).select_from(ShoppingListRevision)) == 1


def test_commit_followed_by_lost_response_is_replayed_without_duplicate(concurrent_database, monkeypatch):
    engine, key = concurrent_database, uuid4()
    with Session(engine) as db:
        original = db.commit
        def lost_response():
            original()
            raise RuntimeError('réponse perdue après commit')
        with monkeypatch.context() as patch:
            patch.setattr(db, 'commit', lost_response)
            with pytest.raises(RuntimeError):
                service.create_list(db, ALICE, ShoppingListCreate(name='Courses'), key)
    with Session(engine) as db:
        result = service.create_list(db, ALICE, ShoppingListCreate(name='Courses'), key)
        assert result.revision == 1
        assert db.scalar(select(func.count()).select_from(ShoppingList)) == 1


def test_deletion_holding_profile_lock_blocks_new_list(concurrent_database):
    engine = concurrent_database
    attempted = Event()
    def record(conn, cursor, statement, parameters, context, executemany):
        if 'profile' in statement:
            attempted.set()
    def submit():
        with Session(engine) as db:
            try:
                service.create_list(db, ALICE, ShoppingListCreate(name='Courses'), uuid4())
            except service.ShoppingListError as exc:
                return exc.code
    with ThreadPoolExecutor(max_workers=1) as executor:
        with Session(engine) as deletion:
            deletion.execute(select(Profile.id).where(Profile.id == ALICE.id).with_for_update()).one()
            event.listen(engine, 'before_cursor_execute', record)
            try:
                pending = executor.submit(submit)
                assert attempted.wait(timeout=5)
                deletion.execute(update(Profile).where(Profile.id == ALICE.id).values(deletion_pending=True))
                deletion.commit()
                assert pending.result(timeout=15) == 'ACCOUNT_DELETION_PENDING'
            finally:
                event.remove(engine, 'before_cursor_execute', record)
    with Session(engine) as db:
        assert db.scalar(select(func.count()).select_from(ShoppingList)) == 0
