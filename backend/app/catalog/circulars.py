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
# Android (Fresco, le moteur d'images de React Native) réduit toute image dont un côté dépasse 2048 px :
# une page de 2400 × 5334 était réduite 4 fois et le texte devenait flou au zoom.
# Donc : pages de 2048 px de large, et chaque page est aussi découpée en STRIPS bandes horizontales
# (environ 2048 × 1150 px) que l'app affiche collées les unes sous les autres, en pleine définition.
PAGE_WIDTH = 2048
STRIPS = 4                 # même valeur que STRIPS dans mobile/app/CircularScreen.tsx
MAX_SIDE = 2048            # plus grand côté qu'Android affiche sans réduire
JPEG_QUALITY = 85
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


def strip_name(number: int, strip: int) -> str:
    """Bande d'une page : p01-1.jpg … p01-4.jpg (de haut en bas)."""
    return f'p{number:02d}-{strip}.jpg'


def public_url(supabase_url: str, path: str) -> str:
    return f'{supabase_url.rstrip("/")}/storage/v1/object/public/{BUCKET}/{path}'


def circular_read(row: Circular, supabase_url: str) -> CircularRead:
    pages = [public_url(supabase_url, f'{row.storage_prefix}/{page_name(n)}') for n in range(1, row.page_count + 1)]
    return CircularRead(retailer=row.retailer, valid_from=row.valid_from, valid_to=row.valid_to,
                        page_count=row.page_count, pages=pages, imported_at=row.imported_at)


def circulars_from_database(db: Session, supabase_url: str) -> list[CircularRead]:
    return [circular_read(row, supabase_url) for row in db.scalars(select(Circular).order_by(Circular.retailer))]


def pdf_to_jpegs(path: Path) -> list[tuple[bytes, list[bytes]]]:
    """Pour chaque page du PDF : l'image entière (couverture, aperçu) et ses STRIPS bandes.

    Aucune connexion : tout se fait sur l'ordinateur.
    """
    import pymupdf  # importé ici : l'API n'en a pas besoin, seulement le script d'import

    def jpeg(page, matrix, clip=None) -> bytes:
        image = page.get_pixmap(matrix=matrix, clip=clip, alpha=False)
        if clip is not None and max(image.width, image.height) > MAX_SIDE:
            raise ValueError(f'Page {page.number + 1} de {path.name} trop haute : augmenter STRIPS.')
        data = image.tobytes('jpeg', jpg_quality=JPEG_QUALITY)
        if len(data) > MAX_PAGE_BYTES:
            raise ValueError(f'Page {page.number + 1} de {path.name} trop lourde ({len(data)} octets).')
        return data

    pages = []
    with pymupdf.open(path) as document:
        if document.page_count == 0:
            raise ValueError(f'{path.name} ne contient aucune page.')
        for page in document:
            zoom = PAGE_WIDTH / page.rect.width
            matrix = pymupdf.Matrix(zoom, zoom)
            r = page.rect
            strips = [jpeg(page, matrix, pymupdf.Rect(r.x0, r.y0 + r.height * k / STRIPS,
                                                       r.x1, r.y0 + r.height * (k + 1) / STRIPS))
                      for k in range(STRIPS)]
            pages.append((jpeg(page, matrix), strips))
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