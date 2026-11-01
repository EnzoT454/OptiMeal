"""Isolation réelle entre deux comptes dans un PostgreSQL local de test."""
from uuid import UUID

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import text
from sqlalchemy.orm import sessionmaker

from backend.app.accounts.models import Profile
from backend.app.catalog.ingredient_import import read_ingredients, upsert_ingredients
from backend.app.common.public_data import DEFAULT_CATALOG, DEFAULT_RECIPES
from backend.app.config import Settings
from backend.app.main import create_app
from backend.app.recipes.seed_import import import_recipes, read_recipes
from backend.app.security import CurrentUser, optional_user
from backend.tests.test_ingredient_import import postgres  # noqa: F401

ALICE=CurrentUser(UUID('11111111-1111-4111-8111-111111111111'),'alice@example.test')
BOB=CurrentUser(UUID('22222222-2222-4222-8222-222222222222'),'bob@example.test')


@pytest.fixture
def accounts(postgres):
    for user in (ALICE,BOB):
        postgres.execute(text('INSERT INTO auth.users(id) VALUES (:id)'), {'id':user.id})
    upsert_ingredients(postgres,read_ingredients(DEFAULT_CATALOG))
    import_recipes(postgres,read_recipes(DEFAULT_RECIPES))
    app=create_app(settings=Settings())
    with TestClient(app) as client:
        app.state.database.session_factory=sessionmaker(bind=postgres,join_transaction_mode='create_savepoint')
        yield client,app


def login(app,user):
    app.dependency_overrides[optional_user]=lambda:user


def body():
    return read_recipes(DEFAULT_RECIPES)[0].model_dump(exclude={'seed_key'})


def test_profile_is_derived_from_identity_and_rejects_user_id(accounts):
    client,app=accounts
    assert client.get('/api/v1/me').status_code == 401
    login(app,ALICE)
    assert client.get('/auth/me').json()['id'] == str(ALICE.id)
    assert client.get('/api/v1/me').json()['display_name'] is None
    response=client.patch('/api/v1/me',json={'display_name':'Alice'})
    assert response.status_code == 200 and response.json()['display_name']=='Alice'
    assert client.patch('/api/v1/me',json={'display_name':'X','id':str(BOB.id)}).status_code==422
    login(app,BOB)
    assert client.get('/api/v1/me').json()['display_name'] is None


def test_private_recipes_are_invisible_to_other_user_and_anonymous(accounts):
    client,app=accounts
    login(app,ALICE)
    response=client.post('/api/v1/recipes',json=body())
    assert response.status_code==201, response.text
    recipe=response.json()['item']
    recipe_id=recipe['id']
    assert recipe['is_owned'] and not recipe['review_required']
    assert client.get('/api/v1/recipes').json()['total']==11
    for user in (BOB,None):
        login(app,user)
        assert client.get('/api/v1/recipes').json()['total']==10
        assert client.get('/api/v1/recipes/'+recipe_id).status_code==404
        for method in ('put','delete'):
            kwargs={'json':body()} if method=='put' else {}
            assert getattr(client,method)('/api/v1/recipes/'+recipe_id,**kwargs).status_code==(401 if user is None else 404)
        assert client.put('/api/v1/recipes/'+recipe_id+'/favorite').status_code==(401 if user is None else 404)
    login(app,ALICE)
    changed=body()
    changed['name']='Recette personnelle modifiée'
    changed['ingredients']=changed['ingredients'][:1]
    assert client.put('/api/v1/recipes/'+recipe_id,json=changed).status_code==200
    detail=client.get('/api/v1/recipes/'+recipe_id).json()['item']
    assert detail['name']==changed['name'] and len(detail['ingredients'])==1
    assert client.delete('/api/v1/recipes/'+recipe_id).status_code==204
    assert client.get('/api/v1/recipes/'+recipe_id).status_code==404


def test_shared_recipes_cannot_be_changed_and_favorites_are_private_and_idempotent(accounts):
    client,app=accounts
    recipe_id=client.get('/api/v1/recipes').json()['items'][0]['id']
    assert client.get('/api/v1/recipes?favorites=true').status_code==401
    login(app,ALICE)
    assert client.put('/api/v1/recipes/'+recipe_id,json=body()).status_code==404
    assert client.delete('/api/v1/recipes/'+recipe_id).status_code==404
    for _ in range(2):
        assert client.put('/api/v1/recipes/'+recipe_id+'/favorite').status_code==204
    assert client.get('/api/v1/recipes?favorites=true').json()['total']==1
    assert client.get('/api/v1/recipes/'+recipe_id).json()['item']['is_favorite']
    login(app,BOB)
    assert client.get('/api/v1/recipes?favorites=true').json()['total']==0
    assert not client.get('/api/v1/recipes/'+recipe_id).json()['item']['is_favorite']
    login(app,ALICE)
    for _ in range(2):
        assert client.delete('/api/v1/recipes/'+recipe_id+'/favorite').status_code==204
    assert client.get('/api/v1/recipes?favorites=true').json()['total']==0


def test_invalid_recipe_never_writes_partial_data_or_accepts_owner(accounts):
    client,app=accounts
    login(app,ALICE)
    invalid=body()
    invalid['owner_id']=str(BOB.id)
    assert client.post('/api/v1/recipes',json=invalid).status_code==422
    invalid=body()
    invalid['ingredients'][0]['ingredient_id']='ing_missing'
    response=client.post('/api/v1/recipes',json=invalid)
    assert response.status_code==422
    assert response.json()['error']['code']=='UNKNOWN_INGREDIENT'
    assert client.get('/api/v1/recipes').json()['total']==10


@pytest.mark.parametrize('visibility', ['private', 'public'])
def test_account_deletion_cascades_without_touching_other_users_or_shared_recipes(accounts, postgres, visibility):
    """L'API Auth est simulée ; sa suppression de auth.users utilise le PostgreSQL de test."""
    import httpx
    from backend.app.accounts.deletion import AccountDeletion

    client, app = accounts
    personal = {}
    for user in (ALICE, BOB):
        login(app, user)
        personal[user.id] = client.post('/api/v1/recipes', json={**body(), 'visibility': visibility}).json()['item']['id']
        assert client.put('/api/v1/recipes/' + personal[user.id] + '/favorite').status_code == 204
        assert client.post('/api/v1/plans/entries', json={
            'date': '2026-11-02', 'meal': 'souper', 'recipe_id': personal[user.id],
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
    for table, column in [('profile', 'id'), ('recipe', 'owner_id'), ('favorite', 'user_id'), ('meal_plan_entry', 'user_id')]:
        assert postgres.scalar(text(f'SELECT count(*) FROM public.{table} WHERE {column}=:id'), {'id': ALICE.id}) == 0
    assert postgres.scalar(text('SELECT count(*) FROM public.recipe WHERE owner_id IS NULL')) == 10
    login(app, BOB)
    assert client.get('/api/v1/recipes/' + personal[BOB.id]).status_code == 200
    assert client.get('/api/v1/recipes?favorites=true').json()['total'] == 1
    assert client.get('/api/v1/recipes/' + personal[ALICE.id]).status_code == 404
    assert len(client.get('/api/v1/plans?week=2026-11-02').json()['item']['entries']) == 1
