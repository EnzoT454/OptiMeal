"""Tests sans OCR ni reçu privé : géométrie, montants, anomalies et contrat JSON."""
from decimal import Decimal

import pytest
from pydantic import ValidationError

from backend.app.receipts.ocr import tesseract_blocks
from backend.app.receipts.parser import group_rows, parse_receipt
from backend.app.receipts.schemas import OCRBlock, ReceiptExtraction, ReceiptItem, ReceiptSource


def extract(*lines, date_order='ymd'):
    return parse_receipt(
        ['MAXI (1234)', '1234 RUE EXEMPLE', '21-EPICERIE', *lines],
        ReceiptSource(filename='synthetic.jpg', sha256='a' * 64, engine='test', elapsed_seconds=0),
        date_order=date_order,
    )


def test_weighted_and_multiple_items_with_exact_decimals():
    receipt = extract(
        '(3)12345678901 SARDINES MRJ', '3 @ $1.89 5.67',
        '4131 POMMES MRJ', '0.785 kg @ $6.35/kg 4.98',
        '94011 BANANES MRJ', '0.820 kg @ $2. 40/kg 1.97',
        'SOUS-TOTAL 12.62', 'TOTAL 12.62', 'DateTime: 26/09/27 09:59:38',
    )
    assert len(receipt.items) == 3
    assert receipt.items[0].quantity == Decimal('3')
    assert receipt.items[0].unit_price == Decimal('1.89')
    assert receipt.items[1].unit == 'kg'
    assert receipt.items[1].quantity == Decimal('0.785')
    assert receipt.items[2].unit_price == Decimal('2.40')
    assert receipt.totals.arithmetic_status == 'matches'
    assert receipt.purchase_date.isoformat() == '2026-09-27'
    payload = receipt.model_dump_json()
    assert '"line_total":"5.67"' in payload
    assert ReceiptExtraction.model_validate_json(payload) == receipt
    assert receipt.status == 'review_required'


def test_maxi_ocr_separator_variant_preserves_quantity_price_and_total():
    receipt = extract(
        '(4)66151100250 TISSA SARD HUILE MRJ', '4 G $1.89 7.56',
        'SOUS-TOTAL 7.56', 'TOTAL 7.56',
    )
    sardines = receipt.items[0]
    assert sardines.name == 'TISSA SARD HUILE'
    assert sardines.quantity == Decimal('4')
    assert sardines.unit == 'unit'
    assert sardines.unit_price == Decimal('1.89')
    assert sardines.line_total == Decimal('7.56')
    assert sardines.source_lines[-1] == '4 G $1.89 7.56'
    assert 'ocr_quantity_separator_requires_review' in sardines.warnings
    assert not receipt.unparsed_lines
    assert receipt.totals.arithmetic_status == 'matches'


def test_missing_prices_are_not_zero_and_quantity_is_not_invented():
    receipt = extract('12345678901 LAIT MRJ', 'SOUS-TOTAL 4.00', 'TOTAL 4.00')
    assert receipt.items[0].line_total is None
    assert receipt.items[0].quantity is None
    assert receipt.items[0].format_raw is None
    assert receipt.totals.arithmetic_status == 'unverifiable'
    assert 'line_total_missing' in receipt.items[0].warnings


def test_subtotal_mismatch_does_not_correct_extracted_prices():
    receipt = extract('12345678901 LAIT MRJ 9.99', 'SOUS-TOTAL 3.99', 'TOTAL 3.99')
    assert receipt.items[0].line_total == Decimal('9.99')
    assert receipt.totals.difference_from_subtotal == Decimal('6.00')
    assert receipt.totals.arithmetic_status == 'mismatch'


def test_quantity_check_and_unknown_lines_are_preserved():
    receipt = extract('(3)12345678901 CONSERVE MRJ', '3 @ $1.89 8.00',
                      'RABAIS -1.00', 'SOUS-TOTAL 7.00', 'TOTAL 7.00')
    assert 'quantity_times_price_mismatch' in receipt.items[0].warnings
    assert receipt.unparsed_lines == ['RABAIS -1.00']
    assert receipt.totals.arithmetic_status == 'mismatch'


