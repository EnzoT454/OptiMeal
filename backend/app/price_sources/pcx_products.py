"""Lecture bornée des fiches Maxi PC Express, sans session utilisateur."""
from datetime import date
from decimal import Decimal
import json
import re
from urllib.parse import urlsplit

import httpx

BASE = 'https://api.pcexpress.ca/pcx-bff/api/v1/products/'


def product_id_from_url(url: str) -> str:
    parsed = urlsplit(url)
    match = re.fullmatch(r'/fr/[^/]+/p/(\d+_(?:EA|KG))/?', parsed.path)
    if (parsed.scheme != 'https' or parsed.netloc not in ('www.maxi.ca', 'maxi.ca')
            or not match or parsed.fragment):
        raise ValueError('URL de fiche Maxi française invalide.')
    return match[1]


class PCXError(ValueError):
    """Erreur fournisseur sans clé, cookies ou corps de réponse dans le message."""


class PCXProducts:
    def __init__(self, http: httpx.Client, key: str):
        if not key.strip():
            raise ValueError('Définir PCX_API_KEY dans l’environnement.')
        self.http = http
        self.headers = {
            'accept': 'application/json', 'origin': 'https://www.maxi.ca',
            'referer': 'https://www.maxi.ca/', 'site-banner': 'maxi',
            'business-user-agent': 'PCXWEB', 'x-application-type': 'Web',
            'x-loblaw-tenant-id': 'ONLINE_GROCERIES', 'x-apikey': key,
        }

    def fetch(self, product_id: str, store_id: str, requested_date: date) -> dict:
        if not re.fullmatch(r'\d+_(EA|KG)', product_id) or not re.fullmatch(r'\d+', store_id):
            raise ValueError('Identifiant produit ou magasin invalide.')
        try:
            response = self.http.get(BASE + product_id, headers=self.headers,
                                     params={'lang': 'fr', 'date': requested_date.strftime('%d%m%Y'),
                                             'pickupType': 'STORE', 'storeId': store_id,
                                             'banner': 'maxi'}, follow_redirects=False)
        except httpx.RequestError:
            raise PCXError('network_error') from None
        if response.status_code != 200:
            raise PCXError(f'http_{response.status_code}')
        try:
            payload = json.loads(response.text, parse_float=Decimal)
        except ValueError:
            raise PCXError('invalid_json') from None
        if not isinstance(payload, dict) or payload.get('code') != product_id:
            raise PCXError('unexpected_product_id')
        return payload
