import type { ShoppingBaseQuantity, ShoppingItemRead, ShoppingListRead, ShoppingCoverage } from '../../types/shoppingLists';

// Décimaux exacts pour les saisies et la présentation ; le serveur reste
// responsable des couvertures, des compteurs et de tous les montants.
const decimal = /^(0|[1-9][0-9]*)(\.[0-9]+)?$/;
export function positiveAmount(value: string): string | null {
  const text = value.trim().replace(',', '.');
  return decimal.test(text) && /[1-9]/.test(text) ? text : null;
}
function integer(value: string, scale: number): bigint {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole + fraction.padEnd(scale, '0'));
}
export function subtractAmount(value: string, others: string[]): string {
  const scale = Math.max(...[value, ...others].map(n => n.split('.')[1]?.length ?? 0));
  const result = others.reduce((n, other) => n - integer(other, scale), integer(value, scale));
  if (result <= 0n) return '0';
  const digits = result.toString().padStart(scale + 1, '0');
  return scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}`.replace(/\.?0+$/, '') : digits;
}
export function purchasedQuantities(list: ShoppingListRead, itemId: string): ShoppingBaseQuantity[] {
  return [
    ...list.purchases.filter(p => p.item_id === itemId && p.purchased).flatMap(p => p.coverage),
    ...(list.product_purchases ?? []).flatMap(p => p.allocations.filter(a => a.item_id === itemId).map(a => a.quantity)),
  ];
}
export function remainingQuantities(list: ShoppingListRead, item: ShoppingItemRead): ShoppingBaseQuantity[] {
  return item.required.map(q => ({ unit: q.unit, amount: subtractAmount(q.amount,
    [...item.owned, ...purchasedQuantities(list, item.id)].filter(a => a.unit === q.unit).map(a => a.amount))
  })).filter(q => q.amount !== '0');
}
export function manualCheckCoverage(item: ShoppingItemRead): ShoppingCoverage {
  if (!item.required.length) return { confirms_unquantified: true };
  return { quantities: item.required.map(q => ({ unit: q.unit,
    amount: subtractAmount(q.amount, item.owned.filter(o => o.unit === q.unit).map(o => o.amount)),
  })).filter(q => q.amount !== '0') };
}
export const storeLabel = (retailer: string) => retailer === 'superc' ? 'Super C' : retailer === 'maxi' ? 'Maxi' : retailer === 'metro' ? 'Metro' : 'Magasin à choisir';
export const coverageLabels = { remaining: 'À acheter', partial: 'Partiellement couvert', purchased: 'Acheté', owned: 'Déjà disponible' };
