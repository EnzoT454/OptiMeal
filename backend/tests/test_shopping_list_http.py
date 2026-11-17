"""Raccordement HTTP, accès, rejeu et création atomique depuis le calendrier."""
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select
from sqlalchemy.orm import Session, sessionmaker

from backend.app.database import get_db
from backend.app.config import Settings
from backend.app.main import create_app
from backend.app.security import optional_user
from backend.app.planning.models import MealPlanEntry
from backend.app.shopping_lists import service
from backend.app.shopping_lists.models import ShoppingList, ShoppingListRevision
from backend.app.shopping_lists.schemas import ShoppingItemAdd
from backend.tests.test_accounts import ALICE, BOB, accounts, login, postgres  # noqa: F401
from backend.tests.test_shopping_list_calendar import (  # noqa: F401
    database, concurrent_database, add_meal, OTHER, REQUEST,
)

ROOT = '/api/v1/shopping-lists'


def command(client, path=ROOT, body=None, key=None, method='post'):
    return getattr(client, method)(path, json=body or {'name': 'Courses'},
        headers={'Idempotency-Key': str(key or uuid4())})


def test_manual_routes_revision_replay_and_account_isolation(accounts):
    client, app = accounts
    assert client.get(ROOT).status_code == 401
    login(app, ALICE)
    assert client.post(ROOT, json={'name': 'Courses'}).status_code == 422
    key = uuid4()
    created = command(client, key=key)
    assert created.status_code == 201, created.text
    result = created.json()['item']
    path = ROOT + '/' + result['id']
    assert command(client, key=key).json() == created.json()
    assert command(client, body={'name': 'Autre'}, key=key).status_code == 409
    added = command(client, path + '/items', {'expected_revision': 1, 'name': 'Pain'})
    assert added.status_code == 200, added.text
    item = added.json()['item']['items'][0]
    conflict = command(client, path, {'name': 'Autre', 'expected_revision': 1}, method='patch')
    assert conflict.status_code == 409
    assert conflict.json()['error']['current_revision'] == 2
    assert conflict.json()['error']['list_id'] == result['id']
    assert client.get(path + '/revisions/1').status_code == 404
    assert client.get(path + '/revisions').status_code == 404
    assert client.get(ROOT).json()['total'] == 1
    bought = command(client, path + '/items/' + item['id'] + '/manual-purchase',
        {'expected_revision': 2, 'purchased': True, 'coverage': {'confirms_unquantified': True}}, method='put')
    assert bought.json()['item']['totals']['purchased_item_count'] == 1
    login(app, BOB)
    assert client.get(ROOT).json()['total'] == 0
    assert client.get(path).status_code == 404
    assert client.get(path + '/revisions/1').status_code == 404
    assert command(client, path + '/items', {'expected_revision': 3, 'name': 'Vol'}).status_code == 404


@pytest.fixture
def http(database):
    app = create_app(settings=Settings())
    app.dependency_overrides[optional_user] = lambda: ALICE
    def session():
        with Session(database) as db:
            yield db
    app.dependency_overrides[get_db] = session
    with TestClient(app) as client:
        app.state.database.session_factory = sessionmaker(bind=database)
        yield client, app, database


def test_calendar_creation_snapshot_replay_and_independent_ids(http):
    client, app, engine = http
    meal = add_meal(engine)
    request = REQUEST.model_dump(mode='json')
    preview = client.post(ROOT + '/calendar-preview', json=request)
    assert preview.status_code == 200, preview.text
    source = preview.json()['item']
    body = dict(request, name='Semaine', preview_fingerprint=source['preview_fingerprint'])
    key = uuid4()
    response = command(client, ROOT + '/from-calendar', body, key)
    assert response.status_code == 201, response.text
    first = response.json()['item']
    second = command(client, ROOT + '/from-calendar', body).json()['item']
    assert first['items'][0]['id'] != second['items'][0]['id']
    assert first['items'][0]['contributions'][0]['id'] != second['items'][0]['contributions'][0]['id']
    with Session(engine) as db:
        saved = service.add_item(db, first['id'], ALICE,
            ShoppingItemAdd(expected_revision=1, name='Sac réutilisable'), uuid4())
    with engine.begin() as db:
        db.execute(delete(MealPlanEntry).where(MealPlanEntry.id == meal))
    # Une réponse perdue peut être rejouée même après modification des sources.
    assert command(client, ROOT + '/from-calendar', body, key).json() == response.json()
    assert command(client, ROOT + '/from-calendar', body).status_code == 409
    current = client.get(ROOT + '/' + first['id']).json()['item']
    assert len(current['items']) == 2 and current['revision'] == saved.revision
    assert current['period'] == source['period']
    assert current['items'][0]['required'] == source['items'][0]['required']


