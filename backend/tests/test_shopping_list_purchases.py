"""Calculs commerciaux et oracle indépendant sur de petits paniers exhaustifs."""
from datetime import date
from decimal import Decimal, localcontext
from itertools import product as combinations
import random

import pytest

from backend.app.catalog.sales import normalize_sale
from backend.app.shopping_lists.purchases import SearchLimits, calculate_coverage
from backend.app.shopping_lists.schemas import ShoppingQuantity
from backend.tests.test_sale_normalization import product, review, INGREDIENT, DAY


def quantity(amount, unit='g'):
    return ShoppingQuantity(amount=str(amount), unit=unit)


def sale(size='500', price='3', identity='a', store='8661', retailer='maxi', **changes):
    p = product(quantity=str(size), price=None if price is None else str(price), external_product_id=identity,
                store_id=store, retailer=retailer, **changes)
    return normalize_sale(INGREDIENT, p, DAY, review(p, format_raw=f'{size} {p.unit}'))


def calculate(amount, sales, **kwargs):
    return calculate_coverage(INGREDIENT, [quantity(amount)], sales, DAY, **kwargs)


@pytest.mark.parametrize('need,size,price,units,total,surplus', [
    ('500', '1000', '3.79', 1, '3.79', '500'),
    ('2000', '500', '3', 4, '12.00', '0'),
    ('500.000001', '500', '3', 2, '6.00', '499.999999'),
    ('0.000002', '0.000001', '0.005', 2, '0.01', '0'),
])
def test_single_package_ceil_and_line_rounding(need, size, price, units, total, surplus):
    result = calculate(need, [sale(size, price)])
    assert result.best.amount == total and result.best.surplus == surplus
    assert result.best.lines[0].sale_units == units


def test_single_format_is_solved_without_enumerating_millions_of_packages():
    result = calculate(1000000, [sale(1, '0.01')])
    assert result.best.amount == '10000.00'
    assert result.best.lines[0].sale_units == 1000000
    assert result.best.combinations == 1


def test_mixed_formats_beat_greedy_package_choice():
    result = calculate(1000, [sale(600, 4, 'large'), sale(400, 3, 'small')])
    assert result.best.amount == '7.00'
    assert sorted(line.quantity for line in result.best.lines) == ['400', '600']


def test_promotion_is_shared_across_all_contributions():
    limited = sale(1, None, unit='unit', is_promotion=True, promo_price='7.77',
                   quantity_limit=4, price_after_limit='10',
                   valid_from='2026-11-12', valid_to='2026-11-18')
    result = calculate_coverage(INGREDIENT, [quantity(2, 'unit'), quantity(3, 'unit')], [limited], DAY)
    assert result.best.amount == '41.08'
    assert len(result.best.lines) == 1 and result.best.lines[0].sale_units == 5


def test_remaining_purchases_do_not_reset_promotion_limit():
    limited = sale(500, 12, is_promotion=True, promo_price='7.77', quantity_limit=4,
                   price_after_limit='10', valid_from='2026-11-12', valid_to='2026-11-18')
    result = calculate(2500, [limited], purchased=[quantity(2000)],
                       reserved_units={limited.product_id: 4})
    assert result.best.amount == '10.00' and result.remaining == '500'
    unknown = calculate(2500, [limited], purchased=[quantity(2000)])
    assert unknown.best is None
    assert 'PROMOTION_USAGE_UNKNOWN' in unknown.excluded[0][1]


@pytest.mark.parametrize('day', [date(2026, 11, 11), date(2026, 11, 19)])
def test_expired_or_future_promotion_uses_regular_only(day):
    limited = sale(500, None, is_promotion=True, promo_price='2', quantity_limit=4,
                   price_after_limit='10', valid_from='2026-11-12', valid_to='2026-11-18')
    result = calculate_coverage(INGREDIENT, [quantity(500)], [limited], day)
    assert result.best is None and 'PRICE_UNKNOWN' in result.excluded[0][1]
    regular = sale(500, 12, is_promotion=True, promo_price='2', quantity_limit=4,
                   price_after_limit='10', valid_from='2026-11-12', valid_to='2026-11-18')
    assert calculate_coverage(INGREDIENT, [quantity(500)], [regular], day).best.amount == '12.00'


def measured(*, basis='weight', denominator='1000', increment='100', minimum='300', price='3.79'):
    p = product(price=price)
    unit = 'g' if basis == 'weight' else 'unit'
    proof = review(p, format_raw='poids variable' if basis == 'weight' else f'{increment} unités',
                   price_basis=basis, price_per_quantity={'amount': denominator, 'unit': unit},
                   sale_increment={'amount': increment, 'unit': unit},
                   minimum_sale={'amount': minimum, 'unit': unit})
    return normalize_sale(INGREDIENT, p, DAY, proof)