def test_conflicting_quantities_are_flagged():
    receipt = extract('(3)12345678901 CONSERVE MRJ', '2 @ $1.89 3.78')
    assert receipt.items[0].quantity == Decimal('3')
    assert 'conflicting_quantities' in receipt.items[0].warnings


def test_payment_ads_and_loyalty_are_not_products():
    receipt = extract('12345678901 RIZ MRJ 2.00', 'Points Prime 200 Pts',
                      'SOUS-TOTAL 2.00', 'TOTAL 2.00', 'Compte: VISA 2.00',
                      '12345678901 PUBLICITE 10.00', 'CREDIT 2.00')
    assert len(receipt.items) == 1
    assert receipt.unparsed_lines == []
    assert 'VISA' not in receipt.model_dump_json()
    assert receipt.totals.taxes is None


def test_missing_total_still_stops_at_payment_section():
    receipt = extract('12345678901 RIZ MRJ 2.00', 'Compte: VISA 2.00',
                      '12345678901 PUBLICITE 10.00')
    assert len(receipt.items) == 1
    assert receipt.totals.arithmetic_status == 'unverifiable'


def test_no_decimal_point_is_not_silently_converted_to_cents():
    receipt = extract('12345678901 RIZ MRJ 249', 'SOUS-TOTAL 2.49')
    assert receipt.items[0].line_total is None


def test_incompatible_units_are_not_converted():
    receipt = extract('4131 POMMES MRJ', '0.785 kg @ $6.35/lb 4.98')
    assert 'incompatible_quantity_and_price_units' in receipt.items[0].warnings
    assert receipt.items[0].quantity is None


@pytest.mark.parametrize('day,order,expected', [
    ('26/09/27', 'ymd', '2026-09-27'), ('27/09/26', 'dmy', '2026-09-27'),
    ('2026/09/27', 'ymd', '2026-09-27'), ('26/02/31', 'ymd', None),
])
def test_date_convention_is_explicit(day, order, expected):
    receipt = extract(f'DateTime: {day}', date_order=order)
    assert (receipt.purchase_date.isoformat() if receipt.purchase_date else None) == expected


def test_columns_are_reassembled_without_crossing_adjacent_products():
    def block(text, x, y, width):
        return OCRBlock(text=text, x=x, y=y, width=width, height=.009, confidence=.9)
    blocks = [block('12345678901 RIZ', .1, .15, .5),
              block('12345678902 LAIT', .1, .16, .5),
              block('2.00', .75, .153, .1), block('3.00', .75, .163, .1)]
    assert group_rows(blocks) == ['12345678901 RIZ 2.00', '12345678902 LAIT 3.00']


def test_tesseract_adapter_preserves_word_positions():
    tsv = ('level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n'
           '1\t1\t0\t0\t0\t0\t0\t0\t1000\t2000\t-1\t\n'
           '5\t1\t1\t1\t1\t1\t100\t200\t300\t20\t96\tRIZ\n')
    block = tesseract_blocks(tsv)[0]
    assert (block.x, block.y, block.width, block.height) == (.1, .1, .3, .01)
    assert block.confidence == .96


