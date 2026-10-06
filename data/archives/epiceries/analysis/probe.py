"""Bounded read-only API probe. Stores responses for offline inspection.

No authentication, user data, PDF or receipt is sent. No catalogue crawling.
"""
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

BASE = 'https://epiceries.ca/api'
OUT = Path(__file__).parent / 'responses'


def main():
    OUT.mkdir(exist_ok=True)
    calls = []

    def fetch(label, **params):
        if calls:
            time.sleep(1)
        url = BASE + ('?' + urlencode(params) if params else '')
        start = time.monotonic()
        request = Request(url, headers={'User-Agent': 'OptiBuy-academic-feasibility/0.1', 'Accept': 'application/json'})
        try:
            response = urlopen(request, timeout=30)
        except HTTPError as error:
            response = error
        with response:
            status = response.status
            headers = dict(response.headers.items())
            payload = json.load(response)
        record = {'requested_at': datetime.now(timezone.utc).isoformat(),
                  'url': url, 'status': status, 'elapsed_seconds': round(time.monotonic()-start, 3),
                  'headers': headers, 'body': payload}
        (OUT / f'{label}.json').write_text(json.dumps(record, ensure_ascii=False, indent=2)+'\n')
        calls.append({'label': label, 'url': url, 'status': status, 'ok': payload.get('ok'),
                      'elapsed_seconds': record['elapsed_seconds']})
        print(label, status, 'ok=', payload.get('ok'), flush=True)
        return payload

    if '--targeted' in sys.argv:
        selected = []
        for label, params in [
            ('butter-category', dict(endpoint='search', category=10, q='Lactantia', limit=3)),
            ('milk-metro', dict(endpoint='search', category=7, store='metro', limit=3)),
            ('carrots-superc', dict(endpoint='search', category=1, q='carottes', store='superc', limit=3)),
            ('rice-maxi', dict(endpoint='search', category=26, store='maxi', limit=3)),
        ]:
            result = fetch(label, **params)
            rows = result.get('data', {}).get('results', [])
            if rows:
                selected.append((label, rows[0]['id'], rows[0]['store']))
        for label, identifier, store in selected:
            fetch('detail-'+label, endpoint='product', id=identifier)
        if selected:
            label, identifier, store = selected[0]
            fetch('history-targeted', endpoint='history', id=identifier, store=store, limit=5)
        fetch('storeproduct-example', endpoint='storeproduct', store='maxi', code='20021564_EA')
        (OUT / 'run-targeted.json').write_text(json.dumps(calls, ensure_ascii=False, indent=2)+'\n')
        print('Saved', len(calls), 'targeted responses', flush=True)
        return

    fetch('root')
    fetch('categories', endpoint='categories')
    queries = [('milk','lait'), ('butter','beurre Lactantia'), ('carrots','carottes')]
    ids = []
    for label, query in queries:
        result = fetch('search-'+label, endpoint='search', q=query, limit=3)
        rows = result.get('data', {}).get('results', [])
        if rows:
            ids.append((label, rows[0]['id']))
    for label, identifier in ids:
        product = fetch('product-'+label, endpoint='product', id=identifier)
        stores = [p['store'] for p in product.get('data', {}).get('prices', [])]
        print(label, identifier, 'stores=', stores, flush=True)
    if ids:
        label, identifier = ids[0]
        fetch('history-'+label, endpoint='history', id=identifier, limit=5)
    fetch('search-page2', endpoint='search', q='lait', limit=3, offset=3)
    fetch('error-missing-search-filter', endpoint='search')
    fetch('error-missing-product-id', endpoint='product')
    (OUT / 'run.json').write_text(json.dumps(calls, ensure_ascii=False, indent=2)+'\n')
    print('Saved', len(calls), 'responses to', OUT, flush=True)


if __name__ == '__main__':
    main()
