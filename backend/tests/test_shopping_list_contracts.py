"""Invariants des futurs échanges de listes, sans base ni routes simulées."""
from copy import deepcopy

from pydantic import ValidationError
import pytest

from backend.app.main import create_app
from backend.app.shopping_lists.contracts import MODELS, examples
from backend.app.shopping_lists.schemas import (
    ShoppingCalendarPreviewWrite, ShoppingCommand, ShoppingCommandHeaders,
    ShoppingConflictResponse, ShoppingCoverage, ShoppingFromCalendar,
    ShoppingItemRead, ShoppingItemUpdate, ShoppingListCreate, ShoppingListRead,
    ShoppingListUpdate, ShoppingManualPurchaseRead, ShoppingManualPurchaseWrite,
    ShoppingQuantity, ShoppingTotals,
)


def resource():
    return examples()['shopping-list-detail']['item']


@pytest.mark.parametrize('value', [0.1, 2, True, 'NaN', 'Infinity', '-1', '0', '1,5', '1e2'])
def test_needs_are_positive_exact_decimal_strings(value):
    with pytest.raises(ValidationError):
        ShoppingQuantity(amount=value, unit='g')


def test_fractional_food_units_are_valid_without_inventing_package_counts():
    assert ShoppingQuantity(amount='0.5', unit='unit').amount == '0.5'
    with pytest.raises(ValidationError):
        ShoppingQuantity(amount='2', unit='package')


@pytest.mark.parametrize('revision', [0, -1, True, '1', 1.5, None])
def test_existing_resources_require_a_strict_positive_revision(revision):
    with pytest.raises(ValidationError):
        ShoppingCommand(expected_revision=revision)


def test_creation_has_no_client_revision_owner_or_default_server_date():
    created = ShoppingListCreate(name='  Mes courses  ')
    assert created.name == 'Mes courses' and created.purchase_date is None
    for extra in [{'expected_revision': 1}, {'owner_id': 'someone'}, {'status': 'active'}]:
        with pytest.raises(ValidationError):
            ShoppingListCreate(name='Courses', **extra)
    with pytest.raises(ValidationError):
        ShoppingListCreate(name='   ')


def test_idempotency_key_is_separate_from_body_and_a_uuid():
    assert ShoppingCommandHeaders.model_validate(examples()['shopping-list-command-headers'])
    with pytest.raises(ValidationError):
        ShoppingCommandHeaders(idempotency_key='')
    with pytest.raises(ValidationError):
        ShoppingListCreate(name='Courses', idempotency_key=examples()['shopping-list-command-headers']['idempotency_key'])


def test_dates_are_inclusive_and_invalid_or_reversed_periods_fail():
    preview = ShoppingCalendarPreviewWrite(start_date='2026-11-16', end_date='2026-11-16')
    assert preview.start_date == preview.end_date
    for start, end in [('2026-11-17', '2026-11-16'), ('2026-02-30', '2026-03-01')]:
        with pytest.raises(ValidationError):
            ShoppingCalendarPreviewWrite(start_date=start, end_date=end)


def test_calendar_creation_requires_fingerprint_and_explicit_partial_acceptance():
    body = examples()['shopping-list-from-calendar']
    assert ShoppingFromCalendar.model_validate(body).accept_partial is False
    for patch in [{'preview_fingerprint': 'bad'}, {'accept_partial': 'true'}, {'expected_revision': 1}]:
        with pytest.raises(ValidationError):
            ShoppingFromCalendar.model_validate({**body, **patch})


def test_updates_distinguish_no_change_from_explicit_unknown_quantity():
    for model in [ShoppingListUpdate, ShoppingItemUpdate]:
        with pytest.raises(ValidationError):
            model(expected_revision=1)
        with pytest.raises(ValidationError):
            model(expected_revision=1, name=None)
    update = ShoppingItemUpdate(expected_revision=1, quantity=None)
    assert update.model_dump(exclude_unset=True) == {'expected_revision': 1, 'quantity': None}
    assert ShoppingItemUpdate(expected_revision=1, removed=False).removed is False
    with pytest.raises(ValidationError):
        ShoppingItemUpdate(expected_revision=1, removed=None)


def test_unpriced_free_article_can_be_bought_and_unchecked_without_product():
    bought = ShoppingManualPurchaseWrite(expected_revision=4, purchased=True,
                                         coverage={'confirms_unquantified': True})
    assert bought.coverage.confirms_unquantified
    assert ShoppingManualPurchaseWrite(expected_revision=5, purchased=False, coverage={})
    read = ShoppingManualPurchaseRead.model_validate(resource()['purchases'][1])
    assert read.product_id is None and read.estimated_amount is None


@pytest.mark.parametrize('purchased,coverage', [
    (True, {}), (False, {'confirms_unquantified': True}),
    (False, {'quantities': [{'amount': '1', 'unit': 'g'}]}),
    (True, {'confirms_unquantified': True, 'quantities': [{'amount': '1', 'unit': 'g'}]}),
    ('true', {'confirms_unquantified': True}),
])
def test_purchase_commands_cannot_ambiguously_toggle_or_claim_coverage(purchased, coverage):
    with pytest.raises(ValidationError):
        ShoppingManualPurchaseWrite(expected_revision=4, purchased=purchased, coverage=coverage)


