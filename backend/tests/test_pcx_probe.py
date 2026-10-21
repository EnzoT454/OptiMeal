import pytest

from backend.cli.probe_pcx_products import summarize


def test_receipt_code_is_not_confused_with_product_id():
    result = summarize({'code': '21117318_EA', 'gtin': '00060383185572',
                        'offers': []}, '21117318_EA', '06038318557')
    assert result['receipt_code_matches_upc_body'] is True
    assert result['matching_requires_review'] is True


def test_wrong_or_invalid_barcode_never_matches():
    for gtin in ('00060383185573', None, '00057000034605'):
        result = summarize({'code': '21117318_EA', 'gtin': gtin,
                            'offers': []}, '21117318_EA', '06038318557')
        assert result['receipt_code_matches_upc_body'] is False


def test_unexpected_product_is_rejected():
    with pytest.raises(ValueError):
        summarize({'code': 'other', 'offers': []}, '21117318_EA', '06038318557')
