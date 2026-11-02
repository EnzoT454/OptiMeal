"""Suppression de compte : fournisseurs simulés, aucun compte réel touché."""
from contextlib import contextmanager
import json
from uuid import UUID

from fastapi.testclient import TestClient
import httpx
import pytest

from backend.app.accounts.deletion import AccountDeletion
from backend.app.config import Settings
from backend.app.main import create_app
from backend.app.security import CurrentUser, optional_user

USER = CurrentUser(UUID('11111111-1111-4111-8111-111111111111'), 'a@example.test')
PREFIX = f'users/{USER.id}'
SECRET = 'sb_secret_TEST_ONLY'


@contextmanager
def client_for(handler, *, authenticated=True, configured=True):
    app = create_app(settings=Settings(supabase_url='https://example.supabase.co',
                                      supabase_secret_key=SECRET if configured else None))
    if authenticated:
        app.dependency_overrides[optional_user] = lambda: USER
    with TestClient(app) as client:
        app.state.account_deletion.client.close()
        app.state.account_deletion.client = httpx.Client(transport=httpx.MockTransport(handler))
        yield client


def test_delete_uses_verified_identity_and_cleans_all_photos_before_auth():
    calls = []
    def handler(request):
        calls.append(request)
        assert request.headers['apikey'] == SECRET
        assert 'authorization' not in request.headers
        if request.url.path.endswith('/object/list/recipes-images'):
            data = json.loads(request.content)
            assert data['prefix'] == PREFIX + '/'
            return httpx.Response(200, json=[{'name': 'old-orphan.jpg', 'id': 'one'},
                                             {'name': 'current.jpg', 'id': 'two'}])
        if '/storage/' in request.url.path:
            assert json.loads(request.content)['prefixes'] == [PREFIX + '/old-orphan.jpg', PREFIX + '/current.jpg']
            return httpx.Response(200, json=[])
        assert request.url.path == f'/auth/v1/admin/users/{USER.id}'
        assert json.loads(request.content) == {'should_soft_delete': False}
        return httpx.Response(200, json={'id': str(USER.id)})
    with client_for(handler) as client:
        response = client.request('DELETE', '/api/v1/me', json={'confirmation': 'SUPPRIMER'})
        assert response.status_code == 204 and response.content == b''
    assert [r.method for r in calls] == ['POST', 'DELETE', 'DELETE']


@pytest.mark.parametrize('payload', [{}, {'confirmation': 'oui'},
    {'confirmation': 'SUPPRIMER', 'user_id': 'another-user'}])
def test_confirmation_required_and_user_id_cannot_be_supplied(payload):
    with client_for(lambda r: pytest.fail('No external request expected')) as client:
        assert client.request('DELETE', '/api/v1/me', json=payload).status_code == 422


def test_anonymous_deletion_is_rejected_before_admin_calls():
    with client_for(lambda r: pytest.fail('No admin request expected'), authenticated=False) as client:
        assert client.request('DELETE', '/api/v1/me', json={'confirmation': 'SUPPRIMER'}).status_code == 401


def test_missing_server_secret_fails_without_deleting_anything():
    with client_for(lambda r: pytest.fail('No request expected'), configured=False) as client:
        response = client.request('DELETE', '/api/v1/me', json={'confirmation': 'SUPPRIMER'})
        assert response.status_code == 503
        assert response.json()['error']['code'] == 'ACCOUNT_DELETION_UNAVAILABLE'


@pytest.mark.parametrize('stage', ['list', 'storage', 'auth', 'timeout'])
def test_provider_errors_are_sanitized_and_auth_is_not_called_after_storage_failure(stage):
    calls = []
    def handler(request):
        calls.append(request.url.path)
        if request.method == 'POST':
            if stage == 'timeout':
                raise httpx.ReadTimeout('secret upstream detail')
            return httpx.Response(500, text='secret upstream detail') if stage == 'list' else httpx.Response(
                200, json=[{'id': 'one', 'name': 'a.jpg'}])
        failed = '/storage/' in request.url.path if stage == 'storage' else '/auth/' in request.url.path
        return httpx.Response(500 if failed else 200, text='secret upstream detail')
    with client_for(handler) as client:
        response = client.request('DELETE', '/api/v1/me', json={'confirmation': 'SUPPRIMER'})
        assert response.status_code == 503
        assert SECRET not in response.text and 'secret upstream detail' not in response.text
    if stage != 'auth':
        assert not any('/auth/' in path for path in calls)


@pytest.mark.parametrize('rows', [{}, [{'id': 'one', 'name': '../other.jpg'}],
    [{'id': 'one', 'name': '..'}], [{'id': 'one', 'name': '/outside.jpg'}], [None]])
def test_invalid_storage_response_never_causes_a_delete(rows):
    def handler(request):
        assert request.method == 'POST'
        return httpx.Response(200, json=rows)
    with client_for(handler) as client:
        assert client.request('DELETE', '/api/v1/me', json={'confirmation': 'SUPPRIMER'}).status_code == 503


def test_storage_pagination_nested_folders_and_batched_deletion(monkeypatch):
    monkeypatch.setattr('backend.app.accounts.deletion.PAGE_SIZE', 2)
    deleted = []
    def handler(request):
        data = json.loads(request.content)
        if request.method == 'POST':
            folder, offset = data['prefix'], data['offset']
            if folder == PREFIX + '/nested/':
                return httpx.Response(200, json=[{'id': 'nested', 'name': 'c.jpg'}])
            if offset == 0:
                return httpx.Response(200, json=[{'id': 'one', 'name': 'a.jpg'}, {'id': None, 'name': 'nested'}])
            if offset == 2:
                return httpx.Response(200, json=[{'id': 'two', 'name': 'b.jpg'}])
            pytest.fail('Unexpected page')
        if '/storage/' in request.url.path:
            assert len(data['prefixes']) <= 2
            deleted.extend(data['prefixes'])
        return httpx.Response(200, json={})
    with client_for(handler) as client:
        assert client.request('DELETE', '/api/v1/me', json={'confirmation': 'SUPPRIMER'}).status_code == 204
    assert deleted == [PREFIX + '/a.jpg', PREFIX + '/b.jpg', PREFIX + '/nested/c.jpg']


def test_retry_after_auth_failure_can_finish_with_already_removed_photos():
    photos = ['a.jpg']
    auth_calls = 0
    def handler(request):
        nonlocal auth_calls
        if request.method == 'POST':
            return httpx.Response(200, json=[{'id': 'one', 'name': p} for p in photos])
        if '/storage/' in request.url.path:
            photos.clear()
            return httpx.Response(200, json=[])
        auth_calls += 1
        return httpx.Response(500 if auth_calls == 1 else 200, json={})
    with client_for(handler) as client:
        assert client.request('DELETE', '/api/v1/me', json={'confirmation': 'SUPPRIMER'}).status_code == 503
        assert client.request('DELETE', '/api/v1/me', json={'confirmation': 'SUPPRIMER'}).status_code == 204
    assert auth_calls == 2 and not photos


def test_legacy_service_role_key_keeps_its_bearer_header():
    service = AccountDeletion('https://example.supabase.co', 'eyJ.legacy-service-role.test')
    service.client.close()
    def provider(request):
        assert request.headers['authorization'] == 'Bearer eyJ.legacy-service-role.test'
        assert request.headers['apikey'] == 'eyJ.legacy-service-role.test'
        return httpx.Response(200, json=[] if request.method == 'POST' else {})
    service.client = httpx.Client(transport=httpx.MockTransport(provider))
    try:
        service.delete(USER.id)
    finally:
        service.close()
