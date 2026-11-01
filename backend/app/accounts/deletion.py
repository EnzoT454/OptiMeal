"""Suppression du compte connecté via les API administratives Supabase.

Storage est nettoyé avant Auth, qui supprime les données métier par cascade.
Ces deux services ne partagent pas de transaction : un échec Auth peut laisser
le compte présent avec des photos déjà supprimées. La requête peut être rejouée.
"""
from uuid import UUID

import httpx
from fastapi import HTTPException

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

    def delete(self, user_id: UUID) -> None:
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
        except (httpx.HTTPError, ValueError, TypeError, KeyError):
            raise unavailable(started=started) from None

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
