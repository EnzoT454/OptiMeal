import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, Text, View } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { loadPinnedList } from '../../services/shoppingAccess';
import type { ShoppingListRead } from '../../types/shoppingLists';
import { RecipeButton, recipeColors, recipeStyles as s } from '../recipes';
import { Message } from '../ui';
import ListSummaryRow from './ListSummaryRow';

export default function PinnedShoppingList({ onOpen, onLists }: { onOpen: (id: string) => void; onLists: () => void }) {
  const { session } = useAuth();
  const user = session?.user.id;
  const context = useRef({ user });
  if (context.current.user !== user) context.current = { user };
  const token = context.current;
  const [state, setState] = useState<{ token: object; list: ShoppingListRead | null } | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState('');
  useFocusEffect(useCallback(() => {
    let active = true;
    setState(null); setError(''); setLoading(!!user);
    if (user) void loadPinnedList(user).then(result => {
      if (active && context.current === token) setState({ token, list: result });
    }).catch(failure => { if (active && context.current === token) setError(failure instanceof Error ? failure.message : 'Liste indisponible.'); })
      .finally(() => { if (active && context.current === token) setLoading(false); });
    return () => { active = false; };
  }, [user]));
  const value = state?.token === token ? state : null;
  return <View style={s.notice}>
    <Text style={s.sectionTitle}>Ton épicerie</Text>
    {loading && <ActivityIndicator color={recipeColors.green} accessibilityLabel="Chargement de la liste épinglée" />}
    <Message text={error} />
    {value?.list ? <ListSummaryRow list={value.list} onPress={() => onOpen(value.list!.id)} />
      : value && <Text style={s.body}>Aucune liste épinglée.</Text>}
    <RecipeButton title="Choisir une liste" variant="neutral" onPress={onLists} />
  </View>;
}
