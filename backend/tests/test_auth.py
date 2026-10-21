"""Supabase vérifie le jeton ; aucune session fournisseur partagée entre utilisateurs."""
from contextlib import contextmanager
from uuid import UUID

from fastapi.testclient import TestClient
import httpx
import pytest

from backend.app.config import Settings, load_settings
from backend.app.main import create_app

USER_ID = '11111111-1111-4111-8111-111111111111'


def test_public_configuration_aliases_and_secret_repr(tmp_path):
    path=tmp_path / '.env'
    path.write_text('EXPO_PUBLIC_SUPABASE_URL=https://test.supabase.co\nEXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=private-test-key\n')
    settings=load_settings(path)
    assert settings.supabase_url == 'https://test.supabase.co'
    assert settings.supabase_publishable_key == 'private-test-key'
    assert 'private-test-key' not in repr(settings)


@contextmanager
def auth_client(handler):
    app=create_app(settings=Settings(supabase_url='https://test.supabase.co',supabase_publishable_key='public-test'))
    with TestClient(app) as client:
        app.state.auth.client.close()
        app.state.auth.client=httpx.Client(transport=httpx.MockTransport(handler))
        yield client


def test_missing_and_malformed_credentials_are_401_without_network():
    def handler(request):
        pytest.fail('Aucun appel Auth attendu')
    with auth_client(handler) as client:
        for headers in ({},{'Authorization':'Basic password'},{'Authorization':'Bearer'}):
            response=client.get('/auth/me',headers=headers)
            assert response.status_code == 401
            assert response.headers['www-authenticate'] == 'Bearer'


def test_identity_is_checked_remotely_for_each_token():
    tokens=[]
    def handler(request):
        tokens.append(request.headers['authorization'])
        assert request.url.path == '/auth/v1/user'
        assert request.headers['apikey'] == 'public-test'
        return httpx.Response(200,json={'id':USER_ID,'email':'alice@example.test','role':'authenticated',
                                       'email_confirmed_at':'2026-10-20','is_anonymous':False})
    with auth_client(handler) as client:
        for token in ('token-a','token-b'):
            response=client.get('/auth/me',headers={'Authorization':'Bearer '+token})
            assert response.status_code == 200
            assert response.json() == {'id':USER_ID,'email':'alice@example.test'}
    assert tokens == ['Bearer token-a','Bearer token-b']


@pytest.mark.parametrize('status,expected',[(401,401),(403,401),(429,503),(500,503),(302,503)])
def test_auth_provider_errors_are_sanitized(status,expected):
    with auth_client(lambda request: httpx.Response(status,json={'secret':'private-value'})) as client:
        response=client.get('/api/v1/me',headers={'Authorization':'Bearer bad-token'})
        assert response.status_code == expected
        assert 'private-value' not in response.text
        assert 'bad-token' not in response.text


def test_network_failure_is_503_and_unconfirmed_or_anonymous_accounts_rejected():
    def broken(request):
        raise httpx.ConnectError('private-value')
    with auth_client(broken) as client:
        assert client.get('/auth/me',headers={'Authorization':'Bearer token'}).status_code == 503
    for data in ({'role':'service_role'}, {'role':'authenticated','is_anonymous':True},
                 {'role':'authenticated','email_confirmed_at':None}):
        with auth_client(lambda request: httpx.Response(200,json=data)) as client:
            assert client.get('/auth/me',headers={'Authorization':'Bearer token'}).status_code == 401


@pytest.mark.parametrize('payload', [[], {'id':'invalid'}, {'email':{'unexpected':'object'}}])
def test_malformed_identity_is_a_sanitized_provider_error(payload):
    valid={'id':USER_ID,'email':'alice@example.test','role':'authenticated','email_confirmed_at':'2026-10-20'}
    data={**valid,**payload} if isinstance(payload,dict) else payload
    with auth_client(lambda request: httpx.Response(200,json=data)) as client:
        response=client.get('/auth/me',headers={'Authorization':'Bearer token'})
        assert response.status_code==503
        assert 'unexpected' not in response.text


def test_malformed_json_from_provider_is_a_503():
    with auth_client(lambda request: httpx.Response(200,text='not-json')) as client:
        assert client.get('/auth/me',headers={'Authorization':'Bearer token'}).status_code==503