def test_partial_import_requires_confirmation_and_keeps_warning_after_edits(http):
    client, _, engine = http
    add_meal(engine)
    add_meal(engine, day=17, recipe_id=OTHER)
    request = REQUEST.model_dump(mode='json')
    preview = client.post(ROOT + '/calendar-preview', json=request).json()['item']
    body = dict(request, name='Partiel', preview_fingerprint=preview['preview_fingerprint'])
    assert command(client, ROOT + '/from-calendar', body).status_code == 422
    with Session(engine) as db:
        assert list(db.scalars(select(ShoppingList.id))) == []
        assert list(db.scalars(select(ShoppingListRevision.list_id))) == []
    response = command(client, ROOT + '/from-calendar', dict(body, accept_partial=True))
    assert response.status_code == 201, response.text
    result = response.json()['item']
    updated = command(client, ROOT + '/' + result['id'] + '/items',
        {'name': 'Ajout', 'expected_revision': 1}).json()['item']
    assert 'CALENDAR_PARTIAL' in [w['code'] for w in updated['warnings']]


@pytest.mark.parametrize('same_key', [True, False])
def test_concurrent_calendar_creations_are_atomic_and_do_not_duplicate_a_command(database, same_key):
    from concurrent.futures import ThreadPoolExecutor
    from backend.app.shopping_lists.calendar import preview_calendar
    from backend.app.shopping_lists.schemas import ShoppingFromCalendar
    add_meal(database)
    with Session(database) as db:
        preview = preview_calendar(db, ALICE, REQUEST)
    body = ShoppingFromCalendar(**REQUEST.model_dump(), name='Courses', preview_fingerprint=preview.preview_fingerprint)
    first_key = uuid4()
    def create(key):
        with Session(database) as db:
            return service.create_from_calendar(db, ALICE, body, key)
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(create, key) for key in (first_key, first_key if same_key else uuid4())]
        results = [f.result(timeout=10) for f in futures]
    assert (results[0].id == results[1].id) == same_key
    with Session(database) as db:
        assert len(list(db.scalars(select(ShoppingList.id)))) == (1 if same_key else 2)
        assert len(list(db.scalars(select(ShoppingListRevision.list_id)))) == (1 if same_key else 2)


def test_unit_warning_is_recomputed_once_after_import_and_manual_correction(http):
    from datetime import datetime, timezone
    from sqlalchemy import update
    from backend.app.recipes.models import Recipe, RecipeIngredient
    client, _, engine = http
    with engine.begin() as db:
        db.execute(update(Recipe).where(Recipe.id == OTHER).values(
            visibility='public', published_at=datetime.now(timezone.utc)))
        db.execute(update(RecipeIngredient).where(RecipeIngredient.recipe_id == OTHER).values(unit='ml'))
    add_meal(engine)
    add_meal(engine, day=17, recipe_id=OTHER)
    request = REQUEST.model_dump(mode='json')
    preview = client.post(ROOT + '/calendar-preview', json=request).json()['item']
    body = dict(request, name='Unités', preview_fingerprint=preview['preview_fingerprint'])
    result = command(client, ROOT + '/from-calendar', body).json()['item']
    assert [w['code'] for w in result['warnings']].count('INCOMPATIBLE_UNITS') == 1
    item = result['items'][0]
    updated = command(client, ROOT + '/' + result['id'] + '/items/' + item['id'],
        {'expected_revision': 1, 'quantity': None}, method='patch').json()['item']
    assert 'INCOMPATIBLE_UNITS' not in [w['code'] for w in updated['warnings']]
