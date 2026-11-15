"""Formats vérifiables, preuves périmées, bases de prix et inconnues explicites."""
from datetime import date
from decimal import Decimal, localcontext
import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from backend.app.catalog.common_schemas import CommonCatalog, SourceProduct
from backend.app.catalog.formats import parse_format
from backend.app.catalog.sales import (
    NormalizedSale, SaleReview, SaleReviewDocument, normalize_catalog, normalize_sale, source_fingerprint,
)
from backend.app.common.public_data import DEFAULT_CATALOG
from backend.cli import normalize_sales as cli

DAY = date(2026, 11, 14)
INGREDIENT = 'ing_test_riz'


def product(**changes):
    data = dict(id='maxi:8661:test', retailer='maxi', store_id='8661', external_product_id='test',
        name='Riz — 500 g', price='3.79', currency='CAD', unit='g', quantity='500',
        valid_from=None, valid_to=None, retrieved_at='2026-11-14', is_promotion=False,
        source='test_fixture', url='https://example.test/product')
    data.update(changes)
    data['id'] = f"{data['retailer']}:{data['store_id'] or ''}:{data['external_product_id']}"
    return SourceProduct.model_validate(data)


def review(p, **changes):
    data = dict(product_id=p.id, ingredient_id=INGREDIENT, source_fingerprint=source_fingerprint(INGREDIENT, p),
        checked_at='2026-11-14T12:00:00Z', method='source_document',
        reference='https://example.test/flyer/page/1', format_raw='500 g',
        price_basis='package', price_basis_raw='3,79 $ le paquet',
        match_status='verified', scope='store', conditions='unconditional')
    data.update(changes)
    return SaleReview.model_validate(data)


def normalize(p=None, **changes):
    p = p or product()
    return normalize_sale(INGREDIENT, p, DAY, review(p, **changes))


@pytest.mark.parametrize('raw,amount,unit,count', [
    ('1 kg', '1000', 'g', 1), ('2 × 125 g', '250', 'g', 2),
    ('1,5 L', '1500', 'ml', 1), ('3 lb', '1360.77711', 'g', 1),
    ('12 unités', '12', 'unit', 1), ('2 x 4 x 125 g', None, None, None),
    ('300–454 g', None, None, None), ('12 oz', None, None, None),
    ('2 fl oz', None, None, None), ('2 pour 5 $', None, None, None),
])
def test_verified_packages_are_exact_and_ambiguous_formats_stay_unknown(raw, amount, unit, count):
    result = normalize(format_raw=raw)
    if amount:
        assert result.eligible_for_calculation
        assert result.content_per_package.amount == amount and result.content_per_package.unit == unit
        assert result.format.package_count == count
        assert result.price_per_quantity is None  # 3,79 $ par paquet, pas par gramme
        assert result.sale_increment.amount == '1'
    else:
        assert not result.eligible_for_calculation
        assert result.content_per_package is None
        assert 'PACKAGE_CONTENT_UNKNOWN' in result.issues


def test_decimal_precision_is_not_limited_by_process_context():
    with localcontext() as context:
        context.prec = 6
        parsed = parse_format('3 x 12345678901234567890.123456789 kg')
        assert parsed.quantity == Decimal('37037036703703703670370.370367')
        result = normalize(price_basis='weight', format_raw='poids variable',
            price_per_quantity={'amount': '12345678901234567890.123456789', 'unit': 'kg'},
            sale_increment={'amount': '1', 'unit': 'g'}, minimum_sale={'amount': '1', 'unit': 'g'})
        assert result.eligible_for_calculation
        assert result.price_per_quantity.amount == '12345678901234567890123.456789'


