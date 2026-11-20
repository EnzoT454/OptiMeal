import { readAccountJSON, updateAccountJSON } from './accountStorage';

export interface ShoppingRecent { name: string; ingredient_id: string | null; product_id?: string; }
const key = 'shopping.recents.v1';
export async function readShoppingRecents(user: string): Promise<ShoppingRecent[]> {
  const values = await readAccountJSON<ShoppingRecent[]>(user, key, []);
  return Array.isArray(values) ? values.filter(value => value && typeof value.name === 'string'
    && (value.ingredient_id === null || typeof value.ingredient_id === 'string')
    && (value.product_id === undefined || typeof value.product_id === 'string' && value.product_id.length > 0 && value.product_id.length <= 512)).slice(0, 8) : [];
}
export function rememberShoppingArticle(user: string, item: ShoppingRecent) {
  return updateAccountJSON<ShoppingRecent[]>(user, key, [], current => [item,
    ...(Array.isArray(current) ? current : []).filter(value => (item.product_id || value.product_id) ? value.product_id !== item.product_id : value.name.toLocaleLowerCase('fr') !== item.name.toLocaleLowerCase('fr'))].slice(0, 8));
}
