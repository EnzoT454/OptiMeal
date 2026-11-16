import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, Text, View } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { loadPinnedList } from '../../services/shoppingAccess';
import type { OfflineList } from '../../services/shoppingOffline';
import { RecipeButton, recipeColors, recipeStyles as s } from '../recipes';
import { Message } from '../ui';
import SavedListCard from './SavedListCard';

export default function PinnedShoppingList({ onOpen, onLists }: { onOpen: (id: string) => void; onLists: () => void }) {
  const { session } = useAuth();
  const user = session?.user.id;
  const context = useRef({ user });
  if (context.current.user !== user) context.current = { user };
  const token = context.current;
  const [state, setState] = useState<{ token: object; cached: OfflineList | null; offline: boolean } | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState('');
  useFocusEffect(useCallback(() => {
    let active = true;
    setState(null); setError(''); setLoading(!!user);
    if (user) void loadPinnedList(user).then(result => {
      if (active && context.current === token) setState({ token, ...result });
    }).catch(failure => { if (active && context.current === token) setError(failure instanceof Error ? failure.message : 'Liste indisponible.'); })
      .finally(() => { if (active && context.current === token) setLoading(false); });
    return () => { active = false; };
  }, [user]));
  const value = state?.token === token ? state : null;
  return <View style={s.notice}>
    <Text style={s.sectionTitle}>Ton épicerie</Text>
    {loading && <ActivityIndicator color={recipeColors.green} accessibilityLabel="Chargement de la liste épinglée" />}
    <Message text={error} />
    {value?.cached ? <>
      {value.offline && <Text style={s.requiredItem}>Hors connexion · dernières données enregistrées le {new Date(value.cached.syncedAt).toLocaleString('fr-CA')}.</Text>}
      {value.cached.queue.length > 0 && <Text style={s.requiredItem}>{value.cached.queue.length} action(s) locale(s) en attente. Les montants et compteurs sont ceux confirmés par le serveur.</Text>}
      <SavedListCard list={value.cached.snapshot} onOpen={() => onOpen(value.cached!.snapshot.id)} />
    </> : value && <Text style={s.body}>Épingle une liste en cours depuis ses options pour la retrouver ici.</Text>}
    <RecipeButton title="Choisir une liste" variant="neutral" onPress={onLists} />
  </View>;
}
