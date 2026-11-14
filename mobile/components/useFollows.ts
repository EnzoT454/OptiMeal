import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import type { Offer } from '../types/api';
import { getFollows, toggleFollow, unfollow, type Follow } from './follows';

// Les trois écrans Promos utilisent le même contrôle d'identité pour leurs suivis.
export function useFollows() {
  const { session, requestSignIn } = useAuth();
  const userId = session?.user.id ?? null;
  const scopeRef = useRef({ userId });
  if (scopeRef.current.userId !== userId) scopeRef.current = { userId };
  const scope = scopeRef.current;
  const mounted = useRef(true);
  const request = useRef(0);
  const [stored, setStored] = useState<{ userId: string | null; follows: Follow[]; busy: boolean; error: string }>({
    userId, follows: [], busy: false, error: '',
  });
  const current = stored.userId === userId ? stored : { userId, follows: [], busy: false, error: '' };
  const update = useCallback((patch: Partial<typeof stored>) => {
    if (!mounted.current || scopeRef.current !== scope) return;
    setStored(previous => {
      if (!mounted.current || scopeRef.current !== scope) return previous;
      const base = previous.userId === scope.userId ? previous : { userId: scope.userId, follows: [], busy: false, error: '' };
      return { ...base, ...patch };
    });
  }, [scope]);

  const recharger = useCallback(async () => {
    if (scopeRef.current !== scope) return;
    const number = ++request.current;
    const follows = await getFollows(userId);
    if (number === request.current) update({ follows, error: '' });
  }, [scope, userId, update]);

  useEffect(() => {
    mounted.current = true;
    void recharger();
    return () => { mounted.current = false; request.current++; };
  }, [recharger]);

  async function change(operation: () => Promise<Follow[]>) {
    if (!mounted.current || scopeRef.current !== scope) return;
    if (!userId) { requestSignIn('Connecte-toi pour suivre des produits et retrouver tes suivis.'); return; }
    request.current++;
    update({ busy: true, error: '' });
    try { update({ follows: await operation() }); }
    catch { update({ error: 'Impossible d’enregistrer tes produits suivis. Réessaie.' }); }
    finally { update({ busy: false }); }
  }

  return { ...current, recharger,
    toggle: (offer: Offer) => change(() => toggleFollow(userId, offer)),
    retirer: (offerId: string) => change(() => unfollow(userId, offerId)),
  };
}
