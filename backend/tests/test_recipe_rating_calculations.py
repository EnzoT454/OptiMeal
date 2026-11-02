"""Résultats attendus et propriétés du calcul pondéré et du classement."""
from decimal import Decimal, localcontext

import pytest

from backend.app.recipes.ratings import ranking_score, summarize_ratings


def summary(count, taste, reliability, ease, **kwargs):
    return summarize_ratings(count=count, taste_total=taste, reliability_total=reliability,
                             ease_total=ease, **kwargs)


def test_no_votes_have_no_average_or_ranking_score():
    result = summary(0, 0, 0, 0)
    assert result.count == 0
    assert (result.average, result.taste, result.reliability, result.ease, result.ranking_score) == (None,) * 5


def test_weighted_example_retains_criteria_and_unrounded_public_average():
    result = summary(10, 48, 45, 30)
    assert result.count == 10
    assert (result.taste, result.reliability, result.ease) == (Decimal('4.8'), Decimal('4.5'), Decimal('3.0'))
    assert result.average == Decimal('4.32')
    assert result.ranking_score != result.average


def test_each_criterion_has_its_intended_weight():
    baseline = summary(1, 1, 1, 1).average
    assert summary(1, 2, 1, 1).average - baseline == Decimal('0.4')
    assert summary(1, 1, 2, 1).average - baseline == Decimal('0.4')
    assert summary(1, 1, 1, 2).average - baseline == Decimal('0.2')


def test_adjusted_ranking_matches_example_order_without_changing_public_notes():
    examples = [
        ('omelette', Decimal('5.0'), 2),
        ('curry', Decimal('4.7'), 100),
        ('pâtes', Decimal('4.6'), 50),
        ('salade', Decimal('4.8'), 5),
    ]
    ordered = sorted(examples, key=lambda row: ranking_score(row[1], row[2]), reverse=True)
    assert [row[0] for row in ordered] == ['curry', 'pâtes', 'salade', 'omelette']
    assert ranking_score(Decimal('4.7'), 100).quantize(Decimal('0.01')) == Decimal('4.58')
    assert ranking_score(Decimal('5.0'), 2).quantize(Decimal('0.01')) == Decimal('4.09')


@pytest.mark.parametrize('average', [Decimal('1'), Decimal('3.25'), Decimal('4'), Decimal('5')])
def test_ranking_stays_between_reference_and_real_average_and_converges(average):
    reference = Decimal('4')
    first = ranking_score(average, 1)
    many = ranking_score(average, 10000)
    assert min(reference, average) <= first <= max(reference, average)
    assert abs(many - average) <= abs(first - average)


def test_reference_parameters_can_change_without_replacing_raw_votes():
    usual = summary(1, 5, 5, 5)
    stronger = summary(1, 5, 5, 5, prior_weight=100)
    lower = summary(1, 5, 5, 5, reference_average=Decimal('3'))
    assert usual.average == stronger.average == lower.average == Decimal(5)
    assert stronger.ranking_score < usual.ranking_score
    assert lower.ranking_score < usual.ranking_score


def test_division_does_not_round_to_display_precision_or_depend_on_callers_context():
    expected = summary(3, 13, 14, 10)
    assert expected.average == Decimal(128) / 30
    assert expected.taste == Decimal(13) / 3
    with localcontext() as context:
        context.prec = 3
        assert summary(3, 13, 14, 10) == expected


def test_close_scores_are_not_tied_by_display_rounding():
    first = ranking_score(Decimal('4.71'), 100)
    second = ranking_score(Decimal('4.72'), 100)
    assert first < second
    assert first.quantize(Decimal('0.1')) == second.quantize(Decimal('0.1'))


def test_recomputing_after_edit_and_removal_keeps_correct_count():
    # Deux votes : (5, 4, 3) et (1, 2, 5), puis modification du premier en (3, 3, 3).
    before = summary(2, 6, 6, 8)
    edited = summary(2, 4, 5, 8)
    remaining = summary(1, 1, 2, 5)
    assert before.count == edited.count == 2
    assert before.average == Decimal('3.2')
    assert edited.average == Decimal('2.6')
    assert remaining.average == Decimal('2.2') and remaining.count == 1
    assert summary(0, 0, 0, 0).average is None


@pytest.mark.parametrize('count', [-1, True, 1.0, '1'])
def test_invalid_counts_are_rejected(count):
    with pytest.raises(ValueError):
        summary(count, 1, 1, 1)
    with pytest.raises(ValueError):
        ranking_score(Decimal(4), count)


@pytest.mark.parametrize('count,total', [(0, 1), (1, 0), (1, 6), (2, 1), (2, 11), (1, None), (1, True), (1, 4.0)])
@pytest.mark.parametrize('field', ['taste_total', 'reliability_total', 'ease_total'])
def test_invalid_totals_are_rejected_before_returning_a_summary(count, total, field):
    values = dict(count=count, taste_total=count, reliability_total=count, ease_total=count)
    with pytest.raises(ValueError):
        summarize_ratings(**{**values, field: total})


@pytest.mark.parametrize('value', [None, Decimal('NaN'), Decimal('Infinity'), Decimal('0'), Decimal('5.1'), 4.0])
def test_invalid_averages_or_reference_are_rejected(value):
    with pytest.raises(ValueError):
        ranking_score(value, 1)
    with pytest.raises(ValueError):
        ranking_score(Decimal(4), 1, reference_average=value)


@pytest.mark.parametrize('weight', [0, -1, True, 20.0])
def test_invalid_prior_weights_are_rejected(weight):
    with pytest.raises(ValueError):
        ranking_score(Decimal(4), 1, prior_weight=weight)


def test_a_numeric_average_without_votes_is_rejected():
    with pytest.raises(ValueError):
        ranking_score(Decimal(4), 0)


@pytest.mark.parametrize('score', [1, 5])
def test_unanimous_extreme_votes_keep_exact_public_average(score):
    result = summary(123, score * 123, score * 123, score * 123)
    assert result.average == result.taste == result.reliability == result.ease == Decimal(score)