def test_tesseract_maxi_prefixes_are_removed_only_before_known_structures():
    lines = [
        'MAXI&CIE BEDFORD (8661)', 'À 21-EPICERIE',
        '; 05700003460 CLASS SCE ROSEE MRJ 2.97',
        '3 (4)66151100250 TISSA SARD HUILE MRJ', 'À 4 @ $1,89 7,56',
        'd 34-BOULANGERIE COMMERCIALE', 'oy 62623327240 AUTH GALETTE MOR MRJ 4,00',
        '4 SOUS-TOTAL 14.53', 'TOTAL 14.53',
    ]
    receipt = parse_receipt(lines, ReceiptSource(
        filename='tesseract-noisy.png', sha256='c' * 64, engine='tesseract', elapsed_seconds=0,
    ))
    assert receipt.parsing_profile == receipt.retailer == 'maxi'
    assert [item.name for item in receipt.items] == [
        'CLASS SCE ROSEE', 'TISSA SARD HUILE', 'AUTH GALETTE MOR',
    ]
    assert receipt.items[1].quantity == Decimal('4')
    assert receipt.items[1].unit_price == Decimal('1.89')
    assert receipt.items[1].line_total == Decimal('7.56')
    assert receipt.items[1].source_lines[-1] == 'À 4 @ $1,89 7,56'
    assert receipt.totals.arithmetic_status == 'matches'
    assert 'tesseract_ocr_prefix_removed_requires_review' in receipt.warnings


def test_tesseract_maxi_keeps_product_name_when_ocr_starts_it_with_a_digit():
    receipt = parse_receipt([
        'MAXI (1234)', '22-PRODUITS LAITIERS', '4',
        '62902541000 10G0 YOGOURT MRU 7,29', 'SOUS-TOTAL 7.29', 'TOTAL 7.29',
    ], ReceiptSource(filename='tesseract-noisy.png', sha256='d' * 64,
                      engine='tesseract', elapsed_seconds=0))
    assert len(receipt.items) == 1
    assert receipt.items[0].name == '10G0 YOGOURT MRU'
    assert receipt.items[0].line_total == Decimal('7.29')
    assert receipt.totals.arithmetic_status == 'matches'
    assert 'tesseract_noise_lines_ignored_requires_review' in receipt.warnings


def test_maxi_preserves_tesseract_weighted_total_when_price_detail_is_unreadable():
    receipt = parse_receipt([
        'MAXI (1234)', '27-FRUITS ET LEGUMES', '4131 POMMES FUJI MRJ',
        '0.785 kg © $6, 35/ke 4. 98', 'SOUS-TOTAL 4.98', 'TOTAL 4.98',
    ], ReceiptSource(filename='tesseract-noisy.png', sha256='e' * 64,
                      engine='tesseract', elapsed_seconds=0))
    apple = receipt.items[0]
    assert apple.line_total == Decimal('4.98')
    assert apple.quantity is None
    assert apple.unit_price is None
    assert 'quantity_detail_unreadable' in apple.warnings
    assert receipt.totals.arithmetic_status == 'matches'


def test_subtotal_accepts_tesseract_long_dash():
    receipt = extract('12345678901 RIZ MRJ 2.00', 'SOUS—TOTAL 2.00', 'TOTAL 2.00')
    assert receipt.totals.subtotal == Decimal('2.00')
    assert receipt.totals.arithmetic_status == 'matches'


def test_empty_receipt_is_unverifiable():
    receipt = extract('SOUS-TOTAL 0.00', 'TOTAL 0.00')
    assert not receipt.items
    assert receipt.totals.arithmetic_status == 'unverifiable'
    assert 'no_items_found' in receipt.warnings


@pytest.mark.parametrize('amount', ['-1.00', 'NaN', 'Infinity', '1.001'])
def test_schema_rejects_invalid_money(amount):
    with pytest.raises(ValidationError):
        ReceiptItem(line_id=1, name='Produit', line_total=amount, source_lines=[])


def parse_lines(lines, profile='auto'):
    return parse_receipt(lines, ReceiptSource(filename='synthetic.png', sha256='b' * 64,
                                             engine='test', elapsed_seconds=0), profile=profile)


