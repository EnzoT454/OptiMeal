"""Recettes publiques et photos conservées ; fournisseurs Storage/Auth simulés."""
import json

import httpx
import pytest
from alembic import command
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError

from backend.app.accounts.deletion import AccountDeletion
from backend.app.accounts.models import Profile
from backend.app.recipes.models import Recipe
from backend.tests.test_accounts import ALICE, BOB, accounts, body, login  # noqa: F401
from backend.tests.test_ingredient_import import alembic_config, postgres  # noqa: F401


@pytest.mark.parametrize('failure', [None, 'download', 'upload', 'auth'])
def test_delete_preserves_public_photo_before_cleanup_and_can_retry(accounts, postgres, failure):
    client, app = accounts
    login(app, ALICE)
    source = f'https://test.supabase.co/storage/v1/object/public/recipes-images/users/{ALICE.id}/photo.jpg'
    recipe_id = client.post('/api/v1/recipes', json={**body(), 'visibility': 'public', 'image_url': source}).json()['item']['id']
    private_id = client.post('/api/v1/recipes', json=body()).json()['item']['id']
    login(app, BOB)
    assert client.put('/api/v1/recipes/' + recipe_id + '/favorite').status_code == 204
    assert client.post('/api/v1/plans/entries', json={
        'recipe_id': recipe_id, 'date': '2026-11-02', 'meal': 'souper'}).status_code == 201
    requests, uploaded = [], []
    fail_next = failure

    def provider(request):
        nonlocal fail_next
        requests.append(request)
        if request.method == 'GET':
            assert str(request.url) == source
            if fail_next == 'download':
                fail_next = None
                return httpx.Response(503)
            return httpx.Response(200, content=b'photo-test', headers={'content-type': 'image/jpeg'})
        if request.method == 'POST' and '/community/' in request.url.path:
            assert str(ALICE.id) not in request.url.path
            assert request.content == b'photo-test' and request.headers['apikey'] == 'sb_secret_TEST'
            if fail_next == 'upload':
                fail_next = None
                return httpx.Response(503)
            uploaded.append(str(request.url))
            return httpx.Response(200, json={})
        if request.method == 'POST':
            assert '/object/list/' in request.url.path
            return httpx.Response(200, json=[{'name': 'photo.jpg', 'id': 'one'}])
        if '/storage/' in request.url.path:
            assert uploaded  # Aucune suppression avant la copie et la sauvegarde de son URL.
            saved = postgres.scalar(select(Recipe.image_url).where(Recipe.id == recipe_id))
            assert '/community/' in saved and str(ALICE.id) not in saved
            assert json.loads(request.content)['prefixes'] == [f'users/{ALICE.id}/photo.jpg']
            return httpx.Response(200, json={})
        assert request.url.path == f'/auth/v1/admin/users/{ALICE.id}'
        if fail_next == 'auth':
            fail_next = None
            return httpx.Response(503)
        postgres.execute(text('DELETE FROM auth.users WHERE id=:id'), {'id': ALICE.id})
        return httpx.Response(200, json={})

    app.state.account_deletion.close()
    app.state.account_deletion = AccountDeletion('https://test.supabase.co', 'sb_secret_TEST')
    app.state.account_deletion.client.close()
    app.state.account_deletion.client = httpx.Client(transport=httpx.MockTransport(provider))
    login(app, ALICE)
    response = client.request('DELETE', '/api/v1/me', json={'confirmation': 'SUPPRIMER'})
    if failure:
        assert response.status_code == 503
        if failure in ('download', 'upload'):
            assert not any(r.method == 'DELETE' for r in requests)
            assert postgres.scalar(select(Recipe.image_url).where(Recipe.id == recipe_id)) == source
        assert postgres.scalar(select(Profile.deletion_pending).where(Profile.id == ALICE.id)) is True
        assert client.post('/api/v1/recipes', json=body()).status_code == 409
        assert client.put('/api/v1/recipes/' + recipe_id, json=body()).status_code == 409
        assert client.patch('/api/v1/recipes/' + private_id + '/visibility', json={'visibility': 'public'}).status_code == 409
        response = client.request('DELETE', '/api/v1/me', json={'confirmation': 'SUPPRIMER'})
    assert response.status_code == 204, response.text
    assert postgres.scalar(select(Recipe.owner_id).where(Recipe.id == recipe_id)) is None
    assert postgres.scalar(select(Recipe.id).where(Recipe.id == private_id)) is None
    login(app, BOB)
    item = client.get('/api/v1/recipes/' + recipe_id).json()['item']
    assert not item['is_owned'] and item['visibility'] == 'public'
    assert '/community/' in item['image_url'] and str(ALICE.id) not in item['image_url']
    assert client.get('/api/v1/recipes?scope=favorites').json()['total'] == 1
    meal = client.get('/api/v1/plans?week=2026-11-02').json()['item']['entries'][0]
    assert meal['recipe_id'] == recipe_id and meal['recipe_image_url'] == item['image_url']
    assert client.put('/api/v1/recipes/' + recipe_id, json=body()).status_code == 404
    login(app, None)
    assert client.get('/api/v1/recipes/' + recipe_id).status_code == 200
    assert recipe_id in {r['id'] for r in client.get('/api/v1/recipes?scope=discover&limit=100').json()['items']}
    with pytest.raises(DBAPIError, match='recettes publiques sans auteur'), postgres.begin_nested():
        command.downgrade(alembic_config(postgres), '0014_recipe_kitchen_units')