def test_source_quantity_and_name_do_not_attest_a_package_price():
    p = product()
    result = normalize_sale(INGREDIENT, p, DAY)
    assert result.format.kind == 'fixed' and result.format_status == 'candidate'
    assert result.price_basis == 'unknown' and result.content_per_package is None
    assert not result.eligible_for_calculation
    assert {'PRICE_BASIS_UNKNOWN', 'MATCH_UNVERIFIED', 'REVIEW_MISSING'} <= set(result.issues)
    assert result.raw_source == p
    p = product(quantity=None, unit=None, name='Paquet de riz de 500 g')
    assert normalize_sale(INGREDIENT, p, DAY).format.kind == 'unknown'


@pytest.mark.parametrize('field,value', [('quantity', '750'), ('price', '4.00'), ('name', 'Autre variante'),
    ('url', 'https://example.test/new'), ('retrieved_at', '2026-11-15')])
def test_changed_commercial_snapshot_invalidates_review(field, value):
    p = product()
    proof = review(p)
    changed = SourceProduct.model_validate({**p.model_dump(), field: value})
    result = normalize_sale(INGREDIENT, changed, DAY, proof)
    assert result.review_status == 'stale' and result.review == proof
    assert result.price_basis == 'unknown' and not result.eligible_for_calculation


def test_photo_does_not_change_the_commercial_proof():
    p = product()
    changed = SourceProduct.model_validate({**p.model_dump(), 'image_url': 'https://example.test/photo.jpg'})
    assert normalize_sale(INGREDIENT, changed, DAY, review(p)).eligible_for_calculation


@pytest.mark.parametrize('change', [{'ingredient_id': 'ing_other'}, {'product_id': 'metro::other'}])
def test_proof_cannot_be_reused_for_another_ingredient_or_product(change):
    p = product()
    result = normalize_sale(INGREDIENT, p, DAY, review(p, **change))
    assert result.review_status == 'identity_mismatch' and not result.eligible_for_calculation


def test_weight_price_keeps_denominator_and_discrete_sale_constraints():
    result = normalize(price_basis='weight', format_raw='vendu au poids',
        price_per_quantity={'amount': '1', 'unit': 'kg'},
        sale_increment={'amount': '0.1', 'unit': 'kg'}, minimum_sale={'amount': '0.3', 'unit': 'kg'})
    assert result.eligible_for_calculation
    assert result.content_per_package is None and result.dimension == 'mass'
    assert result.price_per_quantity.amount == '1000' and result.price_per_quantity.unit == 'g'
    assert result.sale_increment.amount == '100' and result.minimum_sale.amount == '300'
    assert result.applicable_price == '3.79'  # pas de division ni d'arrondi par gramme


def test_weight_price_per_pound_has_exact_denominator():
    result = normalize(price_basis='weight', format_raw='poids variable',
        price_per_quantity={'amount': '1', 'unit': 'lb'},
        sale_increment={'amount': '0.25', 'unit': 'lb'}, minimum_sale={'amount': '0.25', 'unit': 'lb'})
    assert result.eligible_for_calculation
    assert result.price_per_quantity.amount == '453.59237'
    assert result.sale_increment.amount == '113.3980925'


@pytest.mark.parametrize('patch,code', [
    ({'price_per_quantity': None}, 'PRICE_DENOMINATOR_UNKNOWN_OR_INCOMPATIBLE'),
    ({'price_per_quantity': {'amount': '1', 'unit': 'oz'}}, 'PRICE_DENOMINATOR_UNKNOWN_OR_INCOMPATIBLE'),
    ({'price_per_quantity': {'amount': '1', 'unit': 'L'}}, 'PRICE_DENOMINATOR_UNKNOWN_OR_INCOMPATIBLE'),
    ({'sale_increment': None}, 'SALE_INCREMENT_UNKNOWN_OR_INCOMPATIBLE'),
    ({'minimum_sale': None}, 'MINIMUM_SALE_UNKNOWN_OR_INCOMPATIBLE'),
    ({'minimum_sale': {'amount': '150', 'unit': 'g'}}, 'MINIMUM_NOT_MULTIPLE_OF_INCREMENT'),
    ({'format_raw': '500 g'}, 'FIXED_PACKAGE_WITH_MEASURED_PRICE'),
    ({'format_raw': None}, 'MEASURED_SALE_MODE_UNVERIFIED'),
])
def test_weight_ambiguities_are_excluded(patch, code):
    values = dict(price_basis='weight', format_raw='poids variable',
        price_per_quantity={'amount': '1', 'unit': 'kg'},
        sale_increment={'amount': '100', 'unit': 'g'}, minimum_sale={'amount': '100', 'unit': 'g'})
    values.update(patch)
    result = normalize(**values)
    assert code in result.issues and not result.eligible_for_calculation


