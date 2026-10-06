"""Client Apify borné. Le POST facturable n'est jamais retenté automatiquement."""
import asyncio
import re

import httpx

BASE = 'https://api.apify.com/v2'
ACTOR = 'sunny_eternity~loblaws-grocery-scraper'


class ApifyError(ValueError):
    pass


def resource_id(value: str) -> str:
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,100}', value):
        raise ApifyError('Identifiant Apify invalide.')
    return value


class ApifyClient:
    def __init__(self, http: httpx.AsyncClient, token: str):
        if not token or not token.strip():
            raise ApifyError('APIFY_TOKEN doit être défini dans l’environnement.')
        self.http, self.token = http, token

    async def request(self, method: str, path: str, **kwargs):
        try:
            response = await self.http.request(
                method, BASE + path, headers={'Authorization': f'Bearer {self.token}'},
                follow_redirects=False, **kwargs)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as exc:
            # Ne pas afficher le corps fournisseur ni les en-têtes contenant le secret.
            raise ApifyError(f'Apify HTTP {exc.response.status_code}.') from None
        except (httpx.RequestError, ValueError):
            raise ApifyError('Apify : réponse invalide ou réseau indisponible.') from None

    async def start(self, actor_input: dict, max_items: int, max_charge: float) -> dict:
        payload = await self.request('POST', f'/acts/{ACTOR}/runs', json=actor_input,
                                     params={'timeout': 300, 'maxItems': max_items,
                                             'maxTotalChargeUsd': max_charge})
        return self.run_data(payload)

    @staticmethod
    def run_data(payload) -> dict:
        if not isinstance(payload, dict) or not isinstance(payload.get('data'), dict):
            raise ApifyError('Métadonnées de run invalides.')
        data = payload['data']
        resource_id(data.get('id'))
        if not isinstance(data.get('status'), str):
            raise ApifyError('Statut de run absent.')
        return data

    async def wait(self, run_id: str, polls: int = 65, interval: float = 5) -> dict:
        for _ in range(polls):
            data = self.run_data(await self.request('GET', f'/actor-runs/{resource_id(run_id)}'))
            if data['status'] == 'SUCCEEDED':
                return data
            if data['status'] in ('FAILED', 'TIMED-OUT', 'ABORTED'):
                raise ApifyError(f"Run {run_id} terminé : {data['status']}.")
            await asyncio.sleep(interval)
        raise ApifyError(f'Attente dépassée ; reprendre le run {run_id}, sans relancer de collecte.')

    async def items(self, dataset_id: str, max_items: int, on_page) -> list:
        rows = []
        while len(rows) < max_items:
            limit = min(100, max_items - len(rows))
            page = await self.request('GET', f'/datasets/{resource_id(dataset_id)}/items',
                                      params={'format': 'json', 'offset': len(rows), 'limit': limit})
            if not isinstance(page, list) or len(page) > limit:
                raise ApifyError('Page du dataset invalide.')
            rows.extend(page)
            on_page(rows)
            if len(page) < limit:
                break
        return rows