def metro_lines(member_discount='-0.99'):
    # Données synthétiques : plusieurs unités, économies informatives et rabais signé.
    return ['METRO', 'EPICERIE', 'SAUCE 2.97', 'Rabais 3.32', 'FRUITS LEGUM',
            '(3) FRAMBOISE 170G', '3 @ $1.77 5.31', 'Rabais 9.66',
            f'RABAIS MEMBRE {member_discount}', 'MICHE', 'PAIN 4.99',
            'PRODUIT LAIT', 'OEUFS 6.29', 'YOGOURT 4.89', 'SANTE BEAUT',
            'SAVON FP 9.99', 'SOUS-TOTAL 33.45', '9.99 T.P.S. (5.000)% 0.50',
            '9.99 T.V.Q. (9.975)% 1.00', 'TOTAL 34.95', 'C. CREDIT 34.95',
            'Rabais promotionnels 12.98', 'PUBLICITE 15.00']


def test_metro_no_codes_and_informational_savings_not_subtracted_twice():
    receipt = parse_lines(metro_lines())
    assert receipt.parsing_profile == receipt.retailer == 'metro'
    assert len(receipt.items) == 6
    assert receipt.items[1].quantity == Decimal('3')
    assert receipt.items[-1].name == 'SAVON'
    assert receipt.totals.items_sum == Decimal('34.44')
    assert receipt.totals.calculated_subtotal == Decimal('33.45')
    assert receipt.totals.arithmetic_status == 'matches'
    assert [a.effect for a in receipt.adjustments] == ['informational', 'informational', 'applied']
    assert receipt.totals.taxes == Decimal('1.50')
    assert receipt.totals.tax_check_status == 'matches'
    assert receipt.schema_version == 'receipt-1.1'
    assert ReceiptExtraction.model_validate_json(receipt.model_dump_json()) == receipt


def test_metro_wrong_ocr_discount_is_preserved_and_flagged():
    receipt = parse_lines(metro_lines('-8.99'))
    assert receipt.adjustments[-1].amount == Decimal('-8.99')
    assert receipt.totals.difference_from_subtotal == Decimal('-8.00')
    assert receipt.totals.arithmetic_status == 'mismatch'
    assert receipt.totals.tax_check_status == 'matches'


def test_store_detection_uses_specific_evidence_not_just_loyalty_program():
    lines = metro_lines()
    lines[0] = 'Commerce Exemple'
    assert parse_lines(lines + ['METROSONDAGE.CA']).parsing_profile == 'metro'
    unknown = parse_lines(lines + ['Programme Moi'])
    assert unknown.retailer is None
    assert unknown.parsing_profile == 'generic'
    assert len(unknown.items) == 6
    assert unknown.adjustments == []
    assert 'RABAIS MEMBRE -0.99' in unknown.unparsed_lines


def test_generic_without_departments_recognizes_candidates_before_total_only():
    receipt = parse_lines(['PETITE EPICERIE', '1234 RUE EXEMPLE', 'PAIN 3.99', 'LAIT 5.49',
                           'SOUS-TOTAL 9.48', 'TOTAL 9.48', 'VISA 9.48', 'CADEAU 20.00'])
    assert receipt.parsing_profile == 'generic'
    assert [i.name for i in receipt.items] == ['PAIN', 'LAIT']
    assert receipt.totals.arithmetic_status == 'matches'
    assert all('generic_candidate_requires_review' in i.warnings for i in receipt.items)
    assert receipt.status == 'review_required'


def test_generic_preserves_unknown_line_even_if_arithmetic_matches():
    receipt = parse_lines(['COMMERCE', 'PAIN 3.99', 'ARTICLE ILLISIBLE',
                           'SOUS-TOTAL 3.99', 'TOTAL 3.99'])
    assert receipt.unparsed_lines == ['ARTICLE ILLISIBLE']
    assert receipt.totals.arithmetic_status == 'unverifiable'


def test_generic_does_not_guess_purchase_section_without_end_or_category():
    receipt = parse_lines(['COMMERCE', 'PAIN 3.99', 'VISA 3.99'])
    assert not receipt.items


