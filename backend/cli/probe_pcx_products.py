"""Essai borné PC Express, sans modification du catalogue ou des reçus."""
import argparse
from datetime import date, datetime, timezone
import json
import os
from pathlib import Path
import re
import time
from zoneinfo import ZoneInfo

import httpx

from backend.app.catalog.formats import validated_barcode

BASE = 'https://api.pcexpress.ca/pcx-bff/api/v1/products/'


def summarize(payload: dict, product_id: str, receipt_code: str) -> dict:
    """Conserver toutes les offres et qualifier le rapprochement du code OCR."""
    if not isinstance(payload, dict) or payload.get('code') != product_id:
        raise ValueError('Identifiant produit absent ou différent de la demande.')
    offers = payload.get('offers')
    if not isinstance(offers, list) or not all(isinstance(o, dict) for o in offers):
        raise ValueError('Offres absentes ou invalides.')
    gtin = validated_barcode(payload.get('gtin'))
    # Hypothèse observée sur le paprika : UPC sans chiffre de contrôle sur reçu.
    body_matches = bool(gtin and len(receipt_code) == 11
                        and gtin.zfill(14)[:2] == '00'
                        and gtin.zfill(14)[2:-1] == receipt_code)
    return {
        'product_id': product_id,
        'name': payload.get('name'), 'brand': payload.get('brand'),
        'package_size': payload.get('packageSize'), 'gtin': gtin,
        'receipt_code_matches_upc_body': body_matches,
        'matching_requires_review': True,
        'offers': offers, 'pricing_units': payload.get('pricingUnits'),
        'link': payload.get('link'),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mapping', type=Path,
                        default=Path('backend/config/catalog/pcx_receipt_pilot.json'))
    parser.add_argument('--store-id', default='8661')
    parser.add_argument('--date', type=date.fromisoformat,
                        default=datetime.now(ZoneInfo('America/Toronto')).date())
    parser.add_argument('--output-dir', type=Path, required=True)
    args = parser.parse_args()
    key = os.environ.get('PCX_API_KEY', '').strip()
    if not key:
        parser.error('Définir PCX_API_KEY dans l’environnement (jamais dans le dépôt).')
    if not re.fullmatch(r'\d+', args.store_id):
        parser.error('Identifiant magasin invalide.')
    rows = json.loads(args.mapping.read_text(encoding='utf-8'))
    if not isinstance(rows, list) or not 1 <= len(rows) <= 10:
        parser.error('Le pilote doit contenir entre 1 et 10 produits.')
    for row in rows:
        if not re.fullmatch(r'\d{11}', row.get('receipt_code', '')):
            parser.error('Code reçu invalide pour ce pilote.')
        if row.get('product_id') and not re.fullmatch(r'\d+_(EA|KG)', row['product_id']):
            parser.error('Identifiant produit invalide.')
    # Dossier neuf : les captures existantes ne sont jamais écrasées.
    args.output_dir.mkdir(parents=True, exist_ok=False)
    params = {'lang': 'fr', 'date': args.date.strftime('%d%m%Y'),
              'pickupType': 'STORE', 'storeId': args.store_id, 'banner': 'maxi'}
    headers = {'accept': 'application/json', 'origin': 'https://www.maxi.ca',
               'referer': 'https://www.maxi.ca/', 'site-banner': 'maxi',
               'business-user-agent': 'PCXWEB', 'x-application-type': 'Web',
               'x-loblaw-tenant-id': 'ONLINE_GROCERIES', 'x-apikey': key}
    report = {'experimental': True, 'store_id_requested': args.store_id,
              'requested_date': args.date.isoformat(),
              'receipt_purchase_date': '2026-10-03',
              'collected_at': datetime.now(timezone.utc).isoformat(), 'items': []}
    with httpx.Client(timeout=20, follow_redirects=False) as client:
        for row in rows:
            item = dict(row)
            product_id = row.get('product_id')
            try:
                if not product_id:
                    # Accès public uniquement ; pas de clé PCX envoyée au site Maxi.
                    response = client.get('https://www.maxi.ca/fr/search', params={
                        'search-bar': row['receipt_code'], 'storeId': args.store_id})
                    item.update(status='needs_product_id',
                                search_http_status=response.status_code,
                                search_url=str(response.url))
                else:
                    response = client.get(BASE + product_id, params=params, headers=headers)
                    item.update(http_status=response.status_code, source_url=str(response.url))
                    if response.status_code == 200:
                        payload = response.json()
                        item['product'] = summarize(payload, product_id, row['receipt_code'])
                        raw_path = args.output_dir / f'{product_id}.raw.json'
                        raw_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2),
                                            encoding='utf-8')
                        item.update(status='retrieved', raw_file=raw_path.name)
                    else:
                        item['status'] = 'http_error'
            except httpx.RequestError:
                item['status'] = 'network_error'
            except ValueError:
                item['status'] = 'invalid_response'
            report['items'].append(item)
            print(f"{row['receipt_code']}: {item['status']}")
            time.sleep(1)
    (args.output_dir / 'report.json').write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    return 0 if all(i['status'] == 'retrieved' for i in report['items']) else 1


if __name__ == '__main__':
    raise SystemExit(main())