def test_count_price_is_distinct_from_price_of_a_carton():
    result = normalize(price_basis='count', format_raw='1 unité',
        price_per_quantity={'amount': '2', 'unit': 'unit'},
        sale_increment={'amount': '1', 'unit': 'unit'}, minimum_sale={'amount': '1', 'unit': 'unit'})
    assert result.eligible_for_calculation and result.dimension == 'count'
    assert result.price_per_quantity.amount == '2' and result.content_per_package is None
    carton = normalize(format_raw='12 unités')
    assert carton.content_per_package.amount == '12' and carton.price_basis == 'package'


@pytest.mark.parametrize('amount', ['0.5', '1.5'])
def test_count_sale_increment_is_integral(amount):
    result = normalize(price_basis='count', format_raw='1 unité',
        price_per_quantity={'amount': '1', 'unit': 'unit'},
        sale_increment={'amount': amount, 'unit': 'unit'}, minimum_sale={'amount': amount, 'unit': 'unit'})
    assert not result.eligible_for_calculation and 'FRACTIONAL_COUNT_SALE_UNSUPPORTED' in result.issues


@pytest.mark.parametrize('changes,code', [
    ({'match_status': 'proposed'}, 'MATCH_UNVERIFIED'),
    ({'match_status': 'rejected'}, 'MATCH_REJECTED'),
    ({'scope': 'unknown'}, 'SCOPE_UNVERIFIED'),
    ({'conditions': 'member'}, 'CONDITIONS_UNSUPPORTED'),
    ({'conditions': 'coupon'}, 'CONDITIONS_UNSUPPORTED'),
    ({'conditions': 'multi_buy'}, 'CONDITIONS_UNSUPPORTED'),
    ({'conditions': 'unknown'}, 'CONDITIONS_UNKNOWN'),
    ({'price_basis_raw': ''}, 'PRICE_BASIS_EVIDENCE_MISSING'),
    ({'sale_increment': {'amount': '2', 'unit': 'unit'}}, 'PACKAGE_SALE_CONSTRAINT_UNSUPPORTED'),
    ({'sale_increment': {'amount': '1', 'unit': 'oz'}}, 'SALE_INCREMENT_UNIT_UNKNOWN'),
])
def test_product_equivalence_scope_and_conditions_are_explicit_gates(changes, code):
    result = normalize(**changes)
    assert code in result.issues and not result.eligible_for_calculation


def test_missing_store_is_not_a_verified_store_but_retailer_scope_can_be_attested():
    p = product(store_id=None)
    assert not normalize(p).eligible_for_calculation
    assert normalize(p, scope='retailer').eligible_for_calculation


@pytest.mark.parametrize('price', ['0', '0.00'])
def test_verified_zero_is_distinct_from_missing_price(price):
    p = product(price=price)
    assert 'ZERO_PRICE_UNVERIFIED' in normalize(p).issues
    assert normalize(p, zero_price_verified=True).eligible_for_calculation
    unknown = normalize(product(price=None))
    assert unknown.applicable_price is None and 'PRICE_UNKNOWN' in unknown.issues
    assert unknown.format_status == 'verified'  # un prix absent ne supprime pas le produit


