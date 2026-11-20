export type ShoppingListKind = 'articles' | 'products';
// Contrats des routes du lot A : listes privées et import calendrier.
// Référence : backend/docs/SHOPPING_LISTS_CONTRACTS.md et schémas exportés v1.
export type ShoppingInputUnit = 'g' | 'kg' | 'ml' | 'L' | 'unit' | 'cup' | 'tbsp' | 'tsp';
export type ShoppingBaseUnit = 'g' | 'ml' | 'unit';
export type ShoppingListStatus = 'draft' | 'active' | 'completed' | 'archived';
export interface ShoppingQuantity { amount: string; unit: ShoppingInputUnit; }
export interface ShoppingBaseQuantity { amount: string; unit: ShoppingBaseUnit; }
export interface ShoppingPeriod { start_date: string; end_date: string; }
export interface ShoppingCommandHeaders { idempotency_key: string; }
export interface ShoppingCommand { expected_revision: number; }
export interface ShoppingInitialItem { ingredient_id?: string | null; name: string; quantity?: ShoppingQuantity | null; }
export interface ShoppingListCreate { kind?: ShoppingListKind | null; name: string; purchase_date?: string | null; items?: ShoppingInitialItem[]; activate?: boolean; pricing?: ShoppingCreationPricing | null; }
export interface ShoppingListUpdate extends ShoppingCommand { name?: string; purchase_date?: string; }
export interface ShoppingItemAdd extends ShoppingCommand {
  ingredient_id?: string | null; name: string; quantity?: ShoppingQuantity | null;
  merge?: 'add' | 'separate'; product_id?: string | null;
}
export interface ShoppingItemUpdate extends ShoppingCommand {
  name?: string; quantity?: ShoppingQuantity | null; removed?: boolean;
  refresh_prices?: boolean; product_units?: number;
}
export interface ShoppingCoverage {
  quantities?: ShoppingBaseQuantity[]; confirms_unquantified?: boolean;
}
export interface ShoppingPossessionWrite extends ShoppingCommand { coverage: ShoppingCoverage; }
export interface ShoppingManualPurchaseWrite extends ShoppingCommand {
  purchased: boolean; coverage: ShoppingCoverage;
}
export interface ShoppingCalendarPreviewWrite extends ShoppingPeriod { purchase_date?: string | null; }
export interface ShoppingFromCalendar extends ShoppingCalendarPreviewWrite { kind?: ShoppingListKind | null;
  name: string; preview_fingerprint: string; accept_partial?: boolean; accept_empty?: boolean;
  items?: ShoppingInitialItem[]; excluded_item_ids?: string[]; activate?: boolean;
  adjusted_items?: { item_id: string; required: ShoppingBaseQuantity[] }[]; pricing?: ShoppingCreationPricing | null;
}
export interface ShoppingContributionRead {
  id: string; source: 'manual' | 'calendar'; original_quantity: ShoppingQuantity | null;
  normalized_quantity: ShoppingBaseQuantity | null; meal_entry_id: string | null;
  recipe_id: string | null; recipe_name: string | null; recipe_version: number | null; recipe_servings: number | null;
  meal_date: string | null; servings: number | null;
}
export interface ShoppingItemRead {
  id: string; ingredient_id: string | null; name: string; category: string; need_revision: number;
  required: ShoppingBaseQuantity[]; owned: ShoppingBaseQuantity[];
  owned_unquantified_need_revision: number | null; contributions: ShoppingContributionRead[];
  removed: boolean; coverage_status: 'remaining' | 'partial' | 'purchased' | 'owned';
  pricing_status: 'unpriced' | 'known' | 'needs_review';
}
export interface ShoppingManualPurchaseRead {
  id: string; item_id: string; kind: 'manual'; purchased: boolean;
  coverage: ShoppingBaseQuantity[]; confirmed_need_revision: number | null;
  product_id: null; estimated_amount: null;
}
export interface ShoppingTotals {
  currency: 'CAD'; item_count: number; remaining_item_count: number;
  purchased_item_count: number; owned_item_count: number; partial_item_count: number;
  unpriced_item_count: number; uncovered_item_count: number;
  budget_known_amount: string; remaining_known_amount: string; estimate_complete: boolean;
}
export interface ShoppingWarning { code: string; message: string; item_id: string | null; }
export interface ShoppingListRead { kind?: ShoppingListKind | null;
  id: string; name: string; source: 'manual' | 'calendar'; status: ShoppingListStatus;
  revision: number; period: ShoppingPeriod | null; purchase_date: string;
  items: ShoppingItemRead[]; purchases: ShoppingManualPurchaseRead[]; product_purchases?: ShoppingProductPurchaseRead[]; totals: ShoppingTotals;
  warnings: ShoppingWarning[]; created_at: string; updated_at: string;
  origin?: { kind: 'list' | 'template'; id: string; revision: number } | null;
  choices: ShoppingProductChoice[]; assignment: ShoppingAppliedComparison | null;
}
export interface ShoppingExcludedMeal { meal_entry_id: string; reason: 'recipe_unavailable'; }
export interface ShoppingCalendarPreviewRead {
  period: ShoppingPeriod; purchase_date: string; preview_fingerprint: string;
  included_meal_count: number; skipped_note_count: number; skipped_leftover_count: number;
  excluded_meals: ShoppingExcludedMeal[]; excluded_ingredient_ids: string[];
  items: ShoppingItemRead[]; warnings: ShoppingWarning[];
}
export interface ShoppingConflictResponse {
  error: {
    code: 'LIST_REVISION_CONFLICT' | 'IDEMPOTENCY_KEY_REUSED' | 'CALENDAR_PREVIEW_STALE' | 'ACCOUNT_DELETION_PENDING' | 'LIST_STATE_CONFLICT' | 'COMPARISON_STALE' | 'COMPARISON_PARTIAL' | 'CHOICE_CONFLICT' | 'COURSES_REMAINING' | 'TEMPLATE_REVISION_CONFLICT';
    message: string; details: { field: string; message: string }[];
    list_id: string | null; expected_revision: number | null; current_revision: number | null;
  };
}
export interface ShoppingResponseMeta {
  contract_version: '1.0'; data_source: 'local_json' | 'postgresql';
  dataset_kind: 'source_snapshot' | 'demo' | 'user_content' | 'mixed';
  review_required: boolean; warnings: string[];
}
export interface ShoppingDetail<T> { item: T; meta: ShoppingResponseMeta; }
export interface ShoppingPage<T> {
  items: T[]; total: number; limit: number; offset: number; meta: ShoppingResponseMeta;
}

