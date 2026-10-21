"""Cycle de vie PostgreSQL et contrôles HTTP, sans connexion externe."""
from contextlib import contextmanager
import os
import subprocess
import sys
from unittest.mock import Mock

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.exc import ArgumentError, OperationalError
from sqlalchemy.pool import StaticPool

from backend.app import database
from backend.app.config import Settings, load_settings
from backend.app.main import create_app

TEST_URL = 'postgresql+psycopg://test:private-test-value@localhost:5432/test'


def test_import_does_not_require_or_load_database_credentials():
    env = dict(os.environ)
    env.pop('DATABASE_URL', None)
    result = subprocess.run([
        sys.executable, '-c',
        "import os; import backend.app.main; assert 'DATABASE_URL' not in os.environ",
    ], env=env, capture_output=True, text=True, timeout=15)
    assert result.returncode == 0, result.stderr


def test_settings_read_dotenv_without_mutating_environment(tmp_path, monkeypatch):
    path = tmp_path / '.env'
    path.write_text('DATABASE_URL=' + TEST_URL + '\n', encoding='utf-8')
    monkeypatch.delenv('DATABASE_URL', raising=False)
    assert load_settings(path).database_url == TEST_URL
    assert 'DATABASE_URL' not in os.environ
    assert 'private-test-value' not in repr(load_settings(path))
    monkeypatch.setenv('DATABASE_URL', '')
    assert load_settings(path).database_url is None
    monkeypatch.setenv('DATABASE_URL', TEST_URL + '_other')
    assert load_settings(path).database_url == TEST_URL + '_other'
    monkeypatch.delenv('DATABASE_URL')
    assert load_settings(None).database_url is None


@pytest.mark.parametrize('url', [None, '', 'not a database URL', 'sqlite://',
                               'postgresql+unknown://user:private-test-value@localhost/test'])
def test_missing_or_invalid_database_does_not_block_json_routes(url):
    with TestClient(create_app(settings=Settings(database_url=url))) as client:
        assert client.get('/health').json() == {'status': 'ok'}
        response = client.get('/health/db')
        assert response.status_code == 503
        assert response.json() == {'detail': 'Database unavailable'}
        assert 'private-test-value' not in response.text
        assert client.get('/api/v1/recipes').status_code == 503
        assert client.get('/api/v1/recipes').json()['error']['code'] == 'RECIPES_UNAVAILABLE'
        assert client.get('/api/v1/offers').json()['total'] == 93


def test_absent_database_creates_no_engine(monkeypatch):
    monkeypatch.setattr(database, 'create_engine', lambda *args, **kwargs: pytest.fail('Aucun moteur attendu'))
    with TestClient(create_app(settings=Settings())) as client:
        assert client.app.state.database.engine is None
        assert client.get('/health/db').status_code == 503


def test_engine_configuration_errors_are_sanitized(monkeypatch):
    def invalid(*args, **kwargs):
        raise ArgumentError('private-test-value')

    monkeypatch.setattr(database, 'create_engine', invalid)
    with TestClient(create_app(settings=Settings(database_url=TEST_URL))) as client:
        assert client.get('/health').status_code == 200
        response = client.get('/health/db')
        assert response.status_code == 503
        assert 'private-test-value' not in response.text


def test_real_sql_execution_closes_session_and_disposes_engine(monkeypatch):
    # SQLite sert uniquement à exercer le cycle SQLAlchemy sans réseau.
    # L'application reste configurée pour PostgreSQL et son pilote Psycopg.
    engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    dispose = Mock(wraps=engine.dispose)
    monkeypatch.setattr(engine, 'dispose', dispose)
    factory = Mock(return_value=engine)
    monkeypatch.setattr(database, 'create_engine', factory)
    checkins = []
    event.listen(engine, 'checkin', lambda *args: checkins.append(True))
    app = create_app(settings=Settings(database_url=TEST_URL.replace('+psycopg', '')))
    with TestClient(app) as client:
        # Initialiser l'application ne contacte pas la base.
        assert not checkins
        response = client.get('/health/db')
        assert response.status_code == 200
        assert response.json() == {'status': 'ok', 'database': 'reachable'}
        assert len(checkins) == 1
        assert factory.call_args.args[0].drivername == 'postgresql+psycopg'
        assert factory.call_args.kwargs['pool_pre_ping'] is True
        assert factory.call_args.kwargs['connect_args']['connect_timeout'] == 10
        dispose.assert_not_called()
    dispose.assert_called_once()
    assert app.state.database.session_factory is None


@pytest.mark.parametrize('failure', ['connection', 'unexpected_result'])
def test_unreachable_database_and_invalid_result_return_503_and_close_session(failure):
    closed = []
    session = Mock()
    if failure == 'connection':
        session.execute.side_effect = OperationalError(None, None, Exception('private-test-value'))
    else:
        session.execute.return_value.scalar_one.return_value = 2

    @contextmanager
    def session_factory():
        try:
            yield session
        finally:
            closed.append(True)

    with TestClient(create_app(settings=Settings())) as client:
        client.app.state.database.session_factory = session_factory
        response = client.get('/health/db')
        assert response.status_code == 503
        assert response.json() == {'detail': 'Database unavailable'}
        assert 'private-test-value' not in response.text
        assert closed == [True]
        assert client.get('/health').status_code == 200
        assert client.get('/api/v1/offers').status_code == 200


def test_engine_is_disposed_if_startup_fails(tmp_path, monkeypatch):
    engine = Mock()
    monkeypatch.setattr(database, 'create_engine', Mock(return_value=engine))
    path = tmp_path / 'invalid-catalog.json'
    path.write_text('{}', encoding='utf-8')
    with pytest.raises(ValueError):
        with TestClient(create_app(settings=Settings(database_url=TEST_URL, catalog_import_path=str(path)))):
            pass
    engine.dispose.assert_called_once()


def test_application_database_state_is_not_shared():
    with TestClient(create_app(settings=Settings())) as first:
        with TestClient(create_app(settings=Settings())) as second:
            assert first.app.state.database is not second.app.state.database
