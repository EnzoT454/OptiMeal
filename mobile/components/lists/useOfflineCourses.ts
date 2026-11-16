import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../services/api';
import { cacheList, enqueuePurchase, readOfflineList, resolvePurchase, synchronizePurchases, type OfflineList } from '../../services/shoppingOffline';
import { fetchList, type ListCommand } from '../../services/shoppingLists';
import type { ShoppingListRead } from '../../types/shoppingLists';

export function useOfflineCourses(user: string | undefined, id: string, enabled: boolean) {
  const identity = `${user}:${id}:${enabled}`;
  const current = useRef({ identity });
  if (current.current.identity !== identity) current.current = { identity };
  const token = current.current;
  const hydrated = useRef('');
  const running = useRef<object | null>(null);
  const [value, setValue] = useState<{ token: object; state: OfflineList; offline: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const state = value?.token === token ? value.state : null;
  const offline = value?.token === token && value.offline;
  const valid = () => current.current === token && !!user && enabled;
  function show(next: OfflineList | null, disconnected: boolean) {
    if (valid() && next) setValue({ token, state: next, offline: disconnected });
  }
  async function refresh() {
    if (!valid() || !user || running.current === token) return null;
    running.current = token; setBusy(true); setError('');
    try {
      let cached = await readOfflineList(user, id);
      if (hydrated.current !== identity) { hydrated.current = identity; show(cached, true); }
      if (!cached) cached = await cacheList(user, await fetchList(id, user));
      if (!valid()) return null;
      const next = await synchronizePurchases(user, id, valid);
      show(next, false);
      return next?.snapshot ?? null;
    } catch (failure) {
      if (!valid()) return null;
      const cached = await readOfflineList(user, id).catch(() => null);
      const fallback = !(failure instanceof ApiError) || failure.status >= 500 || failure.status === 401;
      if (fallback) show(cached, true);
      else setValue(null); // a deleted/inaccessible resource is not an offline success
      setError(failure instanceof Error ? failure.message : 'Synchronisation impossible.');
      return fallback ? cached?.snapshot ?? null : null;
    } finally {
      if (running.current === token) running.current = null;
      if (valid()) setBusy(false);
    }
  }
  useEffect(() => {
    current.current = token; hydrated.current = '';
    setValue(null); setError(''); setBusy(false);
    if (!user || !enabled) return;
    void refresh();
    // Retry only while this detail is mounted. The API enforces the captured account.
    const timer = setInterval(() => { void refresh(); }, 15000);
    return () => { clearInterval(timer); if (current.current === token) current.current = { identity: '' }; };
  }, [identity]);
  async function enqueue(command: ListCommand) {
    if (!valid() || !user || running.current === token) return false;
    running.current = token; setBusy(true); setError('');
    try { show(await enqueuePurchase(user, id, command), offline); return valid(); }
    catch (failure) { if (valid()) setError(failure instanceof Error ? failure.message : 'Sauvegarde locale impossible.'); return false; }
    finally {
      if (running.current === token) running.current = null;
      if (valid()) setBusy(false);
    }
  }
  async function resolve(keep: boolean) {
    if (!valid() || !user || running.current === token) return;
    running.current = token; setBusy(true);
    try { show(await resolvePurchase(user, id, keep), offline); }
    catch (failure) { if (valid()) setError(failure instanceof Error ? failure.message : 'Résolution impossible.'); }
    finally { if (running.current === token) running.current = null; if (valid()) setBusy(false); }
  }
  async function accept(snapshot: ShoppingListRead) {
    if (!valid() || !user) return;
    try { show(await cacheList(user, snapshot), false); }
    catch { if (valid()) setError('Enregistré sur le serveur, mais cache local non enregistré. Actualise avant de quitter.'); }
  }
  return { state, offline, busy, error, refresh, enqueue, resolve, accept };
}
