import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { fetchPin, pinPath } from '../../services/shoppingAccess';
import { listCommand } from '../../services/shoppingLists';
import type { ShoppingPin } from '../../types/shoppingLists';
import { RecipeButton } from '../recipes';
import { Message } from '../ui';
import { useListCommand } from './useListCommand';

export default function PinListAction({ id, disabled }: { id: string; disabled: boolean }) {
  const { session } = useAuth();
  const user = session?.user.id;
  const current = useRef({ user, id });
  if (current.current.user !== user || current.current.id !== id) current.current = { user, id };
  const token = current.current;
  const [pin, setPin] = useState<{ user: string; value: ShoppingPin } | null>(null);
  const [error, setError] = useState('');
  const command = useListCommand<ShoppingPin>('pin');
  const pinned = pin !== null && pin.user === user && pin.value.list_id === id;
  useFocusEffect(useCallback(() => {
    let active = true; setPin(null); setError('');
    if (user) void fetchPin(user).then(value => { if (active && current.current === token) setPin({ user, value }); })
      .catch(() => { if (active && current.current === token) setError('Épinglage indisponible. Reviens sur cet écran pour réessayer.'); });
    return () => { active = false; };
  }, [user, id]));
  async function save() {
    const result = await command.run(command.pending ?? listCommand(pinPath, { list_id: pinned ? null : id }, 'PUT'));
    if (result && user && current.current === token) {
      // Replay may be older than a later preference: reread the authoritative value.
      try { const value = await fetchPin(user); if (current.current === token) { setPin({ user, value }); setError(''); } }
      catch { if (current.current === token) setError('Préférence enregistrée. Actualise pour vérifier la liste épinglée.'); }
    }
  }
  return <View style={{ gap: 8 }}>
    <RecipeButton title={command.pending ? 'Reprendre l’épinglage' : pinned ? 'Ne plus épingler sur Accueil' : 'Épingler sur Accueil'} variant="neutral"
      disabled={disabled || command.busy || !command.ready || (!pin && !command.pending)} onPress={() => void save()} />
    <Message text={error || command.error} />
  </View>;
}
