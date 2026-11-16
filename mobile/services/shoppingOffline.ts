import { ApiError } from './api';
import { readAccountJSON, updateAccountJSON } from './accountStorage';
import { fetchList, listCommand, listsPath, sendListCommand, type ListCommand } from './shoppingLists';
import type { ShoppingListRead } from '../types/shoppingLists';

export interface QueuedPurchase {
  command: ListCommand; guard: string; sent: boolean; conflict?: string;
}
export interface OfflineList {
  version: 1; snapshot: ShoppingListRead; syncedAt: string; queue: QueuedPurchase[];
}
const key = (id: string) => `shopping-offline.${id}`;
const latestKey = 'shopping-offline.latest';
const locks = new Map<string, Promise<unknown>>();
function exclusive<T>(user: string, id: string, work: () => Promise<T>): Promise<T> {
  const scope = `${user}:${id}`;
  const result = (locks.get(scope) ?? Promise.resolve()).catch(() => {}).then(work);
  locks.set(scope, result);
  void result.finally(() => { if (locks.get(scope) === result) locks.delete(scope); }).catch(() => {});
  return result;
}
export function isPurchase(command: ListCommand, id: string): boolean {
  const root = `${listsPath}/${id}`;
  return command.method === 'PUT' && (command.path === `${root}/product-purchases`
    || (command.path.startsWith(`${root}/items/`) && /^\/[^/]+\/manual-purchase$/.test(command.path.slice(`${root}/items`.length))));
}
export function purchaseTarget(command: ListCommand): string {
  const body = command.body as Record<string, unknown>;
  return command.path.endsWith('/product-purchases')
    ? JSON.stringify([body.comparison_id, body.item_id, body.product_id]) : command.path;
}
// Ignore revision/name metadata and unrelated purchases. Any changed need,
// possession, assignment, choice or target purchase requires a decision.
export function purchaseGuard(list: ShoppingListRead, command: ListCommand): string {
  const body = command.body as Record<string, unknown>;
  const target = command.path.endsWith('/product-purchases')
    ? (list.product_purchases ?? []).filter(p => p.comparison_id === body.comparison_id
      && p.item_ids[0] === body.item_id && p.line.sale.product_id === body.product_id)
    : list.purchases.filter(p => command.path === `${listsPath}/${list.id}/items/${p.item_id}/manual-purchase`);
  return JSON.stringify({ status: list.status, date: list.purchase_date, items: list.items.map(({ coverage_status, pricing_status, ...item }) => item),
    assignment: list.assignment, choices: list.choices, target });
}
export const readOfflineList = (user: string, id: string) => readAccountJSON<OfflineList | null>(user, key(id), null);
export async function readLatestOfflineList(user: string) {
  const id = await readAccountJSON<string | null>(user, latestKey, null);
  return id ? readOfflineList(user, id) : null;
}
async function store(user: string, id: string, state: OfflineList) {
  await updateAccountJSON(user, key(id), state, () => state);
  await updateAccountJSON(user, latestKey, id, () => id);
  return state;
}
export async function cacheList(user: string, snapshot: ShoppingListRead) {
  return exclusive(user, snapshot.id, async () => {
    const previous = await readOfflineList(user, snapshot.id);
    if (previous && previous.snapshot.revision > snapshot.revision) return previous;
    return store(user, snapshot.id, { version: 1, snapshot, syncedAt: new Date().toISOString(), queue: previous?.queue ?? [] });
  });
}
export async function enqueuePurchase(user: string, id: string, command: ListCommand) {
  return exclusive(user, id, async () => {
    const state = await readOfflineList(user, id);
    if (!state || !isPurchase(command, id)) throw new Error('Charge la liste complète avant de cocher hors connexion.');
    if (!['draft', 'active'].includes(state.snapshot.status)) throw new Error('Cette liste est en consultation seule.');
    const target = purchaseTarget(command);
    let last = -1;
    state.queue.forEach((entry, index) => { if (purchaseTarget(entry.command) === target) last = index; });
    const entry: QueuedPurchase = { command, guard: purchaseGuard(state.snapshot, command), sent: false };
    // Only an intent that has never left this device may be replaced.
    if (last >= 0 && !state.queue[last].sent && !state.queue[last].conflict) state.queue[last] = entry;
    else state.queue.push(entry);
    return store(user, id, state);
  });
}
function rebase(entry: QueuedPurchase, list: ShoppingListRead) {
  return { command: listCommand(entry.command.path, { ...entry.command.body, expected_revision: list.revision }, 'PUT'),
    guard: purchaseGuard(list, entry.command), sent: false };
}
export async function resolvePurchase(user: string, id: string, keep: boolean) {
  return exclusive(user, id, async () => {
    const state = await readOfflineList(user, id);
    if (!state?.queue[0]?.conflict) throw new Error('Actualise la liste avant de résoudre ce conflit.');
    // Only a verified local incompatibility or explicit server refusal is
    // resolvable; an uncertain command is never discarded/rekeyed here.
    if (keep) state.queue[0] = rebase(state.queue[0], state.snapshot);
    else state.queue.shift();
    return store(user, id, state);
  });
}
export async function synchronizePurchases(user: string, id: string, isCurrent: () => boolean = () => true) {
  return exclusive(user, id, async () => {
    let state = await readOfflineList(user, id);
    if (!state || !isCurrent()) return state;
    let rebases = 0;
    // A read never acknowledges an uncertain write. Replay its exact key first.
    while (state.queue.length && isCurrent()) {
      const entry: QueuedPurchase = state.queue[0];
      if (entry.conflict) break;
      if (!entry.sent) {
        if (purchaseGuard(state.snapshot, entry.command) !== entry.guard) {
          entry.conflict = 'La liste a changé depuis cette coche locale.';
          await store(user, id, state);
          break;
        }
        entry.command = { ...entry.command, body: { ...entry.command.body, expected_revision: state.snapshot.revision } };
        entry.sent = true;
        await store(user, id, state); // durable before network
      }
      try {
        const result: ShoppingListRead = await sendListCommand(entry.command, user);
        if (!isCurrent()) return state; // retain exact replay after account change
        const next = state.queue.slice(1);
        for (const queued of next) if (!queued.sent && queued.guard === entry.guard
          && purchaseTarget(queued.command) === purchaseTarget(entry.command)) queued.guard = purchaseGuard(result, queued.command);
        // Idempotent replay can return an older revision. Never replace a newer cache.
        state = { ...state, snapshot: result.revision >= state.snapshot.revision ? result : state.snapshot,
          syncedAt: new Date().toISOString(), queue: next };
        await store(user, id, state);
      } catch (failure) {
        if (!isCurrent()) throw failure;
        if (failure instanceof ApiError && [404, 409, 422].includes(failure.status)) {
          const remote = await fetchList(id, user);
          if (!isCurrent()) return state;
          if (failure.code === 'LIST_REVISION_CONFLICT' && rebases++ < 3 && purchaseGuard(remote, entry.command) === entry.guard) {
            state.snapshot = remote;
            state.syncedAt = new Date().toISOString();
            state.queue[0] = rebase(entry, remote); // rejected key is never reused with a different body
            await store(user, id, state);
            continue;
          }
          state.snapshot = remote;
          entry.conflict = failure.message;
          await store(user, id, state);
          break;
        }
        throw failure;
      }
    }
    if (!isCurrent()) return state;
    const remote = await fetchList(id, user);
    if (!isCurrent()) return state;
    if (remote.revision >= state.snapshot.revision) state.snapshot = remote;
    state.syncedAt = new Date().toISOString();
    return store(user, id, state);
  });
}
