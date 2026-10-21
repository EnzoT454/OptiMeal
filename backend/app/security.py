"""Validation distante des access tokens par Supabase Auth ; aucun mot de passe local."""
from dataclasses import dataclass
from uuid import UUID

import httpx
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class CurrentUser:
    id: UUID
    email: str | None


def auth_error(status: int = 401) -> HTTPException:
    return HTTPException(status, detail={
        'code': 'AUTH_REQUIRED' if status == 401 else 'AUTH_UNAVAILABLE',
        'message': 'Connexion requise ou session expirée.' if status == 401 else 'Authentification indisponible.',
    }, headers={'WWW-Authenticate': 'Bearer'} if status == 401 else None)


class SupabaseAuth:
    def __init__(self, url: str | None, key: str | None):
        self.url = (url or '').rstrip('/')
        self.key = key
        self.client = httpx.Client(timeout=10, follow_redirects=False)

    def close(self) -> None:
        self.client.close()

    def validate(self, token: str) -> CurrentUser:
        if not self.url.startswith('https://') or not self.key:
            raise auth_error(503)
        try:
            response = self.client.get(self.url + '/auth/v1/user', headers={
                'apikey': self.key, 'Authorization': 'Bearer ' + token,
            })
        except httpx.HTTPError:
            raise auth_error(503) from None
        if response.status_code in (401, 403):
            raise auth_error()
        if response.status_code != 200:
            raise auth_error(503)
        try:
            data = response.json()
            if data.get('role') != 'authenticated' or data.get('is_anonymous') or not data.get('email_confirmed_at'):
                raise auth_error()
            email = data.get('email')
            if email is not None and not isinstance(email, str):
                raise ValueError('Invalid identity response')
            return CurrentUser(id=UUID(data['id']), email=email)
        except (ValueError, KeyError, TypeError, AttributeError):
            raise auth_error(503) from None


def optional_user(request: Request, credentials: HTTPAuthorizationCredentials | None = Depends(bearer)) -> CurrentUser | None:
    if credentials is None:
        if request.headers.get('Authorization'):
            raise auth_error()
        return None
    return request.app.state.auth.validate(credentials.credentials)


def current_user(user: CurrentUser | None = Depends(optional_user)) -> CurrentUser:
    if user is None:
        raise auth_error()
    return user