def test_tesseract_generic_can_preserve_candidates_when_total_is_unreadable():
    receipt = parse_receipt([
        'COMMERCE', 'RIZ 4.99', 'LAIT 5.49', 'INTERAC 10.48',
    ], ReceiptSource(filename='tesseract-noisy.png', sha256='f' * 64,
                      engine='tesseract-psm6', elapsed_seconds=0))
    assert [item.name for item in receipt.items] == ['RIZ', 'LAIT']
    assert 'tesseract_purchase_boundary_unverified' in receipt.warnings
    assert receipt.totals.arithmetic_status == 'unverifiable'


def test_forced_profile_is_recorded_without_inventing_retailer():
    receipt = parse_lines(['COMMERCE', 'EPICERIE', 'PAIN 3.99', 'TOTAL 3.99'], profile='metro')
    assert receipt.retailer is None
    assert receipt.parsing_profile == 'metro'
    assert 'parsing_profile_forced' in receipt.warnings
    assert len(receipt.items) == 1


def test_logo_with_unknown_format_uses_generic_profile():
    receipt = parse_lines(['MAXI', 'PAIN 3.99', 'SOUS-TOTAL 3.99', 'TOTAL 3.99'])
    assert receipt.retailer == 'maxi'
    assert receipt.parsing_profile == 'generic'
    assert len(receipt.items) == 1


def test_unrecognized_discount_is_not_silently_accepted():
    receipt = parse_lines(metro_lines('illisible'))
    assert receipt.adjustments[-1].effect == 'unknown'
    assert receipt.totals.calculated_subtotal is None
    assert receipt.totals.arithmetic_status == 'unverifiable'


def test_duplicate_taxes_are_ambiguous_not_added_twice():
    lines = metro_lines()
    lines.insert(lines.index('TOTAL 34.95'), '9.99 T.P.S. (5.000)% 0.50')
    receipt = parse_lines(lines)
    assert receipt.totals.taxes is None
    assert 'ambiguous_tax_lines' in receipt.warnings


def test_taxes_disagree_with_total():
    lines = [line.replace('TOTAL 34.95', 'TOTAL 35.95') for line in metro_lines()]
    receipt = parse_lines(lines)
    assert receipt.totals.tax_check_status == 'mismatch'
    assert 'subtotal_plus_taxes_mismatch' in receipt.warnings


@pytest.mark.parametrize('department', ['POISS. FRAIS', 'POISS.FRAIS.', 'POISS FRAIS'])
def test_metro_fish_department_and_reward_payment(department):
    receipt = parse_lines([
        'METRO', 'MICHE', 'NAAN AIL 4.99', department, 'FILET SAUMON COH 13.87',
        'Rabais 11.12', 'PRODUIT LAIT', 'SELECT.OEUF 6.29', 'SIGGIS SKYR BAN. 3.99',
        'Rabais 0.90', 'SOUS-TOTAL 29.14', 'TOTAL 29.14', 'RECOM MOI 4.00',
        'C.CREDIT 25.14',
    ])
    assert len(receipt.items) == 4
    assert receipt.items[1].category_raw == department
    assert receipt.items[0].category_raw == 'MICHE'
    assert receipt.totals.items_sum == receipt.totals.total == Decimal('29.14')
    assert receipt.totals.arithmetic_status == 'matches'
    assert receipt.unparsed_lines == []


def test_metro_unknown_fish_heading_is_not_silently_discarded():
    receipt = parse_lines(['METRO', 'MICHE', 'PAIN 4.99', 'POISS. INCONNU',
                           'SOUS-TOTAL 4.99', 'TOTAL 4.99'])
    assert receipt.unparsed_lines == ['POISS. INCONNU']
    assert receipt.totals.arithmetic_status == 'unverifiable'


def generic_receipt(*lines):
    return parse_receipt(list(lines), ReceiptSource(
        filename='synthetic.png', sha256='b' * 64, engine='test', elapsed_seconds=0))


