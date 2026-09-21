"""Lecture à la demande, cache borné et débit limité par processus."""
import asyncio
from collections import OrderedDict
from dataclasses import dataclass
from datetime import datetime, timezone
from time import monotonic
from typing import Any

import httpx
from fastapi import HTTPException
from pydantic import BaseModel, ValidationError


@dataclass(frozen=True)
class Snapshot:
    data: dict[str, Any]
    retrieved_at: datetime
    url: str


class EpiceriesClient:
    def __init__(self, http: httpx.AsyncClient, enabled: bool = False,
                 interval: float = 1.0, ttl: float = 300):
        self.http = http
        self.enabled = enabled
        self.interval = interval
        self.ttl = ttl
        self.cache: OrderedDict = OrderedDict()
        self.lock = asyncio.Lock()
        self.last_request = -float('inf')

    async def get(self, endpoint: str, params: dict, schema: type[BaseModel]) -> tuple[Snapshot, bool]:
        if not self.enabled:
            raise HTTPException(503, 'Source désactivée : EPICERIES_ENABLED=true requis.')
        query = {'endpoint': endpoint, **{k: v for k, v in params.items() if v is not None}}
        key = tuple(sorted(query.items()))
        async with self.lock:
            cached = self.cache.get(key)
            if cached and monotonic() - cached[0] < self.ttl:
                self.cache.move_to_end(key)
                return cached[1], True
            await asyncio.sleep(max(0, self.interval - (monotonic() - self.last_request)))
            self.last_request = monotonic()
            try:
                response = await self.http.get('https://epiceries.ca/api', params=query)
                if response.status_code == 404:
                    raise HTTPException(404, 'Produit introuvable chez épiceries.ca.')
                if response.status_code == 429:
                    raise HTTPException(503, 'Quota fournisseur atteint. Réessayer plus tard.')
                response.raise_for_status()
                body = response.json()
                if not isinstance(body, dict) or body.get('ok') is not True:
                    raise ValueError('Enveloppe invalide')
                data = body['data']
                schema.model_validate(data)
            except httpx.TimeoutException as exc:
                raise HTTPException(504, 'Délai fournisseur dépassé.') from exc
            except httpx.HTTPError as exc:
                raise HTTPException(502, 'Fournisseur indisponible.') from exc
            except (ValueError, KeyError, TypeError, ValidationError) as exc:
                raise HTTPException(502, 'Réponse fournisseur invalide.') from exc
            snapshot = Snapshot(data, datetime.now(timezone.utc), str(response.url))
            self.cache[key] = (monotonic(), snapshot)
            self.cache.move_to_end(key)
            while len(self.cache) > 128:
                self.cache.popitem(last=False)
            return snapshot, False


def provenance(snapshot: Snapshot, cached: bool) -> dict:
    return {'name': 'épiceries.ca', 'type': 'epiceries_api', 'url': snapshot.url,
            'retrieved_at': snapshot.retrieved_at, 'cached': cached}
