"""Notation HTTP : droits, validation stricte, agrégats et isolation des votes."""
from datetime import datetime, timezone
from unittest.mock import Mock

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import event, func, select, text, update

from backend.app.config import Settings
from backend.app.main import create_app
from backend.app.recipes.models import Recipe, RecipeRating
from backend.app.security import auth_error
from backend.tests.test_accounts import ALICE, BOB, accounts, body, login  # noqa: F401
from backend.tests.test_ingredient_import import postgres  # noqa: F401

VOTE = {'recipe_version': 1, 'taste_score': 5, 'reliability_score': 4, 'ease_score': 3}
EMPTY = {'average': None, 'count': 0, 'criteria': {'taste': None, 'reliability': None, 'ease': None}}


def seed_id(client):
    return client.get('/api/v1/recipes').json()['items'][0]['id']


def vote(client, recipe_id, payload=None):
    return client.put('/api/v1/recipes/' + recipe_id + '/rating', json=VOTE if payload is None else payload)


def test_public_empty_summary_and_personal_vote_only_in_detail(accounts):
    client, app = accounts
    recipes = client.get('/api/v1/recipes').json()['items']
    assert recipes and all(r['rating'] == EMPTY and 'my_rating' not in r for r in recipes)
    detail = client.get('/api/v1/recipes/' + recipes[0]['id']).json()['item']
    assert detail['rating'] == EMPTY and detail['my_rating'] is None
    assert 'ranking_score' not in str(detail)


def test_put_creates_replaces_and_returns_exact_summary_without_duplicate_votes(accounts, postgres):
    client, app = accounts
    recipe_id = seed_id(client)
    login(app, ALICE)
    for _ in range(2):
        response = vote(client, recipe_id)
        assert response.status_code == 200, response.text
        item = response.json()['item']
        assert item['rating'] == {'average': '4.20', 'count': 1,
                                  'criteria': {'taste': '5', 'reliability': '4', 'ease': '3'}}
        assert {k: item['my_rating'][k] for k in VOTE} == VOTE
        assert set(item['my_rating']) == {*VOTE, 'created_at', 'updated_at'}
    assert postgres.scalar(select(func.count()).select_from(RecipeRating)) == 1
    original = item['my_rating']['created_at']
    postgres.execute(update(RecipeRating).values(updated_at=datetime(2000, 1, 1, tzinfo=timezone.utc)))
    changed = vote(client, recipe_id, {**VOTE, 'taste_score': 1}).json()['item']
    assert changed['rating']['count'] == 1 and changed['rating']['average'] == '2.60'
    assert changed['my_rating']['created_at'] == original
    assert datetime.fromisoformat(changed['my_rating']['updated_at']).year > 2000


def test_two_accounts_share_aggregates_but_not_individual_votes(accounts):
    client, app = accounts
    recipe_id = seed_id(client)
    login(app, ALICE)
    assert vote(client, recipe_id).status_code == 200
    login(app, BOB)
    assert client.get('/api/v1/recipes/' + recipe_id).json()['item']['my_rating'] is None
    second = {'recipe_version': 1, 'taste_score': 1, 'reliability_score': 2, 'ease_score': 5}
    assert vote(client, recipe_id, second).status_code == 200
    for user, expected in ((ALICE, VOTE), (BOB, second), (None, None)):
        login(app, user)
        item = client.get('/api/v1/recipes/' + recipe_id).json()['item']
        assert item['rating'] == {'average': '3.20', 'count': 2,
                                  'criteria': {'taste': '3', 'reliability': '3', 'ease': '4'}}
        assert item['my_rating'] is None if expected is None else {k: item['my_rating'][k] for k in VOTE} == expected
        summary = next(r for r in client.get('/api/v1/recipes').json()['items'] if r['id'] == recipe_id)
        assert summary['rating'] == item['rating'] and 'my_rating' not in summary


@pytest.mark.parametrize('field', ['taste_score', 'reliability_score', 'ease_score'])
@pytest.mark.parametrize('value', [None, True, '4', 4.0, 2.5, 0, 6])
def test_invalid_score_preserves_existing_vote(accounts, postgres, field, value):
    client, app = accounts
    recipe_id = seed_id(client)
    login(app, ALICE)
    before = vote(client, recipe_id).json()['item']
    response = vote(client, recipe_id, {**VOTE, field: value})
    assert response.status_code == 422 and response.json()['error']['code'] == 'VALIDATION_ERROR'
    assert client.get('/api/v1/recipes/' + recipe_id).json()['item'] == before
    assert postgres.scalar(select(func.count()).select_from(RecipeRating)) == 1


@pytest.mark.parametrize('payload', [
    {}, {'taste_score': 5, 'ease_score': 3}, {**VOTE, 'user_id': str(BOB.id)},
    {**VOTE, 'average': 5}, {**VOTE, 'created_at': '2026-11-02'},
    {**VOTE, 'prior_weight': 1}, {**VOTE, 'unknown': 1},
])
def test_incomplete_votes_and_client_controlled_metadata_are_rejected(accounts, postgres, payload):
    client, app = accounts
    recipe_id = seed_id(client)
    login(app, ALICE)
    assert vote(client, recipe_id, payload).status_code == 422
    assert postgres.scalar(select(func.count()).select_from(RecipeRating)) == 0


