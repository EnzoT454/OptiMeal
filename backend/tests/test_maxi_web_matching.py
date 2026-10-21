from datetime import date
import json

import httpx
import pytest

from backend.app.price_sources.pcx_products import PCXProducts, product_id_from_url
from backend.app.receipts.web_matching import (
    ReceiptWebInput, prepare, read_inputs, update, write_json_atomic,
)


def input_row(**overrides):
    return ReceiptWebInput(**{
        'product_code': '06038318557', 'name': 'PC PAPRIKA', 'prix_extrait': '6.00',
        'url': 'https://www.maxi.ca/fr/paprika/p/21117318_EA?storeId=8661&cartId=ignored',
        'store_id': '8661', 'source_receipt': 'receipt.json', 'line_id': 1,
        **overrides,
    })


def payload(**overrides):
    return {'code': '21117318_EA', 'name': 'Paprika', 'brand': 'PC',
            'packageSize': '48 g', 'gtin': '00060383185572',
            'offers': [{'price': {'value': 6, 'unit': 'ch', 'quantity': 1,
                                   'type': 'REGULAR'}}], **overrides}


def client(handler):
    return PCXProducts(httpx.Client(transport=httpx.MockTransport(handler)), 'test-key')


def receipt(path, purchase_date, price):
    write_json_atomic(path, {
        'retailer': 'maxi', 'store_id': '8661', 'purchase_date': purchase_date,
        'date_order': 'ymd', 'source': {'filename': 'receipt.jpg', 'sha256': 'a' * 64,
                                      'engine': 'vision', 'elapsed_seconds': 1},
        'items': [{'line_id': 1, 'product_code': '06038318557', 'name': 'PC PAPRIKA',
                   'line_total': price, 'source_lines': ['receipt line']}],
        'totals': {'items_sum': price, 'arithmetic_status': 'unverifiable'},
        'unparsed_lines': [], 'warnings': [],
    })


def test_prepare_deduplicates_keeps_latest_receipt_and_manual_url(tmp_path):
    newer, older, output = [tmp_path / n for n in ('new.json', 'old.json', 'input.json')]
    receipt(newer, '2026-10-03', '6.00')
    receipt(older, '2026-09-27', '5.00')
    prepare([newer, older, newer], output)
    rows = read_inputs(output)
    assert len(rows) == 1
    assert str(rows[0].prix_extrait) == '6.00'
    rows[0].url = input_row().url
    write_json_atomic(output, [r.model_dump(mode='json') for r in rows])
    prepare([older], output)
    assert read_inputs(output)[0].url == input_row().url


def test_url_only_accepts_maxi_product_not_external_or_credentials():
    assert product_id_from_url(input_row().url) == '21117318_EA'
    for url in ('https://evil.example/fr/paprika/p/21117318_EA',
                'https://www.maxi.ca@evil.example/fr/paprika/p/21117318_EA',
                'https://www.maxi.ca/fr/search?search-bar=06038318557'):
        with pytest.raises(ValueError):
            product_id_from_url(url)


def test_update_preserves_added_date_and_isolates_store(tmp_path):
    output = tmp_path / 'matches.json'

    def handler(request):
        assert request.url.params['storeId'] in ('8661', '9999')
        assert request.url.params['date'] == '06102026'
        assert request.headers['x-apikey'] == 'test-key'
        return httpx.Response(200, json=payload())

    update([input_row(), input_row(store_id='9999')], output, client(handler),
           date(2026, 10, 6), delay=0)
    before = json.loads(output.read_text())
    assert len(before) == 2
    assert before[0]['prix_web'] == '6.00'
    assert '?' not in before[0]['url']
    update([input_row()], output, client(handler), date(2026, 10, 6), delay=0)
    after = json.loads(output.read_text())
    assert after[0]['date_ajout'] == before[0]['date_ajout']
    assert after[0]['last_update'] > before[0]['last_update']
    assert after[1] == before[1]


@pytest.mark.parametrize('response', [
    httpx.Response(403),
    httpx.Response(200, text='not-json'),
    httpx.Response(200, json=payload(gtin='00057000034603')),
    httpx.Response(200, json=payload(code='other')),
    httpx.Response(200, json=payload(offers=[])),
    httpx.Response(200, json=payload(offers=[{}, {}])),
    httpx.Response(200, json=payload(offers=[{'price': {'value': -1}}])),
])
def test_failed_update_does_not_replace_previous_data(tmp_path, response):
    output = tmp_path / 'matches.json'
    update([input_row()], output, client(lambda r: httpx.Response(200, json=payload())),
           date(2026, 10, 6), delay=0)
    before = json.loads(output.read_text())
    report = update([input_row()], output, client(lambda r: response),
                    date(2026, 10, 7), delay=0)
    assert report['items'][0]['status'] == 'failed'
    assert json.loads(output.read_text()) == before


def test_missing_url_does_not_make_request_and_timeout_is_reported(tmp_path):
    def handler(request):
        raise httpx.ReadTimeout('sensitive provider text', request=request)

    report = update([input_row(url='')], tmp_path / 'matches.json', client(handler),
                    date(2026, 10, 6), delay=0)
    assert report['items'][0]['status'] == 'missing_url'
    report = update([input_row()], tmp_path / 'matches.json', client(handler),
                    date(2026, 10, 6), delay=0)
    assert report['items'][0]['error'] == 'network_error'
