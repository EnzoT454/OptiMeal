"""Exports du lot A : schémas et exemples validés des routes de listes."""
from backend.app.common.contracts import Detail, Page
from .schemas import (
    ShoppingCalendarPreviewRead, ShoppingCalendarPreviewWrite, ShoppingCommand,
    ShoppingDraftPricingWrite, ShoppingDraftPricingRead, ShoppingRecalculatePricesWrite,
    ShoppingCommandHeaders, ShoppingConflictResponse, ShoppingFromCalendar,
    ShoppingItemAdd, ShoppingItemUpdate, ShoppingListCreate, ShoppingListRead,
    ShoppingListUpdate, ShoppingManualPurchaseWrite, ShoppingPossessionWrite,
    ShoppingComparisonRead, ShoppingApplyComparison, ShoppingChoiceWrite, ShoppingProductPurchaseWrite, ShoppingCompleteWrite,
)

from .access_schemas import ShoppingPinRead, ShoppingPinWrite
from .reuse_schemas import (
    ShoppingDuplicateWrite, ShoppingExclusionRead, ShoppingExclusionWrite,
    ShoppingTemplateCreate, ShoppingTemplateRead,
    ShoppingTemplateUpdate, ShoppingTemplateInstantiate,
)

MODELS = {
    'shopping-list-recalculate-prices': ShoppingRecalculatePricesWrite,
    'shopping-draft-pricing-write': ShoppingDraftPricingWrite,
    'shopping-draft-pricing-detail': Detail[ShoppingDraftPricingRead],
    'shopping-list-pin-write': ShoppingPinWrite,
    'shopping-list-pin-detail': Detail[ShoppingPinRead],
    'shopping-list-duplicate-write': ShoppingDuplicateWrite,
    'shopping-template-create': ShoppingTemplateCreate,
    'shopping-template-update': ShoppingTemplateUpdate,
    'shopping-template-instantiate': ShoppingTemplateInstantiate,
    'shopping-template-detail': Detail[ShoppingTemplateRead],
    'shopping-templates-page': Page[ShoppingTemplateRead],
    'shopping-exclusion-write': ShoppingExclusionWrite,
    'shopping-exclusion-detail': Detail[ShoppingExclusionRead],
    'shopping-exclusions-page': Page[ShoppingExclusionRead],
    'shopping-list-product-purchase-write': ShoppingProductPurchaseWrite,
    'shopping-list-complete-write': ShoppingCompleteWrite,
    'shopping-list-comparison-detail': Detail[ShoppingComparisonRead],
    'shopping-list-apply-comparison': ShoppingApplyComparison,
    'shopping-list-choice-write': ShoppingChoiceWrite,
    'shopping-list-create': ShoppingListCreate,
    'shopping-list-command-headers': ShoppingCommandHeaders,
    'shopping-list-command': ShoppingCommand,
    'shopping-list-update': ShoppingListUpdate,
    'shopping-list-item-add': ShoppingItemAdd,
    'shopping-list-item-update': ShoppingItemUpdate,
    'shopping-list-manual-purchase-write': ShoppingManualPurchaseWrite,
    'shopping-list-possession-write': ShoppingPossessionWrite,
    'shopping-list-calendar-preview-write': ShoppingCalendarPreviewWrite,
    'shopping-list-from-calendar': ShoppingFromCalendar,
    'shopping-list-calendar-preview-detail': Detail[ShoppingCalendarPreviewRead],
    'shopping-list-detail': Detail[ShoppingListRead],
    'shopping-lists-page': Page[ShoppingListRead],
    'shopping-list-conflict': ShoppingConflictResponse,
}