def test_weight_uses_denominator_increment_minimum_and_estimation():
    result = calculate(250, [measured()])
    assert result.best.amount == '1.14' and result.best.surplus == '50'
    assert result.best.lines[0].estimated_weight
    assert result.best.lines[0].quantity == '300'
    assert calculate(350, [measured()]).best.amount == '1.52'


def test_count_uses_sale_steps_and_minimum():
    result = calculate_coverage(INGREDIENT, [quantity(3, 'unit')],
        [measured(basis='count', denominator='1', increment='2', minimum='4', price='0.5')], DAY)
    assert result.best.amount == '2.00' and result.best.surplus == '1'
    assert not result.best.lines[0].estimated_weight


def test_measured_and_fixed_formats_can_be_combined():
    result = calculate(750, [sale(500, 1), measured(increment='250', minimum='250', price='3')])
    assert result.best.amount == '1.75'
    assert len(result.best.lines) == 2


def test_exact_calculation_under_low_decimal_precision():
    with localcontext() as context:
        context.prec = 2
        result = calculate('999.999999', [sale('333.333333', '12345.6789')])
        assert result.best.amount == '37037.04' and result.best.surplus == '0'
        result = calculate('500', [measured(denominator='453.59237', increment='1', minimum='1')])
        assert result.best.amount == '4.18'


def test_zero_requires_attestation_and_unknown_is_not_free():
    free = sale(500, 0)
    assert calculate(500, [free]).best is None
    proof = free.review.model_copy(update={'zero_price_verified': True})
    free = normalize_sale(INGREDIENT, free.raw_source, DAY, proof)
    assert calculate(500, [free]).best.amount == '0.00'
    assert calculate(500, [sale(500, None)]).best is None


def test_exclusions_preserve_provenance_and_revalidate_inputs():
    valid = sale()
    stale = valid.model_copy(update={'raw_source': valid.raw_source.model_copy(update={'price': '9'})})
    result = calculate(500, [stale])
    assert result.best is None and 'REVIEW_STALE' in result.excluded[0][1]
    member = normalize_sale(INGREDIENT, valid.raw_source, DAY,
                            valid.review.model_copy(update={'conditions': 'member'}))
    assert 'CONDITIONS_UNSUPPORTED' in calculate(500, [member]).excluded[0][1]
    incompatible = calculate_coverage(INGREDIENT, [quantity(500, 'ml')], [valid], DAY)
    assert incompatible.best is None and 'NEED_DIMENSION_INCOMPATIBLE' in incompatible.excluded[0][1]


def test_normalization_flag_cannot_bypass_missing_review():
    valid = sale().model_copy(update={'review': None, 'eligible_for_calculation': True})
    assert calculate(500, [valid]).best is None


def test_duplicates_rejected_instead_of_doubling_discount():
    with pytest.raises(ValueError, match='instantanés'):
        calculate(1000, [sale(), sale()])


def test_stores_never_split_one_need_to_multiply_discounts():
    sales = [sale(500, 10, identity='a', store=store, is_promotion=True, promo_price='1',
                  quantity_limit=1, price_after_limit='10',
                  valid_from='2026-11-12', valid_to='2026-11-18') for store in ('1', '2')]
    result = calculate(1000, sales)
    assert len(result.stores) == 2 and result.best.amount == '11.00'
    assert result.best.store_id == '1'


def test_equal_cost_prefers_surplus_then_reference_count_then_stable_ids():
    sales = [sale(600, 2, 'a'), sale(500, 2, 'b')]
    assert calculate(500, sales).best.lines[0].sale.product_id.endswith(':b')
    sales = [sale(1000, 4, 'z'), sale(500, 2, 'a')]
    assert calculate(1000, sales).best.lines[0].sale.product_id.endswith(':a')
    sales = [sale(1000, 4, 'z'), sale(600, 2, 'a'), sale(400, 2, 'b')]
    assert calculate(1000, sales).best.lines[0].sale.product_id.endswith(':z')
    assert calculate(1000, sales) == calculate(1000, list(reversed(sales)))


@pytest.mark.parametrize('limits', [SearchLimits(max_references=1), SearchLimits(max_options=2),
                                 SearchLimits(max_combinations=2)])
def test_search_limits_never_claim_approximate_optimum(limits):
    result = calculate(1000, [sale(600, 4, 'a'), sale(400, 3, 'b')], limits=limits)
    assert result.best is None and result.stores[0].status == 'search_limit'
    assert result.stores[0].amount is None and result.stores[0].lines == ()


