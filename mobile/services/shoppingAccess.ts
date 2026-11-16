import { api, ApiError } from './api';
import { readAccountJSON, writeAccountJSON } from './accountStorage';
import { cacheList, readOfflineList } from './shoppingOffline';
import { fetchList } from './shoppingLists';
import type { ShoppingDetail, ShoppingPin } from '../types/shoppingLists';

export const pinPath = '/api/v1/shopping-list-pin';
export async function fetchPin(user: string) {
  return (await api<ShoppingDetail<ShoppingPin>>(pinPath, {}, true, 15000, user)).item;
}
export async function loadPinnedList(user: string) {
  let pin: ShoppingPin | null = null;
  try {
    pin = await fetchPin(user);
    await writeAccountJSON(user, 'shopping-pin.v1', pin);
    if (!pin.list_id) return { cached: null, offline: false };
    const cached = await cacheList(user, await fetchList(pin.list_id, user));
    return { cached: ['draft', 'active'].includes(cached.snapshot.status) ? cached : null, offline: false };
  } catch (failure) {
    if (failure instanceof ApiError && ![401, 503].includes(failure.status) && failure.status < 500) throw failure;
    pin ??= await readAccountJSON<ShoppingPin | null>(user, 'shopping-pin.v1', null);
    const cached = pin?.list_id ? await readOfflineList(user, pin.list_id) : null;
    if (!cached || !['draft', 'active'].includes(cached.snapshot.status)) throw failure;
    return { cached, offline: true };
  }
}
