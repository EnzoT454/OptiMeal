import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import { RecipeButton, RecipeScreen, RecipeTitle, recipeColors, recipeStyles as s } from '../components/recipes';
import { Message } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { fetchLists, dateLabel } from '../services/shoppingLists';
import type { ShoppingListRead } from '../types/shoppingLists';
import type { ListStackParams } from '../types/navigation';

export default function ListScreen({ navigation }: NativeStackScreenProps<ListStackParams, 'Lists'>) {
  const { session, requestSignIn } = useAuth();
  const userId = session?.user.id;
  const [items, setItems] = useState<ShoppingListRead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const busy = useRef(false);
  async function load(append = false) {
    if (!userId || busy.current) return;
    busy.current = true; setLoading(true); setError('');
    const request = ++generation.current;
    try {
      const page = await fetchLists(append ? items.length : 0);
      if (request === generation.current) {
        setItems(previous => append ? [...previous.filter(i => !page.items.some(n => n.id === i.id)), ...page.items] : page.items);
        setTotal(page.total);
      }
    } catch (e) { if (request === generation.current) setError(e instanceof Error ? e.message : 'Listes indisponibles.'); }
    finally { if (request === generation.current) { busy.current = false; setLoading(false); } }
  }
  useFocusEffect(useCallback(() => {
    void load();
    return () => { generation.current++; busy.current = false; };
  }, [userId]));
  const create = () => userId ? navigation.navigate('CreateList') : requestSignIn('Connecte-toi pour créer et retrouver tes listes d’achats.');
  const card = (list: ShoppingListRead) => <Pressable key={list.id} accessibilityRole="button"
    onPress={() => navigation.navigate('ShoppingDetail', { id: list.id })}
    style={[s.choice, { borderWidth: 1, borderColor: recipeColors.border, minHeight: 72 }]}>
    <Text style={s.sectionTitle}>{list.name}</Text>
    <Text style={s.body}>{list.status === 'draft' ? 'Brouillon' : list.status === 'active' ? 'En cours' : list.status === 'archived' ? 'Archivée' : 'Terminée'} · {list.totals.item_count} articles · {list.totals.remaining_item_count} à acheter</Text>
    {list.period && <Text style={s.note}>Du {dateLabel(list.period.start_date)} au {dateLabel(list.period.end_date)}</Text>}
  </Pressable>;
  return <RecipeScreen>
    <Text style={[s.sectionTitle, { color: recipeColors.green }]}>OptiMeal</Text>
    <View style={s.row}><Text accessibilityRole="header" style={s.title}>Liste d’achats</Text><Ionicons name="basket-outline" size={42} color={recipeColors.green} accessible={false} /></View>
    <Text style={s.intro}>Crée, organise et retrouve tes listes d’épicerie.</Text>
    <RecipeButton title="＋ Créer une liste" onPress={create} />
    {!userId ? <View style={s.notice}><Text style={s.sectionTitle}>Tes courses, au même endroit</Text>
      <Text style={s.body}>Commence une liste vide ou prépare tes achats à partir des repas de ton calendrier.</Text>
      <RecipeButton title="Me connecter" variant="neutral" onPress={create} /></View> : <>
      <View style={s.row}><Text style={[s.sectionTitle, { flex: 1 }]}>Mes listes</Text>
        <RecipeButton title="Actualiser" variant="neutral" disabled={loading} onPress={() => void load()} /></View>
      <Message text={error} />
      {loading && <ActivityIndicator accessibilityLabel="Chargement des listes" color={recipeColors.green} />}
      {!items.length && !loading && !error && <View style={s.notice}><Text style={s.sectionTitle}>Ta première liste t’attend</Text>
        <Text style={s.body}>Crée une liste ; ton brouillon sera enregistré dans ton compte.</Text></View>}
      {items.map(card)}
      {items.length < total && <RecipeButton title="Voir plus de listes" variant="neutral" disabled={loading} onPress={() => void load(true)} />}
    </>}
  </RecipeScreen>;
}
