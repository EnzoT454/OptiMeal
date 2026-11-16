import { api, ApiError } from './api';
import { readAccountJSON, writeAccountJSON } from './accountStorage';
import { fetchList, listCommand, listsPath, sendListCommand, validDate, type ListCommand } from './shoppingLists';
import { exclusionsPath } from './shoppingReuse';
import type { Ingredient, Page } from '../types/api';
import type { ShoppingListRead, ShoppingExclusionRead } from '../types/shoppingLists';

export interface RecoveryItem { token: string; name: string; ingredientId: string | null; }
export interface RecoveryExclusion { token: string; name: string; ingredientId: string; }
export interface RecoveryPreview {
  signature: string; items: RecoveryItem[]; exclusions: RecoveryExclusion[]; warnings: string[]; recoveredCount: number;
}
interface RecoveryPending { kind: 'create' | 'item' | 'exclusion'; command: ListCommand; rejection?: string; }
export interface RecoveryRun {
  name: string; purchaseDate: string; items: RecoveryItem[]; exclusions: RecoveryExclusion[];
  listId: string | null; revision: number; itemIndex: number; exclusionIndex: number; pending: RecoveryPending | null;
}
export interface RecoveryLedger {
  version: 1; receipts: Record<string, string | null>; run: RecoveryRun | null; lastListId: string | null;
}
const storageKey = 'shopping-recovery.v1';
const empty = (): RecoveryLedger => ({ version: 1, receipts: {}, run: null, lastListId: null });
export const readRecovery = (user: string) => readAccountJSON(user, storageKey, empty());
const locks = new Map<string, Promise<unknown>>();
function exclusive<T>(user: string, work: () => Promise<T>): Promise<T> {
  const result = (locks.get(user) ?? Promise.resolve()).catch(() => {}).then(work);
  locks.set(user, result);
  void result.finally(() => { if (locks.get(user) === result) locks.delete(user); }).catch(() => {});
  return result;
}
async function sources(user: string) {
  // Read only named, account-owned keys. Never enumerate/fall back to common keys.
  const [manuals, pantry] = await Promise.all([
    readAccountJSON<unknown>(user, 'shoppingList.manuels', []),
    readAccountJSON<unknown>(user, 'shoppingList.gardeManger', []),
  ]);
  if (!Array.isArray(manuals) || !Array.isArray(pantry)) throw new Error('Les anciennes données sont illisibles. Elles restent conservées sur cet appareil.');
  if (manuals.length > 500 || pantry.length > 500) throw new Error('La récupération accepte au maximum 500 anciennes entrées par catégorie. Tes données restent conservées sur cet appareil.');
  return { manuals: manuals as unknown[], pantry: pantry as unknown[], signature: JSON.stringify([manuals, pantry]) };
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export async function previewRecovery(user: string): Promise<RecoveryPreview> {
  const [source, ledger] = await Promise.all([sources(user), readRecovery(user)]);
  const catalogue = new Map<string, Ingredient>();
  // No network is necessary when there is nothing to recover.
  if (source.manuals.length || source.pantry.length) {
    let offset = 0;
    while (true) {
      const page = await api<Page<Ingredient>>(`/api/v1/ingredients?limit=100&offset=${offset}`, {}, true, 15000, user);
      for (const item of page.items) catalogue.set(item.id, item);
      offset += page.items.length;
      if (!page.items.length || offset >= page.total) break;
    }
  }
  const items: RecoveryItem[] = [], exclusions: RecoveryExclusion[] = [], warnings: string[] = [];
  let recoveredCount = 0;
  const ids = new Map<string, number>();
  for (const row of source.manuals) if (record(row) && typeof row.id === 'string') ids.set(row.id, (ids.get(row.id) ?? 0) + 1);
  for (const row of source.manuals) {
    if (!record(row) || typeof row.id !== 'string' || !row.id.trim() || row.id.length > 200 || ids.get(row.id) !== 1
      || typeof row.nom !== 'string' || !row.nom.trim() || row.nom.trim().length > 120) {
      warnings.push('Un ancien article invalide ou d’identité ambiguë ne peut pas être récupéré ; il reste conservé.'); continue;
    }
    const token = JSON.stringify(['manual', row.id]);
    if (Object.hasOwn(ledger.receipts, token)) { recoveredCount++; continue; }
    const ingredientId = typeof row.ingredient_id === 'string' && catalogue.has(row.ingredient_id) ? row.ingredient_id : null;
    if (row.ingredient_id && !ingredientId) warnings.push(`${row.nom.trim()} : ingrédient indisponible, récupéré comme article libre.`);
    items.push({ token, name: row.nom.trim(), ingredientId });
  }
  for (const id of new Set(source.pantry)) {
    if (typeof id !== 'string' || !catalogue.has(id)) {
      warnings.push('Un ancien ingrédient toujours disponible est introuvable ; sa préférence reste conservée localement.'); continue;
    }
    const token = JSON.stringify(['pantry', id]);
    if (Object.hasOwn(ledger.receipts, token)) { recoveredCount++; continue; }
    exclusions.push({ token, ingredientId: id, name: catalogue.get(id)!.name });
  }
  return { signature: source.signature, items, exclusions, warnings, recoveredCount };
}
export async function beginRecovery(user: string, preview: RecoveryPreview, selectedItems: string[], selectedExclusions: string[], name: string, purchaseDate: string) {
  return exclusive(user, async () => {
    const ledger = await readRecovery(user);
    if (ledger.run) return ledger; // resume the frozen consent, never start a duplicate
    if ((await sources(user)).signature !== preview.signature) throw new Error('Les anciennes données ont changé. Actualise l’aperçu avant de confirmer.');
    const items = preview.items.filter(item => selectedItems.includes(item.token) && !Object.hasOwn(ledger.receipts, item.token));
    const exclusions = preview.exclusions.filter(item => selectedExclusions.includes(item.token) && !Object.hasOwn(ledger.receipts, item.token));
    if (!items.length && !exclusions.length) throw new Error('Choisis au moins un article ou une préférence à récupérer.');
    if (!name.trim() || name.trim().length > 120 || !validDate(purchaseDate)) throw new Error('Indique un nom et une date de courses valides.');
    ledger.run = { name: name.trim(), purchaseDate, items, exclusions, listId: null, revision: 0,
      itemIndex: 0, exclusionIndex: 0, pending: null };
    await writeAccountJSON(user, storageKey, ledger);
    return ledger;
  });
}
export async function resumeRecovery(user: string, isCurrent: () => boolean = () => true): Promise<RecoveryLedger> {
  return exclusive(user, async () => {
    const ledger = await readRecovery(user);
    const run = ledger.run;
    if (!run) return ledger;
    let rebases = 0;
    while (isCurrent()) {
      if (!run.pending) {
        if (run.items.length && !run.listId) run.pending = { kind: 'create', command: listCommand(listsPath,
          { name: run.name, purchase_date: run.purchaseDate }) };
        else if (run.itemIndex < run.items.length) {
          const item = run.items[run.itemIndex];
          run.pending = { kind: 'item', command: listCommand(`${listsPath}/${run.listId}/items`, {
            expected_revision: run.revision, name: item.name, quantity: null, merge: 'separate',
            ...(item.ingredientId ? { ingredient_id: item.ingredientId } : {}),
          }) };
        } else if (run.exclusionIndex < run.exclusions.length) {
          const item = run.exclusions[run.exclusionIndex];
          run.pending = { kind: 'exclusion', command: listCommand(`${exclusionsPath}/${item.ingredientId}`, { excluded: true }, 'PUT') };
        } else {
          ledger.lastListId = run.listId;
          ledger.run = null;
          await writeAccountJSON(user, storageKey, ledger);
          return ledger;
        }
        await writeAccountJSON(user, storageKey, ledger); // exact request durable before send
      }
      if (!isCurrent()) return ledger;
      const pending = run.pending;
      if (pending.rejection) {
        delete pending.rejection;
        await writeAccountJSON(user, storageKey, ledger);
      }
      if (!isCurrent()) return ledger;
      let result: ShoppingListRead | null = null;
      try {
        if (pending.kind === 'exclusion') await sendListCommand<ShoppingExclusionRead>(pending.command, user);
        else result = await sendListCommand<ShoppingListRead>(pending.command, user);
      }
      catch (failure) {
        if (!isCurrent()) return ledger;
        if (failure instanceof ApiError && [404, 409, 422].includes(failure.status)) {
          pending.rejection = failure.message;
          await writeAccountJSON(user, storageKey, ledger);
          if (pending.kind === 'item' && failure.code === 'LIST_REVISION_CONFLICT' && run.listId && rebases++ < 3) {
            const remote = await fetchList(run.listId, user);
            if (!isCurrent()) return ledger;
            run.revision = remote.revision;
            run.pending = { kind: 'item', command: listCommand(pending.command.path,
              { ...pending.command.body, expected_revision: remote.revision }) };
            await writeAccountJSON(user, storageKey, ledger);
            continue;
          }
          if (pending.kind === 'item' && failure.code === 'INGREDIENT_NOT_FOUND'
            && Object.hasOwn(pending.command.body, 'ingredient_id')) {
            // The server explicitly rejected this key. Preserve the name as a free item.
            const { ingredient_id, ...body } = pending.command.body as Record<string, unknown>;
            run.pending = { kind: 'item', command: listCommand(pending.command.path, body) };
            await writeAccountJSON(user, storageKey, ledger);
            continue;
          }
        }
        throw failure;
      }
      if (!isCurrent()) return ledger; // exact request remains available after a late response
      if (pending.kind === 'create') { run.listId = result!.id; run.revision = result!.revision; }
      else if (pending.kind === 'item') {
        ledger.receipts[run.items[run.itemIndex].token] = run.listId;
        run.itemIndex++; run.revision = result!.revision;
      } else { ledger.receipts[run.exclusions[run.exclusionIndex].token] = null; run.exclusionIndex++; }
      run.pending = null;
      await writeAccountJSON(user, storageKey, ledger); // ack and source receipt written together
    }
    return ledger;
  });
}
export async function skipRejectedRecoveryItem(user: string) {
  return exclusive(user, async () => {
    const ledger = await readRecovery(user), run = ledger.run;
    if (!run?.pending?.rejection || run.pending.kind === 'create') throw new Error('Reprends la demande pour vérifier son résultat avant de continuer.');
    if (run.pending.kind === 'item') run.itemIndex++; else run.exclusionIndex++;
    run.pending = null; // no receipt: the skipped source stays recoverable
    await writeAccountJSON(user, storageKey, ledger);
    return ledger;
  });
}
