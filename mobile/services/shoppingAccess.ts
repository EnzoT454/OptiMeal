import { api } from './api';
import { fetchList } from './shoppingLists';
import type { ShoppingDetail, ShoppingPin } from '../types/shoppingLists';

export const pinPath = '/api/v1/shopping-list-pin';
export async function fetchPin(user: string) {
  return (await api<ShoppingDetail<ShoppingPin>>(pinPath, {}, true, 15000, user)).item;
}
export async function loadPinnedList(user: string) {
  const pin = await fetchPin(user);
  if (!pin.list_id) return null;
  const list = await fetchList(pin.list_id, user);
  return ['draft', 'active'].includes(list.status) ? list : null;
}