// Utilisé par le contrôle des exemples exportés ; aucun fetch implicite.
export interface ShoppingPin { list_id: string | null; }
export interface ShoppingContractExamples {
  'shopping-list-pin-write': ShoppingPin;
  'shopping-list-pin-detail': ShoppingDetail<ShoppingPin>;
  'shopping-list-duplicate-write': ShoppingDuplicateWrite;
  'shopping-template-create': ShoppingTemplateCreate;
  'shopping-template-update': ShoppingTemplateUpdate;
  'shopping-template-instantiate': ShoppingTemplateInstantiate;
  'shopping-template-detail': ShoppingDetail<ShoppingTemplateRead>;
  'shopping-templates-page': ShoppingPage<ShoppingTemplateRead>;
  'shopping-exclusion-write': ShoppingExclusionWrite;
  'shopping-exclusion-detail': ShoppingDetail<ShoppingExclusionRead>;
  'shopping-exclusions-page': ShoppingPage<ShoppingExclusionRead>;
  'shopping-list-product-purchase-write': ShoppingProductPurchaseWrite;
  'shopping-list-complete-write': ShoppingCompleteWrite;
  'shopping-list-comparison-detail': ShoppingDetail<ShoppingComparisonRead>;
  'shopping-list-apply-comparison': ShoppingApplyComparison;
  'shopping-list-choice-write': ShoppingChoiceWrite;
  'shopping-list-create': ShoppingListCreate;
  'shopping-list-recalculate-prices': ShoppingRecalculatePricesWrite;
  'shopping-draft-pricing-write': ShoppingDraftPricingWrite;
  'shopping-draft-pricing-detail': ShoppingDetail<ShoppingDraftPricingRead>;
  'shopping-list-command-headers': ShoppingCommandHeaders;
  'shopping-list-command': ShoppingCommand;
  'shopping-list-update': ShoppingListUpdate;
  'shopping-list-item-add': ShoppingItemAdd;
  'shopping-list-item-update': ShoppingItemUpdate;
  'shopping-list-manual-purchase-write': ShoppingManualPurchaseWrite;
  'shopping-list-possession-write': ShoppingPossessionWrite;
  'shopping-list-calendar-preview-write': ShoppingCalendarPreviewWrite;
  'shopping-list-from-calendar': ShoppingFromCalendar;
  'shopping-list-calendar-preview-detail': ShoppingDetail<ShoppingCalendarPreviewRead>;
  'shopping-list-detail': ShoppingDetail<ShoppingListRead>;
  'shopping-lists-page': ShoppingPage<ShoppingListRead>;
  'shopping-list-conflict': ShoppingConflictResponse;
}

