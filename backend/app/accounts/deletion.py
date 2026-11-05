"""Suppression du compte connecté via les API administratives Supabase.

Les photos des recettes publiques sont conservées sous une clé serveur avant
le nettoyage du dossier personnel. Auth supprime ensuite le compte ; PostgreSQL
détache ses recettes publiques et supprime les données privées par cascade.
Ces deux services ne partagent pas de transaction : un échec Auth peut laisser
le compte présent avec des photos déjà supprimées. La requête peut être rejouée.
"""
from uuid import UUID
from hashlib import sha256
from urllib.parse import unquote

import httpx
from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from .models import Profile
from .service import ensure_profile
from backend.app.recipes.models import Recipe
from backend.app.security import CurrentUser

BUCKET = 'recipes-images'
PAGE_SIZE = 100


def unavailable(*, started: bool = False) -> HTTPException:
    return HTTPException(503, detail={
        'code': 'ACCOUNT_DELETION_UNAVAILABLE',
        'message': (
            'Suppression interrompue. Certaines photos peuvent déjà avoir été supprimées. '
            'Réessaie ; si la connexion est refusée, le compte a peut-être déjà été supprimé.'
            if started else 'Suppression du compte indisponible. Réessaie plus tard.'
        ),
    })


class AccountDeletion:
    def __init__(self, url: str | None, secret_key: str | None):
        self.url = (url or '').rstrip('/')
        self.key = secret_key
        self.client = httpx.Client(timeout=10, follow_redirects=False)

    def close(self) -> None:
        self.client.close()

    def delete(self, user_id: UUID, db: Session | None = None) -> None:
        if not self.url.startswith('https://') or not self.key:
            raise unavailable()
        # Identité issue du jeton vérifié, jamais d'un identifiant envoyé par le mobile.
        prefix = f'users/{user_id}'
        headers = {'apikey': self.key}
        # Les nouvelles clés sb_secret_ ne sont pas des JWT. Le gateway utilise
        # apikey ; seul l'ancien service_role JWT doit aussi être envoyé en Bearer.
        if not self.key.startswith('sb_secret_'):
            headers['Authorization'] = f'Bearer {self.key}'
        started = False
        try:
            if db is not None:
                # Bloquer les nouvelles publications et modifications avant de
                # préparer les photos ; une interruption reste rejouable.
                ensure_profile(db, CurrentUser(user_id, None))
                db.execute(select(Profile.id).where(Profile.id == user_id).with_for_update()).one()
                db.execute(update(Profile).where(Profile.id == user_id).values(deletion_pending=True))
                db.commit()
                self._preserve_public_photos(db, user_id, headers)
            files = self._files(prefix, headers)
            for offset in range(0, len(files), PAGE_SIZE):
                started = True
                response = self.client.request(
                    'DELETE', f'{self.url}/storage/v1/object/{BUCKET}',
                    headers=headers, json={'prefixes': files[offset:offset + PAGE_SIZE]},
                )
                response.raise_for_status()
            started = True
            response = self.client.request(
                'DELETE', f'{self.url}/auth/v1/admin/users/{user_id}',
                headers=headers, json={'should_soft_delete': False},
            )
            response.raise_for_status()
        except (httpx.HTTPError, SQLAlchemyError, ValueError, TypeError, KeyError):
            if db is not None:
                db.rollback()
            raise unavailable(started=started) from None

    def _preserve_public_photos(self, db: Session, user_id: UUID, headers: dict[str, str]) -> None:
        """Copier les photos publiques sous une clé serveur sans identifiant du compte.

        Supabase refuse de supprimer un compte qui possède encore des objets.
        Les originaux seront nettoyés après la sauvegarde des nouvelles URL.
        Les destinations déterministes permettent de reprendre après un échec.
        """
        prefix = f'{self.url}/storage/v1/object/public/{BUCKET}/users/{user_id}/'
        recipes = db.execute(select(Recipe.id, Recipe.image_url).where(
            Recipe.owner_id == user_id, Recipe.visibility == 'public')).all()
        for recipe in recipes:
            if not recipe.image_url or not recipe.image_url.startswith(prefix):
                continue
            filename = unquote(recipe.image_url[len(prefix):])
            if not filename or any(part in ('', '.', '..') for part in filename.split('/')) or '\\' in filename or '?' in filename or '#' in filename:
                raise ValueError('Invalid recipe image path')
            response = self.client.get(recipe.image_url)
            response.raise_for_status()
            if len(response.content) > 5 * 1024 * 1024:
                raise ValueError('Recipe image too large')
            content_type = response.headers.get('content-type', '').split(';')[0].strip().lower()
            extension = {'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp'}.get(content_type)
            if extension is None:
                raise ValueError('Invalid recipe image type')
            digest = sha256(recipe.image_url.encode()).hexdigest()
            destination = f'community/{recipe.id}/{digest}.{extension}'
            uploaded = self.client.post(f'{self.url}/storage/v1/object/{BUCKET}/{destination}',
                                       headers={**headers, 'Content-Type': content_type, 'x-upsert': 'true'},
                                       content=response.content)
            uploaded.raise_for_status()
            url = f'{self.url}/storage/v1/object/public/{BUCKET}/{destination}'
            db.execute(update(Recipe).where(Recipe.id == recipe.id).values(image_url=url))
        db.commit()

    def _files(self, prefix: str, headers: dict[str, str]) -> list[str]:
        """Lister aussi les photos détachées d'une recette et les sous-dossiers.

        Valider les noms avant tout DELETE, pour ne jamais sortir du dossier
        du propriétaire, même en cas de réponse Storage mal formée.
        """
        files: list[str] = []
        folders = [(prefix, 0)]
        while folders:
            folder, depth = folders.pop()
            if depth > 20:
                raise ValueError('Unexpected folder depth')
            offset = 0
            while True:
                response = self.client.post(
                    f'{self.url}/storage/v1/object/list/{BUCKET}', headers=headers,
                    json={'prefix': folder + '/', 'limit': PAGE_SIZE, 'offset': offset,
                          'sortBy': {'column': 'name', 'order': 'asc'}},
                )
                response.raise_for_status()
                rows = response.json()
                if not isinstance(rows, list):
                    raise ValueError('Invalid object list')
                for row in rows:
                    if not isinstance(row, dict):
                        raise ValueError('Invalid object')
                    name = row['name']
                    if not isinstance(name, str) or not name or name in ('.', '..') or '/' in name or '\\' in name:
                        raise ValueError('Invalid object name')
                    path = f'{folder}/{name}'
                    if row.get('id'):
                        files.append(path)
                    else:
                        folders.append((path, depth + 1))
                if len(rows) < PAGE_SIZE:
                    break
                offset += PAGE_SIZE
        return files