def test_authorship_visibility_and_anonymous_mutations(accounts):
    client, app = accounts
    recipe_id = seed_id(client)
    assert vote(client, recipe_id).status_code == 401
    assert client.delete('/api/v1/recipes/' + recipe_id + '/rating').status_code == 401
    login(app, ALICE)
    own = client.post('/api/v1/recipes', json=body()).json()['item']['id']
    for visibility in ('private', 'public'):
        client.patch('/api/v1/recipes/' + own + '/visibility', json={'visibility': visibility})
        response = vote(client, own)
        assert response.status_code == 403 and response.json()['error']['code'] == 'SELF_RATING_FORBIDDEN'
    login(app, BOB)
    assert vote(client, own).status_code == 200
    login(app, ALICE)
    client.patch('/api/v1/recipes/' + own + '/visibility', json={'visibility': 'private'})
    login(app, BOB)
    for inaccessible in (own, 'recipe_missing'):
        response = vote(client, inaccessible)
        assert response.status_code == 404 and response.json()['error']['code'] == 'RECIPE_NOT_FOUND'
        assert client.get('/api/v1/recipes/' + inaccessible).status_code == 404
    login(app, ALICE)
    assert client.get('/api/v1/recipes/' + own).json()['item']['rating']['count'] == 1
    client.patch('/api/v1/recipes/' + own + '/visibility', json={'visibility': 'public'})
    login(app, BOB)
    assert client.get('/api/v1/recipes/' + own).json()['item']['my_rating']['taste_score'] == 5


def test_delete_is_personal_idempotent_and_allowed_after_losing_access(accounts, postgres):
    client, app = accounts
    recipe_id = seed_id(client)
    for user in (ALICE, BOB):
        login(app, user)
        assert vote(client, recipe_id).status_code == 200
    login(app, ALICE)
    for _ in range(2):
        response = client.delete('/api/v1/recipes/' + recipe_id + '/rating')
        assert response.status_code == 204 and response.content == b''
    assert postgres.scalars(select(RecipeRating.user_id)).all() == [BOB.id]
    login(app, BOB)
    assert client.delete('/api/v1/recipes/' + recipe_id + '/rating').status_code == 204
    assert client.get('/api/v1/recipes/' + recipe_id).json()['item']['rating'] == EMPTY
    login(app, ALICE)
    own = client.post('/api/v1/recipes', json={**body(), 'visibility': 'public'}).json()['item']['id']
    login(app, BOB)
    vote(client, own)
    login(app, ALICE)
    client.patch('/api/v1/recipes/' + own + '/visibility', json={'visibility': 'private'})
    login(app, BOB)
    assert client.delete('/api/v1/recipes/' + own + '/rating').status_code == 204
    assert client.delete('/api/v1/recipes/recipe_missing/rating').status_code == 204
    assert postgres.scalar(select(func.count()).select_from(RecipeRating)) == 0


def test_list_uses_one_grouped_query_for_ratings_and_preserves_pagination(accounts, postgres):
    client, app = accounts
    recipe_id = seed_id(client)
    login(app, ALICE)
    vote(client, recipe_id)
    statements = []
    def record(conn, cursor, statement, parameters, context, executemany):
        if 'recipe_rating' in statement and statement.lstrip().startswith('SELECT'):
            statements.append(statement)
    event.listen(postgres, 'before_cursor_execute', record)
    try:
        result = client.get('/api/v1/recipes?limit=2').json()
    finally:
        event.remove(postgres, 'before_cursor_execute', record)
    assert result['total'] == 10 and len(result['items']) == 2
    assert len(statements) == 1 and 'GROUP BY' in statements[0]


@pytest.mark.parametrize('status', [401, 503])
def test_invalid_token_or_auth_outage_never_becomes_an_anonymous_vote(status):
    with TestClient(create_app(settings=Settings())) as client:
        client.app.state.auth.validate = Mock(side_effect=auth_error(status))
        response = client.put('/api/v1/recipes/recipe_test/rating', json=VOTE,
                              headers={'Authorization': 'Bearer test-token'})
        assert response.status_code == status
        assert response.json()['error']['code'] == ('AUTH_REQUIRED' if status == 401 else 'AUTH_UNAVAILABLE')


@pytest.mark.parametrize('method', ['put', 'delete'])
def test_missing_rating_table_returns_sanitized_503(accounts, postgres, method):
    client, app = accounts
    recipe_id = seed_id(client)
    login(app, ALICE)
    postgres.execute(text('DROP TABLE public.recipe_rating'))
    response = getattr(client, method)('/api/v1/recipes/' + recipe_id + '/rating',
                                       **({'json': VOTE} if method == 'put' else {}))
    assert response.status_code == 503 and response.json()['error']['code'] == 'RECIPES_UNAVAILABLE'
    assert 'SELECT' not in response.text and 'recipe_rating' not in response.text
