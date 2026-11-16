"""Accès unifiés : épinglage privé et période exacte avant pagination."""
from datetime import date
from uuid import uuid4

import pytest
from alembic import command as alembic
from pydantic import ValidationError
from sqlalchemy import delete, func, insert, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.accounts.models import Profile
from backend.app.shopping_lists.models import ShoppingListPin, ShoppingListRevision
from backend.app.shopping_lists.access_schemas import ShoppingPinWrite
from backend.tests.test_accounts import ALICE, BOB, accounts, login, postgres  # noqa: F401
from backend.tests.test_ingredient_import import alembic_config
from backend.tests.test_shopping_list_http import http, database, concurrent_database, command  # noqa: F401
from backend.tests.test_shopping_list_calendar import add_meal

ROOT = '/api/v1/shopping-lists'
PIN = '/api/v1/shopping-list-pin'


def pin(client, list_id, key=None):
    return client.put(PIN, json={'list_id': list_id}, headers={'Idempotency-Key': str(key or uuid4())})


def test_pin_contract_requires_explicit_nullable_target_and_rejects_owner():
    assert ShoppingPinWrite(list_id=None).list_id is None
    for value in ({}, {'list_id': None, 'owner_id': str(ALICE.id)}, {'list_id': 'bad'}):
        with pytest.raises(ValidationError):
            ShoppingPinWrite.model_validate(value)


def test_pin_private_idempotent_single_and_does_not_mutate_list(accounts):
    client, app = accounts
    assert client.get(PIN).status_code == 401
    assert pin(client, None).status_code == 401
    login(app, ALICE)
    assert client.get(PIN).json()['item'] == {'list_id': None}
    a = command(client).json()['item']
    b = command(client, body={'name': 'Deuxième'}).json()['item']
    key = uuid4()
    first = pin(client, a['id'], key)
    assert first.status_code == 200, first.text
    assert client.get(ROOT + '/' + a['id']).json()['item'] == a
    assert pin(client, b['id']).status_code == 200
    assert pin(client, a['id'], key).json() == first.json()
    assert client.get(PIN).json()['item']['list_id'] == b['id']
    assert pin(client, b['id'], key).status_code == 409
    login(app, BOB)
    assert client.get(PIN).json()['item']['list_id'] is None
    assert pin(client, a['id']).status_code == 404
    assert pin(client, None).status_code == 200
    login(app, ALICE)
    assert client.get(PIN).json()['item']['list_id'] == b['id']
    assert pin(client, None).status_code == 200
    assert client.get(PIN).json()['item']['list_id'] is None


def test_archived_pin_is_hidden_and_cannot_be_selected(accounts):
    client, app = accounts
    login(app, ALICE)
    resource = command(client).json()['item']
    assert pin(client, resource['id']).status_code == 200
    command(client, ROOT + '/' + resource['id'] + '/archive', {'expected_revision': 1})
    assert client.get(PIN).json()['item']['list_id'] is None
    assert pin(client, resource['id']).status_code == 409
    command(client, ROOT + '/' + resource['id'] + '/reopen', {'expected_revision': 2})
    assert client.get(PIN).json()['item']['list_id'] == resource['id']


def test_pin_rls_ownership_constraint_cascade_and_migration_match(accounts, postgres):
    client, app = accounts
    login(app, ALICE)
    alice = command(client).json()['item']
    pin(client, alice['id'])
    login(app, BOB)
    command(client)
    assert postgres.scalar(select(func.count()).select_from(ShoppingListPin)) == 1
    assert postgres.scalar(text("SELECT relrowsecurity FROM pg_class WHERE oid='public.shopping_list_pin'::regclass"))
    assert postgres.scalar(text("SELECT count(*) FROM pg_policies WHERE tablename='shopping_list_pin'")) == 0
    with pytest.raises(IntegrityError), postgres.begin_nested():
        postgres.execute(insert(ShoppingListPin).values(owner_id=BOB.id, list_id=alice['id']))
    alembic.check(alembic_config(postgres))
    postgres.execute(delete(Profile).where(Profile.id == ALICE.id))
    assert postgres.scalar(select(func.count()).select_from(ShoppingListPin)) == 0


def test_exact_period_is_filtered_before_count_and_pagination(http):
    client, _, _ = http
    from backend.app.shopping_lists import service
    from backend.app.shopping_lists.schemas import ShoppingFromCalendar, ShoppingCalendarPreviewWrite
    from backend.app.shopping_lists.calendar import preview_calendar
    _, _, engine = http
    add_meal(engine, day=16)
    add_meal(engine, day=24)
    created = []
    for start, end in [(16, 22), (16, 22), (23, 29)]:
        with Session(engine) as db:
            preview = preview_calendar(db, ALICE, ShoppingCalendarPreviewWrite(start_date=date(2026, 11, start), end_date=date(2026, 11, end)))
        with Session(engine) as db:
            created.append(service.create_from_calendar(db, ALICE, ShoppingFromCalendar(name='Période',
                start_date=preview.period.start_date, end_date=preview.period.end_date,
                preview_fingerprint=preview.preview_fingerprint), uuid4()))
    query = ROOT + '?start_date=2026-11-16&end_date=2026-11-22&limit=1'
    first = client.get(query).json()
    second = client.get(query + '&offset=1').json()
    assert first['total'] == second['total'] == 2
    assert {first['items'][0]['id'], second['items'][0]['id']} == {str(c.id) for c in created[:2]}
    assert first['items'][0]['period'] == {'start_date': '2026-11-16', 'end_date': '2026-11-22'}
    assert client.get(ROOT + '?start_date=2026-11-17&end_date=2026-11-22').json()['total'] == 0
    for suffix in ('?start_date=2026-11-16', '?end_date=2026-11-22', '?start_date=2026-11-22&end_date=2026-11-16'):
        assert client.get(ROOT + suffix).status_code == 422


def test_pin_migration_refuses_to_discard_a_saved_preference(accounts, postgres):
    from sqlalchemy.exc import DBAPIError
    client, app = accounts
    login(app, ALICE)
    resource = command(client).json()['item']
    pin(client, resource['id'])
    with pytest.raises(DBAPIError), postgres.begin_nested():
        alembic.downgrade(alembic_config(postgres), '0020_shopping_reuse')
    assert postgres.scalar(select(ShoppingListPin.list_id)) is not None


def test_concurrent_pin_commands_keep_one_private_target(concurrent_database):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    from backend.app.shopping_lists import service, access
    from backend.app.shopping_lists.schemas import ShoppingListCreate
    engine = concurrent_database
    ids = []
    for name in ('Première', 'Deuxième'):
        with Session(engine) as db:
            ids.append(service.create_list(db, ALICE, ShoppingListCreate(name=name), uuid4()).id)
    barrier = Barrier(2)
    def submit(list_id):
        with Session(engine) as db:
            barrier.wait(timeout=5)
            return access.set_pin(db, ALICE, ShoppingPinWrite(list_id=list_id), uuid4())
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(submit, ids))
    assert {result.list_id for result in results} == set(ids)
    with engine.connect() as connection:
        assert connection.scalar(select(func.count()).select_from(ShoppingListPin)) == 1
        assert connection.scalar(select(ShoppingListPin.list_id)) in ids
