"""Régressions des montants imprimés : Super C et colonnes inclinées Maxi.

Exemples transcrits des photos, sans coordonnées de magasin, paiement ou
identité. Les tests ordinaires n'exécutent aucun moteur OCR.
"""
from decimal import Decimal

import pytest

from backend.app.receipts.layout import align_price_column
from backend.app.receipts.parser import parse_receipt
from backend.app.receipts.schemas import OCRBlock, ReceiptSource
from backend.cli.extract_receipt import extract_from_blocks


def source(engine='test'):
    return ReceiptSource(filename='synthetic.png', sha256='a' * 64, engine=engine, elapsed_seconds=0)


@pytest.mark.parametrize('lines,amounts,net,total', [
    (['FRUIT/LEGUME', 'TOMATE ITALIENNE', '0.280 kg @ $6.59/kg 1.85',
      'VIANDE', '(5)SAUC.FUMEE', '5 @ $2.99 14.95', 'Rabais 20.00',
      'COTES DOS PORC 12.11', 'Rabais 9.71', 'COTES DOS PORC 11.46', 'Rabais 9.19',
      'SOUS-TOTAL. 40-37', 'TOTAL 40 - 37', 'ARRONDI -0.02',
      'TOTAL ARRONDI 40.35', 'ARGENT 50.00', 'MONNAIE 9.65'],
     ['1.85', '14.95', '12.11', '11.46'], '40.37', '40.37'),
    (['EPICERIE', 'GERBER GRAD.SOUF 2.99', 'Rabais 2.00', 'FRUIT/LEGUME',
      'BANANE PREMIUM', '2.650 kg @ $1.74/kg 4.61', 'SOUS-TOTAL 7.60', 'TOTAL 7.60'],
     ['2.99', '4.61'], '7.60', '7.60'),
    (['EPICERIE', 'CELEB.BISC.MINI 4.49', 'CELEB.BISC.MINI 4.49', 'SURGELE EPIC',
      '(2)IRRS.REP.SURG.PO', '2 @ $2.22 4.44', 'Rabais 3.14',
      '(2)IRRS.REP.SURG.PA', '2 @ $2.22 4.44', 'Rabais 3.14',
      '(4)OSMIO PATE SURG.', '4 @ $4.59 18.36', 'BOUL COMMERC', 'SELECTION BEIGNE 3.99',
      'NON-ALIM. TX', 'FR-LIG LITIE.AGG FP 9.99', 'Rabais 4.00', 'MET CUIS. TX',
      '(2)PO SOUS MARIN FP', '2 0 $4.99 9.98', 'SOUS-TOTAL 60 - 18',
      '19.97 (5.000)% 1.00', '19.97 T.V.Q. (9.975)% 1.99', 'TOTAL 63-17'],
     ['4.49', '4.49', '4.44', '4.44', '18.36', '3.99', '9.99', '9.98'], '60.18', '63.17'),
    (['EPICERIE', 'SPECK CER.VAN.AM 5.99', 'Rabais 1.50', 'FRUIT/LEGUNE',
      'ORANGES 4.99', 'Rabais 1.00', 'CLEMENTINES 4.99', 'Rabais 1.00',
      'CHAMPIGNON BLANC 1.99', 'Rabais 0.50', 'BANANE PREMIUM',
      '1.340 kg @ $1.74/kg 2.33', 'RAISINS VERTS LA', '1.090 kg Brut', '-0.010 kg Tare =',
      '1.080 kg Net @ I $6.59/kg 7.12', 'Rabais 2.38', 'POIVRON RGE 4UN 2.99',
      'Rabais 2.00', 'PRODUIT LAIT', 'SELECTION FROM.B 4.44', 'Rabais 1.75',
      'NATUR.OEUF GR.PO 3.77', 'Rabais 2.72', '(2)LACT.PURF.LAIT1%', '2 @ $4.99 9.98',
      'Rabais 1.00', 'BOUL CONNERC', '(2)POM PAIN TRANCHE', '2 @ $4.29 8.58',
      'PRIX -1 .58', 'SOUS- TOTAL 55.59', 'TOTAL 55.59', 'ARRONDI 0.01',
      'TOTAL ARRONDI 55.60', 'ARGENT 100.00', 'MONNAIE 44.40'],
     ['5.99', '4.99', '4.99', '1.99', '2.33', '7.12', '2.99', '4.44', '3.77', '9.98', '8.58'],
     '55.59', '55.59'),
    (['EPICERIE', 'KRAFTDIN.REP.NOU 2.29', 'FRUIT/LEGUME', '(3)GRENADE',
      '3 0 $1.49 4.47', 'Rabals 6.00', 'BANANE PREMIUM', '1.280 kg © $1.74/kg 2.23',
      '(2)AVOCAT HASS', '2 0 $0.99 1.98', 'Rabais 1.00', 'TOMATE ITALIENNE',
      '0.355 kg @ $6.59/kg 2.34', 'POMMES MCINTOSH 4.99', 'BLEUET 170G 2.44',
      'Rabais 2.55', 'PRODUIT LAIT', 'IRRS.BOIS.OR.M.S 3.49', 'Consigne 0.10',
      'OASIS JUS REF.10 3.85', 'Rabais 1.64', 'Consigne 0.10', 'SURGELE EPIC',
      'RISTOR.PIZZA SRG 3.47', 'Rabais 2.52', 'BOUL COMMERC', 'GATEAU FONDANT A 6.99',
      'SOUS-TOTAL 38. 74', 'TOTAL 38.74'],
     ['2.29', '4.47', '2.23', '1.98', '2.34', '4.99', '2.44', '3.49', '3.85', '3.47', '6.99'],
     '38.74', '38.74'),
])
def test_superc_printed_prices_and_adjustments(lines, amounts, net, total):
    result = parse_receipt(['BIENVENUE CHEZ SUPER C', *lines], source())
    assert result.parsing_profile == result.retailer == 'superc'
    assert [item.line_total for item in result.items] == list(map(Decimal, amounts))
    assert result.totals.calculated_subtotal == Decimal(net)
    assert result.totals.subtotal == Decimal(net)
    assert result.totals.total == Decimal(total)
    assert result.totals.arithmetic_status == 'matches'
    assert not result.unparsed_lines
    assert all(item.review_required for item in result.items)
    assert result.status == 'review_required'
    if Decimal(total) != Decimal(net):
        assert result.totals.tax_check_status == 'matches'