def test_unknown_store_search_blocks_global_minimum_claim():
    result = calculate(1000, [sale(600, 1, 'a'), sale(400, 1, 'b'),
                             sale(1000, 20, 'c', store='2')], limits=SearchLimits(max_combinations=2))
    assert any(s.status == 'complete' for s in result.stores)
    assert result.best is None


def test_possession_and_purchases_are_subtracted_without_mutation():
    result = calculate(1000, [sale()], owned=[quantity(200)], purchased=[quantity(300)])
    assert result.remaining == '500' and result.best.amount == '3.00'
    assert calculate(1000, [sale()], owned=[quantity(2, 'kg')]).status == 'already_covered'
    assert calculate_coverage(INGREDIENT, [], [], DAY).status == 'unquantified'
    assert calculate_coverage(INGREDIENT, [quantity(1), quantity(1, 'ml')], [], DAY).status == 'incompatible_units'
    assert calculate(500, [sale()], owned=[quantity(1, 'unit')]).status == 'incompatible_units'


def test_compatible_units_are_summed_before_purchase_rounding():
    result = calculate_coverage(INGREDIENT, [quantity(250, 'ml'), quantity(1, 'cup')],
                                [sale(500, 3, unit='ml')], DAY)
    assert result.remaining == '500' and result.best.amount == '3.00'


@pytest.mark.parametrize('bad', [0, -1, True, 1.5])
def test_search_budgets_are_validated(bad):
    with pytest.raises(ValueError):
        SearchLimits(max_combinations=bad)


@pytest.mark.parametrize('bad', [-1, True, 1.5])
def test_reserved_purchase_units_are_validated(bad):
    with pytest.raises(ValueError):
        calculate(500, [sale()], reserved_units={'maxi:8661:a': bad})


@pytest.mark.parametrize('seed', range(15))
def test_measured_minimum_and_rounding_against_independent_oracle(seed):
    rng = random.Random(seed)
    need = rng.randint(1, 12)
    size = rng.randint(1, 6)
    step = rng.randint(1, 3)
    minimum_steps = rng.randint(1, 3)
    fixed = sale(size, '0.015')
    weighted = measured(denominator='3', increment=str(step),
                        minimum=str(step * minimum_steps), price='0.01')
    candidates = []
    for packages in range(need + 2):
        for steps in [0, *range(minimum_steps, need + minimum_steps + 2)]:
            covered = packages * size + steps * step
            if covered < need:
                continue
            # Arrondi HALF_UP indépendant, sur des montants rationnels simples.
            fixed_cents = (packages * 3 + 1) // 2
            weight_cents = (2 * steps * step + 3) // 6
            used = tuple((s.product_id, n) for s, n in ((fixed, packages), (weighted, steps)) if n)
            candidates.append((fixed_cents + weight_cents, covered - need, len(used), used))
    expected = min(candidates)
    actual = calculate(need, [weighted, fixed]).best
    assert Decimal(actual.amount) * 100 == expected[0]
    assert Decimal(actual.surplus) == expected[1]
    assert tuple((line.sale.product_id, line.sale_units) for line in actual.lines) == expected[3]


@pytest.mark.parametrize('seed', range(35))
def test_independent_exhaustive_oracle_with_tiers_and_ties(seed):
    rng = random.Random(seed)
    need = rng.randint(1, 12)
    sizes = [rng.randint(1, 7) for _ in range(3)]
    prices = [rng.randint(0, 8) for _ in range(3)]
    limits = [rng.randint(1, 3) for _ in range(3)]
    sales = []
    for i in range(3):
        s = sale(sizes[i], prices[i] + 2, str(i), is_promotion=True,
                 promo_price=str(prices[i]), quantity_limit=limits[i],
                 price_after_limit=str(prices[i] + 2), valid_from='2026-11-12', valid_to='2026-11-18')
        if prices[i] == 0:
            s = normalize_sale(INGREDIENT, s.raw_source, DAY,
                               s.review.model_copy(update={'zero_price_verified': True}))
        sales.append(s)
    candidates = []
    # Borne volontairement plus grande que celle du solveur, et calcul entier
    # indépendant de purchase_total et de son arrondi.
    for counts in combinations(range(need + 2), repeat=3):
        covered = sum(n * size for n, size in zip(counts, sizes))
        if covered < need:
            continue
        cost = sum(min(n, cap) * p + max(0, n - cap) * (p + 2)
                   for n, cap, p in zip(counts, limits, prices)) * 100
        used = tuple((s.product_id, n) for s, n in zip(sales, counts) if n)
        candidates.append((cost, covered - need, len(used), used))
    expected = min(candidates)
    actual = calculate(need, sales).best
    assert Decimal(actual.amount) * 100 == expected[0]
    assert Decimal(actual.surplus) == expected[1]
    assert tuple((line.sale.product_id, line.sale_units) for line in actual.lines) == expected[3]
