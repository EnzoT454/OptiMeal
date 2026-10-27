"""Circulaires : migration, conversion PDF → JPEG, liens publics et erreurs, sans réseau."""
from datetime import date, datetime, timezone
import io

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
import pytest

from backend.app.catalog.circulars import circular_read, pdf_to_jpegs
from backend.app.catalog.models import Circular
from backend.app.common.public_data import ROOT
from backend.app.main import create_app
from backend.cli import import_circulars as cli


def test_offline_migration_creates_circular_with_rls(monkeypatch):
    monkeypatch.setenv('DATABASE_URL', '')
    config = Config(str(ROOT / 'backend/alembic.ini'))
    config.output_buffer = output = io.StringIO()
    command.upgrade(config, '0005_catalog_offers:0006_circulars', sql=True)
    sql = output.getvalue()
    assert 'CREATE TABLE public.circular' in sql
    assert 'ALTER TABLE public.circular ENABLE ROW LEVEL SECURITY' in sql
    assert 'DROP' not in sql


def test_circular_pages_are_public_storage_links():
    row = Circular(retailer='maxi', valid_from=date(2026, 10, 23), valid_to=date(2026, 10, 29), page_count=2,
                   storage_prefix='maxi/20261027-094200', imported_at=datetime(2026, 10, 27, tzinfo=timezone.utc))
    item = circular_read(row, 'https://exemple.supabase.co/')
    assert item.pages == [
        'https://exemple.supabase.co/storage/v1/object/public/circulars/maxi/20261027-094200/p01.jpg',
        'https://exemple.supabase.co/storage/v1/object/public/circulars/maxi/20261027-094200/p02.jpg',
    ]


def test_pdf_pages_become_jpeg_images(tmp_path):
    pymupdf = pytest.importorskip('pymupdf')
    path = tmp_path / 'circulaire.pdf'
    with pymupdf.open() as document:
        for _ in range(3):
            document.new_page().insert_text((72, 72), 'Aubaines de la semaine')
        document.save(path)
    pages = pdf_to_jpegs(path)
    assert len(pages) == 3
    assert all(page.startswith(b'\xff\xd8') for page in pages)  # signature JPEG


@pytest.mark.parametrize('arguments,message', [
    (['--from', '2026-10-29', '--to', '2026-10-23'], 'date de fin'),
    (['--from', '2026-10-23', '--to', '2026-10-29', '--input', 'data/circulars/absente.pdf'], 'Import impossible'),
])
def test_cli_rejects_bad_input_before_any_connection(monkeypatch, capsys, arguments, message):
    monkeypatch.setattr(cli, 'Database', lambda *args: pytest.fail('Aucune connexion avant validation'))
    monkeypatch.setattr(cli, 'Storage', lambda *args: pytest.fail('Aucun envoi avant validation'))
    assert cli.main(['--retailer', 'maxi', *arguments]) == 1
    assert message in capsys.readouterr().err


def test_circulars_without_database_return_503(monkeypatch):
    monkeypatch.setenv('DATABASE_URL', '')
    monkeypatch.setenv('OFFERS_SOURCE', 'json')
    with TestClient(create_app()) as client:
        response = client.get('/api/v1/circulars')
    assert response.status_code == 503
    assert response.json()['error']['code'] == 'DATABASE_UNAVAILABLE'


@pytest.mark.parametrize('day,expected', [
    (date(2026, 10, 27), (date(2026, 10, 22), date(2026, 10, 28))),   # mardi → jeudi 22 au mercredi 28
    (date(2026, 10, 22), (date(2026, 10, 22), date(2026, 10, 28))),   # jeudi : la nouvelle semaine commence
    (date(2026, 10, 28), (date(2026, 10, 22), date(2026, 10, 28))),   # mercredi : dernier jour
])
def test_default_week_is_thursday_to_wednesday(day, expected):
    assert cli.circular_week(None, None, day) == expected


def test_one_date_gives_a_seven_day_week():
    assert cli.circular_week(date(2026, 10, 22), None) == (date(2026, 10, 22), date(2026, 10, 28))
    assert cli.circular_week(None, date(2026, 10, 28)) == (date(2026, 10, 22), date(2026, 10, 28))