def test_superc_missing_unrounded_total_does_not_use_cash_total():
    result = parse_receipt(['SUPER C', 'EPICERIE', 'PAIN 2.99',
                            'SOUS-TOTAL 2.99', 'TOTAL', 'ARRONDI 0.01',
                            'TOTAL ARRONDI 3.00'], source())
    assert result.totals.total is None


def tilted_blocks(missing_price=False):
    lines = ['MAXI (1234)', '21-EPICERIE', '12345678901 PATES MRJ',
             '12345678902 THON MRJ', '(3)12345678903 SARDINES MRJ',
             '3 @ $1.89', 'SOUS-TOTAL', 'TOTAL']
    blocks = [OCRBlock(text=text, confidence=.9, x=.1, y=.05 + i * .03,
                        width=.5, height=.02, line_key=f'vision:{i}')
              for i, text in enumerate(lines)]
    prices = [('2.00', 2), ('5.99', 3), ('5.67', 5), ('13.66', 6), ('13.66', 7)]
    for text, index in prices[1:] if missing_price else prices:
        blocks.append(OCRBlock(text=text, confidence=.9, x=.8, y=.05 + index * .03 - .018,
                               width=.12, height=.02, line_key=f'vision:price{index}'))
    return blocks


def test_slanted_prices_match_products_and_quantity_rows_in_order():
    result = extract_from_blocks(tilted_blocks(), source('vision'))
    assert [item.line_total for item in result.items] == [Decimal('2.00'), Decimal('5.99'), Decimal('5.67')]
    assert result.items[-1].quantity == 3
    assert result.items[-1].unit_price == Decimal('1.89')
    assert result.totals.arithmetic_status == 'matches'
    assert 'price_column_alignment_requires_review' in result.warnings


def test_missing_column_price_is_never_filled_from_total():
    assert align_price_column(tilted_blocks(missing_price=True), 'maxi') is None


def test_tesseract_short_noise_before_maxi_code_keeps_source():
    raw = 'Mtge 12345678901 PAIN MRJ 3.88'
    result = parse_receipt(['MAXI (1234)', '21-EPICERIE', raw, 'SOUS-TOTAL 3.88', 'TOTAL 3.88'],
                           source('tesseract'))
    assert result.items[0].line_total == Decimal('3.88')
    assert result.items[0].source_lines == [raw]


@pytest.mark.parametrize('raw,expected', [
    ('4.49 *', '4.49'), ('60 _ 18', '60.18'), ('9.9.8', '9.98'),
    ("55'.59", '55.59'), ('-1.58', '-1.58'), ('38-74', '38.74'),
    ('325', None), ('S.99', None), ('5.S9', None), ('-17', None),
])
def test_numeric_field_cleanup_keeps_digits_and_requires_decimal(raw, expected):
    from backend.app.receipts.ocr import normalize_price_text
    assert normalize_price_text(raw) == expected


def test_conflicting_count_keeps_printed_line_price_without_guessing_quantity():
    result = parse_receipt(['SUPER C', 'EPICERIE', '(2)LAIT', '7 @ $4.99 9.98',
                            'SOUS-TOTAL 9.98', 'TOTAL 9.98'], source())
    assert result.items[0].quantity == 2
    assert result.items[0].line_total == Decimal('9.98')
    assert result.items[0].unit_price is None
    assert 'conflicting_quantities' in result.items[0].warnings


def test_incomplete_or_inconsistent_total_does_not_stop_ocr_fallbacks():
    from backend.cli.extract_receipt import extraction_ready
    result = parse_receipt(['SUPER C', 'EPICERIE', 'PAIN 40.37',
                            'SOUS-TOTAL 40.37', 'TOTAL 0.37'], source())
    assert result.totals.arithmetic_status == 'matches'
    assert not extraction_ready(result)


def test_superc_copyright_glyph_is_only_a_header_hint_for_tesseract():
    lines = ['BIENVENUE CHEZ SUPER ©', 'SUPER © 1234', 'EPICERIE',
             'PAIN 2.99', 'SOUS-TOTAL 2.99', 'TOTAL 2.99']
    result = parse_receipt(lines, source('tesseract'))
    assert result.retailer == result.parsing_profile == 'superc'
    assert 'tesseract_retailer_header_requires_review' in result.warnings


def test_generic_unreadable_price_spacing_stays_unknown():
    # Une nouvelle tolérance Super C ne doit pas transformer une ancienne
    # lecture générique « 6 . 30 » en prix connu (la photo porte 6,36).
    result = parse_receipt(['COMMERCE', 'MERGUEZ BOEUF DOUX',
                            '0.424 kg @ $14.99 /-kg $6 . 30',
                            'SOUS-TOTAL 6.36', 'TOTAL 6.36'], source('tesseract'))
    assert result.items[0].line_total is None
    assert result.totals.arithmetic_status == 'unverifiable'