def test_generic_weighted_dollar_totals_and_split_description():
    result = generic_receipt('EPICERIE EXEMPLE', 'POIRES', '0.500 kg @ $4.00 / kg $2.00',
                             'THON EN CONSERVE', 'huile végétale 3*65gr',
                             '2 @ $3.00 $6.00', 'SOUS-TOTAL $8.00', 'TOTAL $8.00',
                             'INTERAC $8.00', 'REMISE $0.00')
    assert len(result.items) == 2
    assert result.items[0].quantity == Decimal('0.500')
    assert result.items[0].unit_price == Decimal('4.00')
    assert result.items[1].name == 'THON EN CONSERVE huile végétale 3*65gr'
    assert result.items[1].source_lines == ['THON EN CONSERVE', 'huile végétale 3*65gr', '2 @ $3.00 $6.00']
    assert result.totals.arithmetic_status == 'matches'
    assert not result.unparsed_lines


def test_generic_format_continuation_and_signed_bundle_discount():
    result = generic_receipt('RIZ $4.00', '900gr', 'BISCUITS', '3 e $1.00 $3.00',
                             '3 pour 2.00$ -$1.00RT', 'SOUS-TOTAL $6.00', 'TOTAL $6.00')
    assert result.items[0].name == 'RIZ 900gr'
    assert result.items[0].source_lines == ['RIZ $4.00', '900gr']
    assert result.items[1].quantity == Decimal('3')
    assert 'ocr_quantity_separator_requires_review' in result.items[1].warnings
    assert result.adjustments[0].amount == Decimal('-1.00')
    assert result.totals.items_sum == Decimal('7.00')
    assert result.totals.calculated_subtotal == Decimal('6.00')
    assert result.totals.arithmetic_status == 'matches'


def test_unreadable_detail_preserves_total_without_repairing_numbers():
    result = generic_receipt('PAIN', '12 e $0.-19 $5.88',
                             'SOUS-TOTAL $5.88', 'TOTAL $5.88')
    assert len(result.items) == 1
    assert result.items[0].line_total == Decimal('5.88')
    assert result.items[0].unit_price is None
    assert 'quantity_detail_unreadable' in result.items[0].warnings


def test_ambiguous_discount_is_not_corrected_to_fit_total():
    result = generic_receipt('PAIN $3.00', '6 pour 2.55$ -$O.45RT',
                             'SOUS-TOTAL $2.55', 'TOTAL $2.55')
    assert len(result.items) == 1
    assert result.adjustments[0].amount is None
    assert result.adjustments[0].effect == 'unknown'
    assert result.totals.calculated_subtotal is None
    assert result.totals.arithmetic_status == 'unverifiable'


def test_negative_dollar_amount_never_becomes_positive_product():
    from backend.app.receipts.rules.common import trailing_amount
    assert trailing_amount('COUPON -$1.00')[1] is None
    assert trailing_amount('PAIN $1.00') == ('PAIN', Decimal('1.00'))


def test_candidate_selection_preserves_matching_result():
    from backend.cli.extract_receipt import improves_extraction
    good = extract('12345678901 RIZ MRJ 2.00', 'SOUS-TOTAL 2.00', 'TOTAL 2.00')
    bad = extract('12345678901 RIZ MRJ 2.00', '12345678902 LAIT MRJ 5.00',
                  'SOUS-TOTAL 2.00', 'TOTAL 2.00')
    assert not improves_extraction(bad, good)
    assert improves_extraction(good, bad)
    assert not improves_extraction(good, good)


def test_tsv_line_identity_keeps_sloping_product_and_price_together():
    blocks = [
        OCRBlock(text='RIZ', x=.1, y=.1, width=.2, height=.01, confidence=.9, line_key='1:1:1:1'),
        OCRBlock(text='2.00', x=.8, y=.13, width=.1, height=.01, confidence=.9, line_key='1:1:1:1'),
        OCRBlock(text='LAIT', x=.1, y=.15, width=.2, height=.01, confidence=.9, line_key='1:1:1:2'),
    ]
    assert group_rows(blocks) == ['RIZ 2.00', 'LAIT']


def test_tesseract_cleanup_keeps_long_legitimate_prefix():
    from backend.app.receipts.parser import prepare_tesseract_lines
    raw = 'HEINZ MOUTARDE 3750 PRODUIT 2.00'
    assert prepare_tesseract_lines([raw])[0] == [raw]