def test_coverage_keeps_incompatible_dimensions_separate_but_not_duplicate_units():
    assert len(ShoppingCoverage(quantities=[{'amount': '200', 'unit': 'g'},
                                          {'amount': '250', 'unit': 'ml'}]).quantities) == 2
    with pytest.raises(ValidationError):
        ShoppingCoverage(quantities=[{'amount': '200', 'unit': 'g'}, {'amount': '100', 'unit': 'g'}])
    with pytest.raises(ValidationError):
        ShoppingCoverage(quantities=[{'amount': '1', 'unit': 'cup'}])


def test_old_unquantified_purchase_is_retained_when_need_changes_but_not_rebound():
    data = resource()
    paper = data['items'][1]
    paper.update(need_revision=2, required=[{'amount': '2', 'unit': 'unit'}], coverage_status='remaining')
    data['totals'].update(remaining_item_count=2, purchased_item_count=0)
    result = ShoppingListRead.model_validate(data)
    assert result.purchases[1].confirmed_need_revision == 1
    assert result.items[1].need_revision == 2
    data['purchases'][1]['confirmed_need_revision'] = 2
    with pytest.raises(ValidationError):
        ShoppingListRead.model_validate(data)


def test_old_unquantified_possession_is_retained_for_review_after_quantity_added():
    item = resource()['items'][1]
    item.update(need_revision=2, required=[{'amount': '1', 'unit': 'unit'}],
                owned_unquantified_need_revision=1, coverage_status='remaining')
    assert ShoppingItemRead.model_validate(item)
    item['owned_unquantified_need_revision'] = 2
    with pytest.raises(ValidationError):
        ShoppingItemRead.model_validate(item)


def test_read_graph_rejects_cross_list_purchase_duplicate_ids_and_naive_timestamps():
    data = resource()
    for patch in ['foreign_purchase', 'duplicate_item', 'duplicate_purchase', 'naive_time', 'manual_period']:
        bad = deepcopy(data)
        if patch == 'foreign_purchase':
            bad['purchases'][0]['item_id'] = '00000000-0000-4000-8000-999999999999'
        elif patch == 'duplicate_item':
            bad['items'].append(deepcopy(bad['items'][0]))
        elif patch == 'duplicate_purchase':
            bad['purchases'].append(deepcopy(bad['purchases'][0]))
        elif patch == 'naive_time':
            bad['updated_at'] = '2026-11-14T18:05:00'
        else:
            bad['period'] = {'start_date': '2026-11-16', 'end_date': '2026-11-22'}
        with pytest.raises(ValidationError):
            ShoppingListRead.model_validate(bad)


def test_coverage_counters_partition_without_double_counting_mixed_items():
    totals = resource()['totals']
    assert ShoppingTotals.model_validate(totals)
    for patch in [{'owned_item_count': 1}, {'partial_item_count': 2},
                  {'estimate_complete': True}, {'remaining_known_amount': '1.00'}]:
        with pytest.raises(ValidationError):
            ShoppingTotals.model_validate({**totals, **patch})
    data = resource()
    data['items'][0]['coverage_status'] = 'owned'
    with pytest.raises(ValidationError):
        ShoppingListRead.model_validate(data)


def test_zero_known_is_not_a_complete_or_paid_estimate():
    data = resource()
    result = ShoppingListRead.model_validate(data)
    assert result.totals.budget_known_amount == '0'
    assert result.totals.unpriced_item_count == 2 and not result.totals.estimate_complete
    data['purchases'][0]['estimated_amount'] = '0'
    with pytest.raises(ValidationError):
        ShoppingListRead.model_validate(data)
    data = resource()
    data['totals']['budget_known_amount'] = '12.00'
    with pytest.raises(ValidationError):
        ShoppingListRead.model_validate(data)


def test_calendar_contributions_require_readable_recipe_provenance():
    item = examples()['shopping-list-calendar-preview-detail']['item']['items'][0]
    assert ShoppingItemRead.model_validate(item)
    item['contributions'][0]['recipe_version'] = None
    with pytest.raises(ValidationError):
        ShoppingItemRead.model_validate(item)


def test_conflict_carries_the_right_context():
    conflict = examples()['shopping-list-conflict']
    assert ShoppingConflictResponse.model_validate(conflict)
    conflict['error']['current_revision'] = None
    with pytest.raises(ValidationError):
        ShoppingConflictResponse.model_validate(conflict)


def test_all_examples_roundtrip_and_lot_a_routes_are_available():
    for name, example in examples().items():
        assert MODELS[name].model_validate_json(MODELS[name].model_validate(example).model_dump_json(exclude_unset=True))
    assert '/api/v1/shopping-lists/from-calendar' in create_app().openapi()['paths']
