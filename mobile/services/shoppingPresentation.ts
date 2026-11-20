import type { ShoppingListRead } from '../types/shoppingLists';
import { localDate } from './shoppingLists';

export function shoppingPriceText(list: ShoppingListRead): string | null {
  const selected = !list.assignment?.stale && list.assignment?.scenario.needs.some(need => need.lines.length > 0);
  const bought = list.product_purchases?.some(purchase => purchase.purchased_units > 0);
  if (!selected && !bought) return null;
  const [whole, fraction = ''] = list.totals.budget_known_amount.split('.');
  const amount = `${whole},${fraction.padEnd(2, '0')} $`;
  return list.totals.estimate_complete ? `Total estimé : ${amount}`
    : `Sous-total connu : ${amount} · ${list.totals.unpriced_item_count} article(s) sans prix`;
}

export function shoppingDateText(value: string): string {
  const date = new Date(value + 'T12:00:00');
  const label = date.toLocaleDateString('fr-CA', { weekday: 'short', day: 'numeric', month: 'short' });
  return `${value < localDate() ? 'En retard · ' : ''}${label}`;
}

// Les anciennes listes restent lisibles sans réécriture des données.
export function shoppingListKind(list: ShoppingListRead): 'articles' | 'products' | 'mixed' {
  if (list.kind) return list.kind;
  const active = list.items?.filter(item => !item.removed) ?? [];
  const selected = new Set(list.choices?.map(choice => choice.item_id) ?? []);
  for (const need of list.assignment?.scenario.needs ?? []) if (need.lines.length) for (const id of need.item_ids ?? []) selected.add(id);
  for (const purchase of list.product_purchases ?? []) if (purchase.purchased_units) for (const id of purchase.item_ids ?? []) selected.add(id);
  if (!selected.size) return 'articles';
  return active.some(item => !selected.has(item.id)) ? 'mixed' : 'products';
}

export function shoppingBudget(list: ShoppingListRead) {
  if (!shoppingPriceText(list)) return null;
  const [whole, fraction = ''] = list.totals.budget_known_amount.split('.');
  return {
    label: list.totals.estimate_complete ? 'Total estimé' : 'Sous-total connu',
    amount: `${whole},${fraction.padEnd(2, '0')}`,
    missing: list.totals.unpriced_item_count,
  };
}

export function shoppingStoreCount(list: ShoppingListRead): number {
  const stores = new Set<string>();
  function add(source?: { retailer?: string; store_id?: string | null }) {
    if (source?.retailer) stores.add(`${source.retailer}:${source.store_id ?? ''}`);
  }
  const active = new Set(list.items?.filter(item => !item.removed).map(item => item.id) ?? []);
  for (const choice of list.choices ?? []) if (active.has(choice.item_id)) add(list.assignment?.selected_products?.[choice.product_id]);
  for (const need of (!list.assignment?.stale ? list.assignment?.scenario.needs : []) ?? []) if (need.item_ids?.some(id => active.has(id))) {
    for (const line of need.lines) add(line.sale.raw_source);
  }
  for (const purchase of list.product_purchases ?? []) if (purchase.purchased_units > 0) add(purchase.line?.sale.raw_source);
  return stores.size;
}