def test_auto_on_macos_still_calls_vision(monkeypatch, tmp_path):
    import json
    from types import SimpleNamespace
    from backend.app.receipts import ocr
    calls = []
    monkeypatch.setattr(ocr.platform, 'system', lambda: 'Darwin')
    monkeypatch.setattr(ocr.shutil, 'which', lambda name: '/usr/bin/' + name)
    monkeypatch.setattr(ocr.subprocess, 'run', lambda command, **kwargs:
                        calls.append(command) or SimpleNamespace(returncode=0, stderr='', stdout=json.dumps([])))
    blocks, engine = ocr.recognize(tmp_path / 'image.jpg', 'auto')
    assert engine == 'vision'
    assert blocks == []
    assert calls[0][0] == 'swift'


def test_tesseract_archive_replay_preserves_result_and_full_image_date(monkeypatch, tmp_path):
    import json
    import sys
    from backend.cli import extract_receipt as cli
    image = tmp_path / 'receipt.jpg'
    image.write_bytes(b'synthetic image')
    output = tmp_path / 'result.json'
    archive = tmp_path / 'ocr.json'
    lines = ['MAXI (1234)', '21-EPICERIE', '; 12345678901 RIZ MRJ 2.00',
             'SOUS-TOTAL 2.00', 'TOTAL 2.00', 'DateTime: 26/09/27']
    blocks = [OCRBlock(text=line, confidence=.9, x=.1, y=.01 * index,
                       width=.8, height=.005, line_key=f'1:1:1:{index}')
              for index, line in enumerate(lines)]
    monkeypatch.setattr(cli, 'recognize', lambda *args: (blocks, 'tesseract'))
    monkeypatch.setattr(sys, 'argv', ['extract', str(image), '--engine', 'tesseract',
                                    '--tesseract-preprocess', 'none', '--save-ocr', str(archive),
                                    '--output', str(output)])
    assert cli.main() == 0
    original = json.loads(output.read_text())
    monkeypatch.setattr(cli, 'recognize', lambda *args: pytest.fail('Le rejeu ne doit pas appeler un OCR'))
    monkeypatch.setattr(sys, 'argv', ['extract', str(image), '--ocr-json', str(archive), '--output', str(output)])
    assert cli.main() == 0
    replay = json.loads(output.read_text())
    assert replay['source']['engine'] == 'tesseract-replay'
    original.pop('source')
    replay.pop('source')
    assert original == replay


def test_preprocess_unicode_path_and_crop_preserve_original(tmp_path):
    import cv2
    import numpy as np
    from backend.app.receipts.ocr import prepare_tesseract_image, crop_tesseract_item_area
    image = tmp_path / 'reçu.jpg'
    pixels = np.full((400, 200), 255, dtype=np.uint8)
    cv2.putText(pixels, 'TOTAL', (10, 200), cv2.FONT_HERSHEY_SIMPLEX, .5, 0, 1)
    image.write_bytes(cv2.imencode('.jpg', pixels)[1].tobytes())
    original = image.read_bytes()
    prepared = tmp_path / 'prepared.png'
    prepare_tesseract_image(image, prepared)
    assert prepared.exists()
    blocks = [OCRBlock(text='MICHE', confidence=.9, x=.1, y=.1, width=.2, height=.03),
              OCRBlock(text='TOTAL', confidence=.9, x=.1, y=.5, width=.2, height=.03)]
    cropped = tmp_path / 'cropped.png'
    assert crop_tesseract_item_area(image, blocks, cropped)
    assert cv2.imdecode(np.frombuffer(cropped.read_bytes(), dtype=np.uint8), 0).shape[0] < 400
    assert image.read_bytes() == original


