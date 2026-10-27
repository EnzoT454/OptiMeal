"""Circulaires de la semaine : PDF → images JPEG → Storage Supabase → table public.circular.

L'import se fait par un script serveur (backend.cli.import_circulars) avec la clé secrète.
L'app ne lit que GET /api/v1/circulars, qui renvoie des liens publics vers les images.
"""
from datetime import date, datetime
from pathlib import Path

import httpx
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.common.contracts import ContractModel, Retailer

from .models import Circular

BUCKET = 'circulars'
PAGE_WIDTH = 1200          # largeur des images en pixels : lisible sur téléphone, léger à charger
JPEG_QUALITY = 80
MAX_PAGE_BYTES = 5 * 1024 * 1024   # même limite que le bucket des photos de recettes


class CircularRead(ContractModel):
    retailer: Retailer
    valid_from: date
    valid_to: date
    page_count: int = Field(ge=1)
    pages: list[str]             # liens publics des pages, dans l'ordre
    imported_at: datetime


def page_name(number: int) -> str:
    return f'p{number:02d}.jpg'


def public_url(supabase_url: str, path: str) -> str:
    return f'{supabase_url.rstrip("/")}/storage/v1/object/public/{BUCKET}/{path}'


def circular_read(row: Circular, supabase_url: str) -> CircularRead:
    pages = [public_url(supabase_url, f'{row.storage_prefix}/{page_name(n)}') for n in range(1, row.page_count + 1)]
    return CircularRead(retailer=row.retailer, valid_from=row.valid_from, valid_to=row.valid_to,
                        page_count=row.page_count, pages=pages, imported_at=row.imported_at)


def circulars_from_database(db: Session, supabase_url: str) -> list[CircularRead]:
    return [circular_read(row, supabase_url) for row in db.scalars(select(Circular).order_by(Circular.retailer))]


def pdf_to_jpegs(path: Path) -> list[bytes]:
    """Une image JPEG par page du PDF. Aucune connexion : tout se fait sur l'ordinateur."""
    import pymupdf  # importé ici : l'API n'en a pas besoin, seulement le script d'import

    pages = []
    with pymupdf.open(path) as document:
        if document.page_count == 0:
            raise ValueError(f'{path.name} ne contient aucune page.')
        for page in document:
            zoom = PAGE_WIDTH / page.rect.width
            image = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False)
            data = image.tobytes('jpeg', jpg_quality=JPEG_QUALITY)
            if len(data) > MAX_PAGE_BYTES:
                raise ValueError(f'Page {page.number + 1} de {path.name} trop lourde ({len(data)} octets).')
            pages.append(data)
    return pages


class Storage:
    """Petit client de l'API Storage de Supabase (envoi, liste, suppression)."""

    def __init__(self, supabase_url: str, secret_key: str):
        self.client = httpx.Client(
            base_url=supabase_url.rstrip('/') + '/storage/v1',
            headers={'apikey': secret_key, 'Authorization': f'Bearer {secret_key}'},
            timeout=60,
        )

    def upload(self, path: str, data: bytes) -> None:
        response = self.client.post(f'/object/{BUCKET}/{path}', content=data, headers={
            'Content-Type': 'image/jpeg', 'x-upsert': 'true', 'cache-control': '3600',
        })
        response.raise_for_status()

    def list_files(self, prefix: str) -> list[str]:
        response = self.client.post(f'/object/list/{BUCKET}', json={'prefix': prefix, 'limit': 1000, 'offset': 0})
        response.raise_for_status()
        return [f'{prefix}/{item["name"]}' for item in response.json() if item.get('id')]

    def delete(self, paths: list[str]) -> None:
        if paths:
            response = self.client.request('DELETE', f'/object/{BUCKET}', json={'prefixes': paths})
            response.raise_for_status()

    def close(self) -> None:
        self.client.close()