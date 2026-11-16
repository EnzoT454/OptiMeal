import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ApiError } from '../../services/api';
import { readAccountJSON, writeAccountJSON } from '../../services/accountStorage';
import type { ShoppingListRead } from '../../types/shoppingLists';
import { ListCommand, sendListCommand } from '../../services/shoppingLists';

// Conserver une commande incertaine avant l'envoi permet aussi de la reprendre
// après fermeture de l'app, avec la même clé et le même corps.
export function useListCommand<T = ShoppingListRead>(scope: string) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const storageKey = `shopping-command.${scope}`;
  const [pending, setPending] = useState<ListCommand | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const active = useRef(true);
  const context = `${userId}:${storageKey}`;
  const currentContext = useRef(context);
  currentContext.current = context;
  const loadedContext = useRef<string | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    active.current = true;
    const version = ++generation.current;
    lock.current = false; setBusy(false); setReady(false); setPending(null); setError('');
    const isCurrent = () => active.current && generation.current === version && currentContext.current === context;
    readAccountJSON<ListCommand | null>(userId, storageKey, null).then(value => {
      if (isCurrent()) { loadedContext.current = context; setPending(value); setReady(true); }
    }).catch(() => { if (isCurrent()) setError('Impossible de lire la sauvegarde locale. Rouvre cet écran.'); });
    return () => { active.current = false; };
  }, [userId, storageKey]);

  async function run(command: ListCommand) {
    if (lock.current || !ready || loadedContext.current !== context || !userId) return null;
    const version = generation.current;
    const isCurrent = () => active.current && generation.current === version && currentContext.current === context;
    lock.current = true; setBusy(true); setError('');
    const attempt = pending ?? command;
    try {
      await writeAccountJSON(userId, storageKey, attempt);
      if (!isCurrent()) return null;
      setPending(attempt);
      const result = await sendListCommand<T>(attempt, userId);
      await writeAccountJSON(userId, storageKey, null);
      if (isCurrent()) setPending(null);
      return isCurrent() ? result : null;
    } catch (failure) {
      // Un refus explicite n'a rien écrit. Les erreurs réseau/503 restent
      // incertaines : seule la même commande peut être renvoyée.
      if (failure instanceof ApiError && [404, 409, 422].includes(failure.status)) {
        await writeAccountJSON(userId, storageKey, null).catch(() => {});
        if (isCurrent()) setPending(null);
      }
      if (isCurrent()) setError(failure instanceof Error ? failure.message : 'Enregistrement impossible. Réessaie.');
      return null;
    } finally {
      if (isCurrent()) { lock.current = false; setBusy(false); }
    }
  }
  return { pending, ready, busy, error, run, locked: !ready || loadedContext.current !== context || busy || !!pending };
}
