"""Essais opt-in des photos locales : montants transcrits visuellement.

OPTIMEAL_RECEIPT_OCR_TESTS=1 python -m pytest backend/tests/test_receipt_samples.py -q
Les photos privées ne sont pas requises par la suite ordinaire ni par la CI.
"""
import json
import os
from decimal import Decimal
from pathlib import Path

import pytest

from backend.cli import extract_receipt

ROOT = Path(__file__).resolve().parents[2]
SAMPLES = [
    ('maxi-1', ['2.00', '5.99', '5.99', '5.67', '4.79', '5.50', '2.46', '3.25', '3.25', '3.88', '2.29'],
     '45.07', '45.67', '0.60'),
    ('maxi-2', ['5.99', '5.77', '5.82', '6.50', '8.49', '1.94', '4.23', '2.99', '8.99', '4.50', '4.00'],
     '59.22', '59.22', None),
    ('superc-1', ['1.85', '14.95', '12.11', '11.46'], '40.37', '40.37', None),
    ('superc-2', ['2.99', '4.61'], '7.60', '7.60', None),
    ('superc-3', ['4.49', '4.49', '4.44', '4.44', '18.36', '3.99', '9.99', '9.98'],
     '60.18', '63.17', '2.99'),
    ('superc-4', ['5.99', '4.99', '4.99', '1.99', '2.33', '7.12', '2.99', '4.44', '3.77', '9.98', '8.58'],
     '55.59', '55.59', None),
    ('superc-5', ['2.29', '4.47', '2.23', '1.98', '2.34', '4.99', '2.44', '3.49', '3.85', '3.47', '6.99'],
     '38.74', '38.74', None),
]


@pytest.mark.skipif(os.environ.get('OPTIMEAL_RECEIPT_OCR_TESTS') != '1',
                    reason='Essais OCR des photos locales activés explicitement.')
@pytest.mark.parametrize('engine', ['vision', 'tesseract'])
@pytest.mark.parametrize('name,amounts,subtotal,total,taxes', SAMPLES, ids=[sample[0] for sample in SAMPLES])
def test_new_receipt_photo_prices(monkeypatch, tmp_path, engine, name, amounts, subtotal, total, taxes):
    image = ROOT / 'data' / 'receipts' / 'images' / f'{name}.jpg'
    assert image.is_file(), f'Photo locale requise : {image}'
    if engine == 'tesseract':
        for model in ('receipt-tessdata-legacy', 'receipt-tessdata-best'):
            assert (ROOT / '.cache' / model / 'eng.traineddata').is_file(), f'Modèle requis : {model}'
    output, archive = tmp_path / 'result.json', tmp_path / 'ocr.json'
    monkeypatch.setattr('sys.argv', ['extract', str(image), '--engine', engine,
                                    '--output', str(output), '--save-ocr', str(archive)])
    assert extract_receipt.main() == 0
    receipt = json.loads(output.read_text())
    assert [Decimal(item['line_total']) for item in receipt['items']] == list(map(Decimal, amounts))
    assert Decimal(receipt['totals']['subtotal']) == Decimal(subtotal)
    assert Decimal(receipt['totals']['calculated_subtotal']) == Decimal(subtotal)
    assert Decimal(receipt['totals']['total']) == Decimal(total)
    if taxes is not None:
        assert Decimal(receipt['totals']['taxes']) == Decimal(taxes)
        assert receipt['totals']['tax_check_status'] == 'matches'
    assert receipt['totals']['arithmetic_status'] == 'matches'
    assert not receipt['unparsed_lines']
    assert receipt['status'] == 'review_required'
    # Une capture doit reproduire exactement l'extraction, sans nouvel OCR.
    monkeypatch.setattr(extract_receipt, 'recognize', lambda *args, **kwargs: pytest.fail('Rejeu sans OCR'))
    replay_output = tmp_path / 'replay.json'
    monkeypatch.setattr('sys.argv', ['extract', str(image), '--ocr-json', str(archive), '--output', str(replay_output)])
    assert extract_receipt.main() == 0
    replay = json.loads(replay_output.read_text())
    receipt.pop('source')
    replay.pop('source')
    assert replay == receipt
