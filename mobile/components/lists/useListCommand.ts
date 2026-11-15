import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ApiError } from '../../services/api';
import { readAccountJSON, writeAccountJSON } from '../../services/accountStorage';
import { ListCommand, sendListCommand } from '../../services/shoppingLists';

// Conserver une commande incertaine avant l'envoi permet aussi de la reprendre
// après fermeture de l'app, avec la même clé et le même corps.
export function useListCommand(scope: string) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const storageKey = `shopping-command.${scope}`;
  const [pending, setPending] = useState<ListCommand | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    readAccountJSON<ListCommand | null>(userId, storageKey, null).then(value => {
      if (active.current) { setPending(value); setReady(true); }
    }).catch(() => { if (active.current) setError('Impossible de lire la sauvegarde locale. Rouvre cet écran.'); });
    return () => { active.current = false; };
  }, [userId, storageKey]);

  async function run(command: ListCommand) {
    if (lock.current || !ready || !userId) return null;
    lock.current = true; setBusy(true); setError('');
    const attempt = pending ?? command;
    try {
      await writeAccountJSON(userId, storageKey, attempt);
      if (active.current) setPending(attempt);
      const result = await sendListCommand(attempt, userId);
      await writeAccountJSON(userId, storageKey, null);
      if (active.current) setPending(null);
      return active.current ? result : null;
    } catch (failure) {
      // Un refus explicite n'a rien écrit. Les erreurs réseau/503 restent
      // incertaines : seule la même commande peut être renvoyée.
      if (failure instanceof ApiError && [404, 409, 422].includes(failure.status)) {
        await writeAccountJSON(userId, storageKey, null).catch(() => {});
        if (active.current) setPending(null);
      }
      if (active.current) setError(failure instanceof Error ? failure.message : 'Enregistrement impossible. Réessaie.');
      return null;
    } finally {
      lock.current = false;
      if (active.current) setBusy(false);
    }
  }
  return { pending, ready, busy, error, run, locked: !ready || busy || !!pending };
}