def test_candidate_selection_prefers_verified_taxes():
    from backend.cli.extract_receipt import improves_extraction
    complete = parse_lines(metro_lines())
    missing = complete.model_copy(deep=True)
    missing.totals.taxes = None
    missing.totals.tax_check_status = 'unverifiable'
    assert improves_extraction(complete, missing)
    assert not improves_extraction(missing, complete)


def test_discount_reread_missing_model_preserves_blocks(tmp_path):
    from backend.app.receipts.ocr import reread_member_discount
    blocks = [OCRBlock(text='-8.99', confidence=.9, x=.7, y=.2, width=.2, height=.05)]
    assert reread_member_discount(tmp_path / 'absent.jpg', blocks, tmp_path, tmp_path) == (blocks, False)


@pytest.mark.parametrize('recognized,code,expected', [
    ('-0.99\n', 0, '-0.99'), ('0.99', 0, '-8.99'), ('-099', 0, '-8.99'),
    ('-0.99', 1, '-8.99'), ('-8.99', 0, '-8.99'),
])
def test_discount_reread_uses_pixels_and_keeps_original(monkeypatch, tmp_path, recognized, code, expected):
    import cv2
    import numpy as np
    from types import SimpleNamespace
    from backend.app.receipts import ocr
    image = tmp_path / 'reçu.png'
    image.write_bytes(cv2.imencode('.png', np.full((400, 200), 255, dtype=np.uint8))[1].tobytes())
    original = image.read_bytes()
    (tmp_path / 'eng.traineddata').write_bytes(b'mocked model')
    blocks = [OCRBlock(text=text, confidence=.9, x=x, y=.2, width=.1, height=.04,
                       line_key='1:1:1:1') for text, x in [('RABAIS', .1), ('MEMBRE', .3), ('-8.99', .7)]]
    calls = []
    def run(command, **kwargs):
        calls.append(command)
        assert Path(command[1]).is_file()
        return SimpleNamespace(returncode=code, stdout=recognized)
    from pathlib import Path
    monkeypatch.setattr(ocr.subprocess, 'run', run)
    updated, changed = ocr.reread_member_discount(image, blocks, tmp_path, tmp_path)
    assert updated[-1].text == expected
    assert changed == (expected != '-8.99')
    assert blocks[-1].text == '-8.99'
    assert image.read_bytes() == original
    assert '--tessdata-dir' in calls[0]


def test_metro_tesseract_reread_archive_replays_without_engine(monkeypatch, tmp_path):
    import json
    import sys
    from backend.cli import extract_receipt as cli
    image = tmp_path / 'metro.jpg'
    image.write_bytes(b'mocked image')
    output, archive = tmp_path / 'result.json', tmp_path / 'ocr.json'
    blocks = [OCRBlock(text=line, confidence=.9, x=.1, y=index * .02,
                       width=.8, height=.005, line_key=f'1:1:1:{index}')
              for index, line in enumerate(metro_lines('-8.99'))]
    corrected = [b.model_copy(update={'text': b.text.replace('-8.99', '-0.99')}) for b in blocks]
    monkeypatch.setattr(cli, 'recognize', lambda *args: (blocks, 'tesseract'))
    monkeypatch.setattr(cli, 'prepare_tesseract_image', lambda *args: None)
    monkeypatch.setattr(cli, 'reread_member_discount', lambda *args: (corrected, True))
    monkeypatch.setattr(sys, 'argv', ['extract', str(image), '--engine', 'tesseract',
                                    '--save-ocr', str(archive), '--output', str(output)])
    assert cli.main() == 0
    original = json.loads(output.read_text())
    assert original['totals']['arithmetic_status'] == 'matches'
    assert 'member_discount_reread_requires_review' in original['warnings']
    monkeypatch.setattr(cli, 'recognize', lambda *args: pytest.fail('Rejeu sans OCR'))
    monkeypatch.setattr(sys, 'argv', ['extract', str(image), '--ocr-json', str(archive), '--output', str(output)])
    assert cli.main() == 0
    replay = json.loads(output.read_text())
    original.pop('source')
    replay.pop('source')
    assert replay == original