def test_promotion_limits_apply_only_during_confirmed_period():
    p = product(price=None, promo_price='7.77', quantity_limit=4, price_after_limit='10',
        is_promotion=True, valid_from='2026-11-12', valid_to='2026-11-18')
    proof = review(p)
    active = normalize_sale(INGREDIENT, p, DAY, proof)
    assert active.eligible_for_calculation and active.applicable_price_kind == 'promotion'
    assert (active.applicable_price, active.quantity_limit, active.price_after_limit) == ('7.77', 4, '10')
    expired = normalize_sale(INGREDIENT, p, date(2026, 11, 19), proof)
    assert expired.applicable_price is None and expired.quantity_limit is None
    assert expired.price_after_limit is None and 'PRICE_UNKNOWN' in expired.issues
    assert expired.raw_source.price_after_limit == '10'
    regular = product(**{**p.model_dump(exclude={'id'}), 'price': '12.00'})
    regular_result = normalize_sale(INGREDIENT, regular, date(2026, 11, 19), review(regular))
    assert regular_result.applicable_price == '12.00' and regular_result.applicable_price_kind == 'regular'


def test_unverifiable_promotion_does_not_use_promo_price():
    p = product(price=None, is_promotion=True, promo_price='1.00')
    result = normalize(p)
    assert result.applicable_price is None and not result.eligible_for_calculation


def test_real_catalog_is_not_silently_certified_and_reports_every_reference():
    catalog = CommonCatalog.model_validate_json(DEFAULT_CATALOG.read_text())
    before = catalog.model_dump_json()
    result = normalize_catalog(catalog, DAY)
    assert result.product_count == 93 and result.eligible_count == 0
    assert all(i.price_basis == 'unknown' and i.review_status == 'missing' for i in result.items)
    assert result.source_inputs == catalog.inputs and catalog.model_dump_json() == before
    assert result == normalize_catalog(catalog, DAY)
    assert len({(i.ingredient_id, i.product_id) for i in result.items}) == 93
    for item in result.items:
        assert NormalizedSale.model_validate_json(item.model_dump_json()) == item


def test_duplicate_reviews_and_unknown_reference_are_rejected():
    proof = review(product())
    with pytest.raises(ValidationError):
        SaleReviewDocument(reviews=[proof, proof])
    catalog = CommonCatalog.model_validate_json(DEFAULT_CATALOG.read_text())
    with pytest.raises(ValueError):
        normalize_catalog(catalog, DAY, [proof])


@pytest.mark.parametrize('bad', ['0', '-1', 'NaN', 'Infinity', '1e3', 2.5, True])
def test_review_quantities_do_not_accept_ambiguous_or_nonpositive_numbers(bad):
    with pytest.raises(ValidationError):
        review(product(), price_per_quantity={'amount': bad, 'unit': 'kg'})


def test_cli_is_reproducible_and_keeps_source_unchanged(tmp_path, monkeypatch):
    destination = tmp_path / 'report.json'
    before = DEFAULT_CATALOG.read_bytes()
    monkeypatch.setattr('sys.argv', ['normalize-sales', '--output', str(destination), '--on-date', str(DAY)])
    assert cli.main() == 0
    first = destination.read_bytes()
    assert cli.main() == 0 and destination.read_bytes() == first
    assert DEFAULT_CATALOG.read_bytes() == before
    assert json.loads(first)['product_count'] == 93


def test_cli_refuses_to_overwrite_sources_or_connect_with_invalid_reviews(tmp_path, monkeypatch):
    monkeypatch.setattr('sys.argv', ['normalize-sales', '--output', str(DEFAULT_CATALOG)])
    assert cli.main() == 1
    invalid = tmp_path / 'reviews.json'
    invalid.write_text('{"reviews":[{"price_basis":"package"}]}')
    class ForbiddenDatabase:
        def __init__(self, *_):
            raise AssertionError('Aucune connexion ne devait être créée.')
    monkeypatch.setattr(cli, 'Database', ForbiddenDatabase)
    output = tmp_path / 'absent.json'
    monkeypatch.setattr('sys.argv', ['normalize-sales', '--source', 'database', '--reviews', str(invalid), '--output', str(output)])
    assert cli.main() == 1 and not output.exists()
