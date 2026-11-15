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
export interface ShoppingListCreate { name: string; purchase_date?: string | null; }
export interface ShoppingListUpdate extends ShoppingCommand { name?: string; purchase_date?: string; }
export interface ShoppingItemAdd extends ShoppingCommand {
  ingredient_id?: string | null; name: string; quantity?: ShoppingQuantity | null;
  merge?: 'add' | 'separate';
}
export interface ShoppingItemUpdate extends ShoppingCommand {
  name?: string; quantity?: ShoppingQuantity | null; removed?: boolean;
}
export interface ShoppingCoverage {
  quantities?: ShoppingBaseQuantity[]; confirms_unquantified?: boolean;
}
export interface ShoppingPossessionWrite extends ShoppingCommand { coverage: ShoppingCoverage; }
export interface ShoppingManualPurchaseWrite extends ShoppingCommand {
  purchased: boolean; coverage: ShoppingCoverage;
}
export interface ShoppingCalendarPreviewWrite extends ShoppingPeriod { purchase_date?: string | null; }
export interface ShoppingFromCalendar extends ShoppingCalendarPreviewWrite {
  name: string; preview_fingerprint: string; accept_partial?: boolean;
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
export interface ShoppingListRead {
  id: string; name: string; source: 'manual' | 'calendar'; status: ShoppingListStatus;
  revision: number; period: ShoppingPeriod | null; purchase_date: string;
  items: ShoppingItemRead[]; purchases: ShoppingManualPurchaseRead[]; totals: ShoppingTotals;
  warnings: ShoppingWarning[]; created_at: string; updated_at: string;
}
export interface ShoppingRevisionRead {
  list_id: string; revision: number; command_id: string; recorded_at: string;
  snapshot: ShoppingListRead;
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
    code: 'LIST_REVISION_CONFLICT' | 'IDEMPOTENCY_KEY_REUSED' | 'CALENDAR_PREVIEW_STALE' | 'ACCOUNT_DELETION_PENDING' | 'LIST_STATE_CONFLICT';
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
export interface ShoppingContractExamples {
  'shopping-list-create': ShoppingListCreate;
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
  'shopping-list-revision-detail': ShoppingDetail<ShoppingRevisionRead>;
  'shopping-list-conflict': ShoppingConflictResponse;
}
