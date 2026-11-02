"""Suppression réelle des votes et archives via DELETE /me, Auth externe simulée."""
import httpx
from sqlalchemy import func, select, text

from backend.app.accounts.deletion import AccountDeletion
from backend.app.recipes.models import Recipe, RecipeRating
from backend.tests.test_accounts import ALICE, BOB, accounts, body, login  # noqa: F401
from backend.tests.test_ingredient_import import postgres  # noqa: F401

VOTE = {'recipe_version': 1, 'taste_score': 5, 'reliability_score': 4, 'ease_score': 3}


def test_delete_account_removes_its_vote_history_and_votes_on_its_recipes_only(accounts, postgres):
    client, app = accounts
    personal = {}
    for user in (ALICE, BOB):
        login(app, user)
        response = client.post('/api/v1/recipes', json={**body(), 'visibility': 'public'})
        assert response.status_code == 201
        personal[user.id] = response.json()['item']['id']
    seed = postgres.scalar(select(Recipe.id).where(Recipe.owner_id.is_(None)).order_by(Recipe.id))
    for author, reviewer in ((ALICE, BOB), (BOB, ALICE)):
        recipe_id = personal[author.id]
        login(app, reviewer)
        assert client.put('/api/v1/recipes/' + recipe_id + '/rating', json=VOTE).status_code == 200
        assert client.put('/api/v1/recipes/' + seed + '/rating', json=VOTE).status_code == 200
        login(app, author)
        changed = body()
        changed['instructions'][0]['text'] += ' Nouvelle méthode.'
        response = client.put('/api/v1/recipes/' + recipe_id, json=changed)
        assert response.json()['item']['content_version'] == 2
        login(app, reviewer)
        assert client.put('/api/v1/recipes/' + recipe_id + '/rating', json={**VOTE, 'recipe_version': 2}).status_code == 200
    assert postgres.scalar(select(func.count()).select_from(RecipeRating)) == 6
    login(app, BOB)
    assert client.put('/api/v1/recipes/' + personal[ALICE.id] + '/favorite').status_code == 204
    assert client.post('/api/v1/plans/entries', json={
        'date': '2026-11-02', 'meal': 'souper', 'recipe_id': personal[ALICE.id],
    }).status_code == 201

    def provider(request):
        if request.method == 'POST':
            return httpx.Response(200, json=[])
        assert request.url.path == f'/auth/v1/admin/users/{ALICE.id}'
        postgres.execute(text('DELETE FROM auth.users WHERE id=:id'), {'id': ALICE.id})
        return httpx.Response(200, json={})

    app.state.account_deletion.close()
    app.state.account_deletion = AccountDeletion('https://test.supabase.co', 'sb_secret_TEST')
    app.state.account_deletion.client.close()
    app.state.account_deletion.client = httpx.Client(transport=httpx.MockTransport(provider))
    login(app, ALICE)
    assert client.request('DELETE', '/api/v1/me', json={'confirmation': 'SUPPRIMER'}).status_code == 204
    remaining = postgres.execute(select(RecipeRating.__table__)).mappings().all()
    assert len(remaining) == 1
    assert remaining[0]['user_id'] == BOB.id and remaining[0]['recipe_id'] == seed
    assert postgres.scalar(select(func.count()).select_from(Recipe).where(Recipe.owner_id.is_(None))) == 10
    login(app, BOB)
    assert client.get('/api/v1/me').status_code == 200
    assert client.get('/api/v1/recipes/' + personal[BOB.id]).json()['item']['rating']['count'] == 0
    assert client.get('/api/v1/recipes/' + seed).json()['item']['rating']['count'] == 1
    assert client.get('/api/v1/recipes?scope=discover&sort=top').json()['items'][0]['id'] == seed
    assert client.get('/api/v1/recipes/' + personal[ALICE.id]).status_code == 404
    assert client.get('/api/v1/recipes?scope=favorites').json()['total'] == 0
    meals = client.get('/api/v1/plans?week=2026-11-02').json()['item']['entries']
    assert len(meals) == 1 and meals[0]['recipe_name'] is None