def examples() -> dict:
    """Données fictives explicites, validées puis exportées ; aucun prix fabriqué."""
    list_id = '00000000-0000-4000-8000-000000000001'
    rice_id = '00000000-0000-4000-8000-000000000002'
    paper_id = '00000000-0000-4000-8000-000000000003'
    meta = {'data_source': 'postgresql', 'dataset_kind': 'user_content', 'review_required': False}
    rice = {
        'id': rice_id, 'ingredient_id': 'ing_riz_basmati_blanc', 'name': 'Riz', 'category': 'Épicerie',
        'need_revision': 1, 'required': [{'amount': '2000', 'unit': 'g'}],
        'owned': [{'amount': '200', 'unit': 'g'}],
        'contributions': [{
            'id': '00000000-0000-4000-8000-000000000004', 'source': 'manual',
            'original_quantity': {'amount': '2', 'unit': 'kg'},
            'normalized_quantity': {'amount': '2000', 'unit': 'g'},
        }], 'coverage_status': 'partial', 'pricing_status': 'unpriced',
    }
    paper = {
        'id': paper_id, 'ingredient_id': None, 'name': 'Papier cuisson', 'category': 'Autres',
        'need_revision': 1, 'required': [], 'contributions': [{
            'id': '00000000-0000-4000-8000-000000000005', 'source': 'manual',
            'original_quantity': None, 'normalized_quantity': None,
        }], 'coverage_status': 'purchased', 'pricing_status': 'unpriced',
    }
    resource = {
        'id': list_id, 'name': 'Courses de démonstration', 'source': 'manual',
        'status': 'active', 'revision': 4, 'period': None, 'purchase_date': '2026-11-15',
        'items': [rice, paper], 'purchases': [{
            'id': '00000000-0000-4000-8000-000000000006', 'item_id': rice_id,
            'purchased': True, 'coverage': [{'amount': '500', 'unit': 'g'}],
        }, {
            'id': '00000000-0000-4000-8000-000000000007', 'item_id': paper_id,
            'purchased': True, 'confirmed_need_revision': 1,
        }],
        'totals': {'item_count': 2, 'remaining_item_count': 1, 'purchased_item_count': 1,
                   'owned_item_count': 0, 'partial_item_count': 1, 'unpriced_item_count': 2,
                   'uncovered_item_count': 1, 'budget_known_amount': '0',
                   'remaining_known_amount': '0', 'estimate_complete': False},
        'warnings': [{'code': 'ESTIMATE_UNAVAILABLE', 'message': 'Prix non calculés dans le lot A.'}],
        'created_at': '2026-11-14T18:00:00Z', 'updated_at': '2026-11-14T18:05:00Z',
    }
    calendar_rice = {**rice, 'owned': [], 'coverage_status': 'remaining', 'contributions': [{
        **rice['contributions'][0], 'source': 'calendar',
        'meal_entry_id': '00000000-0000-4000-8000-000000000008',
        'recipe_id': 'recipe_demo_riz', 'recipe_name': 'Riz de démonstration',
        'recipe_version': 1, 'recipe_servings': 4, 'meal_date': '2026-11-16', 'servings': 4,
    }]}
    preview_request = {'start_date': '2026-11-16', 'end_date': '2026-11-22', 'purchase_date': '2026-11-15'}
    compared_need = {'item_ids': [rice_id], 'name': 'Riz', 'ingredient_id': rice['ingredient_id'],
                     'unit': 'g', 'remaining': '1300', 'status': 'unpriced'}
    comparison = {'id': '00000000-0000-4000-8000-000000000010', 'list_id': list_id,
                  'source_revision': 4, 'purchase_date': '2026-11-15',
                  'catalog_fingerprint': 'b' * 64, 'state_fingerprint': 'c' * 64,
                  'expires_at': '2026-11-15T12:15:00Z', 'candidates': [],
                  'scenarios': [{'scenario': name, 'needs': [compared_need], 'known_amount': '0',
                                 'complete': False, 'store_totals': [], 'store_count': 0}
                                for name in ('maxi', 'metro', 'superc', 'cheapest')]}
    template = {'id': '00000000-0000-4000-8000-000000000020', 'name': 'Besoins réutilisables',
                'icon': 'basket', 'revision': 1, 'items': [{
                    'id': rice_id, 'ingredient_id': rice['ingredient_id'], 'name': 'Riz', 'category': 'Épicerie',
                    'required': [{'amount': '2000', 'unit': 'g'}], 'preferred_product_id': None}],
                'created_at': resource['created_at'], 'updated_at': resource['updated_at']}
    exclusion = {'ingredient_id': rice['ingredient_id'], 'name': 'Riz', 'excluded': True,
                 'updated_at': resource['updated_at']}
    from .draft_pricing import build
    draft_request = ShoppingDraftPricingWrite(purchase_date='2026-11-15',
        items=[{'name': 'Riz', 'ingredient_id': rice['ingredient_id'], 'required': [{'amount': '750', 'unit': 'g'}]}])
    draft_quote = build(draft_request, [])
    values = {
        'shopping-list-recalculate-prices': {'expected_revision': 4},
        'shopping-draft-pricing-write': draft_request.model_dump(mode='json'),
        'shopping-draft-pricing-detail': {'item': draft_quote.model_dump(mode='json'), 'meta': meta},
        'shopping-list-pin-write': {'list_id': list_id},
        'shopping-list-pin-detail': {'item': {'list_id': list_id}, 'meta': meta},
        'shopping-list-duplicate-write': {'source_revision': 4, 'name': 'Copie indépendante', 'purchase_date': '2026-11-20'},
        'shopping-template-create': {'source_list_id': list_id, 'source_revision': 4, 'name': template['name'], 'icon': 'basket'},
        'shopping-template-update': {'expected_revision': 1, 'name': 'Nouveau nom'},
        'shopping-template-instantiate': {'expected_template_revision': 1, 'name': 'Prochaines courses', 'purchase_date': '2026-11-20'},
        'shopping-template-detail': {'item': template, 'meta': meta},
        'shopping-templates-page': {'items': [template], 'total': 1, 'limit': 20, 'offset': 0, 'meta': meta},
        'shopping-exclusion-write': {'excluded': True},
        'shopping-exclusion-detail': {'item': exclusion, 'meta': meta},
        'shopping-exclusions-page': {'items': [exclusion], 'total': 1, 'limit': 20, 'offset': 0, 'meta': meta},
        'shopping-list-product-purchase-write': {'expected_revision': 4, 'comparison_id': comparison['id'], 'item_id': rice_id, 'product_id': 'maxi:demo:riz', 'purchased_units': 1},
        'shopping-list-complete-write': {'expected_revision': 4, 'accept_remaining': True},
        'shopping-list-comparison-detail': {'item': comparison, 'meta': meta},
        'shopping-list-apply-comparison': {'expected_revision': 4, 'comparison_id': comparison['id'],
                                         'scenario': 'cheapest', 'accept_partial': True},
        'shopping-list-choice-write': {'expected_revision': 4, 'product_id': None},
        'shopping-list-create': {'name': 'Mes courses', 'activate': True, 'items': [{'name': 'Riz', 'ingredient_id': 'ing_riz_basmati_blanc', 'quantity': {'amount': '500', 'unit': 'g'}}]},
        'shopping-list-command-headers': {'idempotency_key': '00000000-0000-4000-8000-000000000009'},
        'shopping-list-command': {'expected_revision': 4},
        'shopping-list-update': {'expected_revision': 4, 'name': 'Courses du dimanche'},
        'shopping-list-item-add': {'expected_revision': 4, 'ingredient_id': 'ing_riz_basmati_blanc',
                                   'name': 'Riz', 'quantity': {'amount': '500', 'unit': 'g'}},
        'shopping-list-item-update': {'expected_revision': 4, 'quantity': None},
        'shopping-list-manual-purchase-write': {'expected_revision': 4, 'purchased': True,
                                               'coverage': {'confirms_unquantified': True}},
        'shopping-list-possession-write': {'expected_revision': 4,
                                           'coverage': {'quantities': [{'amount': '200', 'unit': 'g'}]}},
        'shopping-list-calendar-preview-write': preview_request,
        'shopping-list-from-calendar': {**preview_request, 'name': 'Épicerie 16–22 nov. 2026',
                                        'preview_fingerprint': 'a' * 64},
        'shopping-list-calendar-preview-detail': {'item': {
            'period': {k: preview_request[k] for k in ('start_date', 'end_date')},
            'purchase_date': '2026-11-15', 'preview_fingerprint': 'a' * 64,
            'included_meal_count': 1, 'skipped_note_count': 0, 'skipped_leftover_count': 1,
            'excluded_meals': [], 'excluded_ingredient_ids': [], 'items': [calendar_rice],
        }, 'meta': meta},
        'shopping-list-detail': {'item': resource, 'meta': meta},
        'shopping-lists-page': {'items': [resource], 'total': 1, 'limit': 20, 'offset': 0, 'meta': meta},
        'shopping-list-conflict': {'error': {'code': 'LIST_REVISION_CONFLICT',
            'message': 'La liste a changé. Relis les modifications.', 'list_id': list_id,
            'expected_revision': 3, 'current_revision': 4}},
    }
    responses = {'shopping-draft-pricing-detail', 'shopping-list-pin-detail', 'shopping-list-comparison-detail', 'shopping-list-calendar-preview-detail', 'shopping-list-detail',
                 'shopping-lists-page', 'shopping-list-conflict'}
    responses.update({'shopping-template-detail', 'shopping-templates-page', 'shopping-exclusion-detail',
                      'shopping-exclusions-page'})
    # Un PATCH doit conserver la différence entre omission et null explicite.
    return {name: MODELS[name].model_validate(value).model_dump(
        mode='json', exclude_unset=name not in responses) for name, value in values.items()}
