import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import type { ShoppingPage } from '../../types/shoppingLists';

// Pagination des ressources privées ; une réponse d'un ancien parcours ou
// compte ne remplace pas le contenu courant.
export function useShoppingPage<T>(scope: string, fetchPage: (offset: number) => Promise<ShoppingPage<T>>, keyOf: (item: T) => string) {
  const { session } = useAuth();
  const identity = `${session?.user.id ?? 'visitor'}:${scope}`;
  const current = useRef(identity); current.current = identity;
  const generation = useRef(0);
  const request = useRef<number | null>(null);
  const [state, setState] = useState<{ identity: string; items: T[]; total: number }>({ identity, items: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const items = state.identity === identity ? state.items : [];
  async function load(append = false) {
    if (!session || request.current !== null) return;
    const version = generation.current;
    request.current = version; setLoading(true); setError('');
    try {
      const page = await fetchPage(append ? items.length : 0);
      if (current.current === identity && generation.current === version) {
        setState(previous => ({ identity, total: page.total, items: append && previous.identity === identity
          ? [...previous.items.filter(item => !page.items.some(next => keyOf(item) === keyOf(next))), ...page.items] : page.items }));
      }
    } catch (failure) {
      if (current.current === identity && generation.current === version) setError(failure instanceof Error ? failure.message : 'Chargement impossible.');
    } finally {
      if (current.current === identity && generation.current === version) { request.current = null; setLoading(false); }
    }
  }
  useFocusEffect(useCallback(() => {
    generation.current++; request.current = null;
    void load();
    return () => { generation.current++; request.current = null; };
  }, [identity]));
  return { items, total: state.identity === identity ? state.total : 0, loading, error, load };
}