export type ShoppingScenarioName = 'maxi' | 'metro' | 'superc' | 'cheapest';
export interface ShoppingProductChoice { item_id: string; product_id: string; }
export interface ShoppingCalculatedLine {
  pricing_method?: 'verified' | 'direct'; direct_increment?: ShoppingBaseQuantity | null;
  sale: { product_id: string; price_basis: string; format?: { raw: string | null }; content_per_package?: ShoppingBaseQuantity | null; sale_increment?: ShoppingBaseQuantity | null; minimum_sale?: ShoppingBaseQuantity | null; raw_source: {
    name: string; retailer: 'maxi' | 'metro' | 'superc'; store_id: string | null;
    [field: string]: unknown;
  }; [field: string]: unknown };
  sale_units: number; quantity: string; amount: string; estimated_weight: boolean;
}
export interface ShoppingComparedNeed {
  item_ids: string[]; name: string; ingredient_id: string | null;
  unit: ShoppingBaseUnit | null; remaining: string | null;
  status: 'complete' | 'owned' | 'purchased' | 'unpriced' | 'unquantified' | 'incompatible_units' | 'search_limit' | 'manual_unavailable';
  manual: boolean; purchased_price_known?: boolean; lines: ShoppingCalculatedLine[]; amount: string | null; warnings: string[];
}
export interface ShoppingScenario {
  scenario: ShoppingScenarioName; needs: ShoppingComparedNeed[]; known_amount: string; purchased_known_amount?: string; complete: boolean;
  store_totals: { retailer: 'maxi' | 'metro' | 'superc'; store_id: string | null; amount: string }[];
  store_count: number;
}
export interface ShoppingCandidate {
  ingredient_id: string; product_id: string; name: string;
  retailer: 'maxi' | 'metro' | 'superc'; store_id: string | null; eligible: boolean; issues: string[];
}
export interface ShoppingComparisonRead {
  id: string; list_id: string; source_revision: number; purchase_date: string;
  catalog_fingerprint: string; state_fingerprint: string; expires_at: string;
  scenarios: ShoppingScenario[]; candidates: ShoppingCandidate[];
}
export interface ShoppingApplyComparison extends ShoppingCommand {
  comparison_id: string; scenario: ShoppingScenarioName; accept_partial?: boolean;
}
export interface ShoppingChoiceWrite extends ShoppingCommand { product_id: string | null; }
export interface ShoppingAppliedComparison {
  comparison_id: string; source_revision: number; purchase_date: string;
  state_fingerprint: string; scenario: ShoppingScenario; planning_fingerprint?: string | null; stale: boolean;
  selected_products?: Record<string, { name: string; retailer: 'maxi' | 'metro' | 'superc'; store_id?: string | null; image_url?: string | null; quantity: string | null; unit: string | null; price: string | null; promo_price?: string | null }>;
}

export interface ShoppingProductPurchaseWrite extends ShoppingCommand {
  comparison_id: string; item_id: string; product_id: string; purchased_units: number;
}
export interface ShoppingCompleteWrite extends ShoppingCommand { accept_remaining?: boolean; }
export interface ShoppingProductPurchaseRead {
  id: string; comparison_id: string; item_ids: string[]; line: ShoppingCalculatedLine;
  purchased_units: number; reserved_units: number; purchased_quantity: string; estimated_amount: string;
  allocations: { item_id: string; quantity: ShoppingBaseQuantity }[]; confirmed_need_revisions?: Record<string, number>;
}

export type ShoppingTemplateIcon = 'basket' | 'cart' | 'leaf' | 'restaurant' | 'home';
export interface ShoppingTemplateItem {
  id: string; ingredient_id: string | null; name: string; category: string;
  required: ShoppingBaseQuantity[]; preferred_product_id: string | null;
}
export interface ShoppingTemplateRead { kind?: ShoppingListKind | null;
  id: string; name: string; icon: ShoppingTemplateIcon; revision: number;
  items: ShoppingTemplateItem[]; deleted: boolean; created_at: string; updated_at: string;
}
export interface ShoppingTemplateCreate {
  source_list_id: string; source_revision: number; name: string;
  icon?: ShoppingTemplateIcon; include_choices?: boolean;
}
export interface ShoppingTemplateUpdate {
  expected_revision: number; name?: string; icon?: ShoppingTemplateIcon; items?: ShoppingTemplateItem[];
}
export interface ShoppingTemplateInstantiate {
  expected_template_revision: number; name: string; purchase_date: string; include_choices?: boolean; activate?: boolean;
}
export interface ShoppingDuplicateWrite {
  source_revision: number; name: string; purchase_date: string; include_choices?: boolean;
}
export interface ShoppingExclusionWrite { excluded: boolean; }
export interface ShoppingExclusionRead { ingredient_id: string; name: string; excluded: boolean; updated_at: string; }

export interface ShoppingDraftChoice { item_index: number; product_id: string; }
export interface ShoppingCreationPricing { fingerprint: string; scenario: ShoppingScenarioName; choices: ShoppingDraftChoice[]; accept_partial?: boolean; }
export interface ShoppingDraftItem { name: string; ingredient_id?: string | null; required: ShoppingQuantity[]; }
export interface ShoppingDraftPricingWrite { items: ShoppingDraftItem[]; purchase_date: string; choices: ShoppingDraftChoice[]; }
export interface ShoppingDraftProduct {
  item_id: string; item_index: number; product_id: string; name: string; retailer: 'maxi' | 'metro' | 'superc';
  store_id: string | null; format: string | null; unit_price: string | null; units: number | null; amount: string | null; issue: string | null;
}
export interface ShoppingDraftPricingRead { fingerprint: string; scenarios: ShoppingScenario[]; candidates: ShoppingDraftProduct[]; }

export interface ShoppingRecalculatePricesWrite extends ShoppingCommand {
  refresh_date?: boolean;
  expected_fingerprint?: string | null; accept_partial?: boolean;
  scenario?: ShoppingScenarioName | null; choices?: { item_id: string; product_id: string | null }[];
}
