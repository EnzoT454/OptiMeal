import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import { RecipeButton, RecipeScreen, RecipeTitle, recipeColors, recipeStyles as s } from '../components/recipes';
import { Message } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { readLatestOfflineList } from '../services/shoppingOffline';
import { fetchLists, dateLabel } from '../services/shoppingLists';
import type { ShoppingListRead } from '../types/shoppingLists';
import type { ListStackParams } from '../types/navigation';

export default function ListScreen({ navigation }: NativeStackScreenProps<ListStackParams, 'Lists'>) {
  const { session, requestSignIn } = useAuth();
  const userId = session?.user.id;
  const owner = useRef(userId); owner.current = userId;
  const [itemsOwner, setItemsOwner] = useState(userId);
  const [cached, setCached] = useState<{ user: string; list: ShoppingListRead } | null>(null);
  const [collection, setCollection] = useState<'current' | 'history'>('current');
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
      const page = await fetchLists(append ? items.length : 0, collection);
      if (request === generation.current && owner.current === userId) {
        setItemsOwner(userId);
        setItems(previous => append ? [...previous.filter(i => !page.items.some(n => n.id === i.id)), ...page.items] : page.items);
        setTotal(page.total);
      }
    } catch (e) { if (request === generation.current && owner.current === userId) setError(e instanceof Error ? e.message : 'Listes indisponibles.'); }
    finally { if (request === generation.current && owner.current === userId) { busy.current = false; setLoading(false); } }
  }
  useFocusEffect(useCallback(() => {
    setItems([]); setTotal(0);
    setCached(null);
    if (userId) void readLatestOfflineList(userId).then(value => {
      if (owner.current === userId && value) setCached({ user: userId, list: value.snapshot });
    }).catch(() => {});
    void load();
    return () => { generation.current++; busy.current = false; };
  }, [userId, collection]));
  const create = () => userId ? navigation.navigate('CreateList') : requestSignIn('Connecte-toi pour créer et retrouver tes listes d’achats.');
  const card = (list: ShoppingListRead) => <Pressable key={list.id} accessibilityRole="button"
    onPress={() => navigation.navigate('ShoppingDetail', { id: list.id })}
    style={[s.choice, { borderWidth: 1, borderColor: recipeColors.border, minHeight: 72 }]}>
    <Text style={s.sectionTitle}>{list.name}</Text>
    <Text style={s.body}>{list.status === 'draft' ? 'Brouillon' : list.status === 'active' ? 'En cours' : list.status === 'archived' ? 'Archivée' : 'Terminée'} · {list.totals.item_count} articles · {list.totals.remaining_item_count} à acheter</Text>
    {(list.status === 'completed' || list.status === 'archived') && <Text style={s.note}>{list.status === 'completed' ? 'Clôturée' : 'Archivée'} le {new Date(list.updated_at).toLocaleDateString('fr-CA')}</Text>}
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
      <RecipeButton title="Mes modèles" variant="neutral" onPress={() => navigation.navigate('Templates')} />
      <View style={s.chips}>
        <RecipeButton title="En cours" variant={collection === 'current' ? 'primary' : 'neutral'} accessibilityState={{ selected: collection === 'current' }} onPress={() => { if (collection === 'current') { void load(); return; } generation.current++; busy.current = false; setItems([]); setTotal(0); setCollection('current'); }} />
        <RecipeButton title="Historique" variant={collection === 'history' ? 'primary' : 'neutral'} accessibilityState={{ selected: collection === 'history' }} onPress={() => { if (collection === 'history') { void load(); return; } generation.current++; busy.current = false; setItems([]); setTotal(0); setCollection('history'); }} />
      </View>
      <View style={s.row}><Text style={[s.sectionTitle, { flex: 1 }]}>{collection === 'history' ? 'Listes terminées ou archivées' : 'Mes listes en cours'}</Text>
        <RecipeButton title="Actualiser" variant="neutral" disabled={loading} onPress={() => void load()} /></View>
      <Message text={error} />
      {loading && <ActivityIndicator accessibilityLabel="Chargement des listes" color={recipeColors.green} />}
      {!items.length && !loading && !error && <View style={s.notice}><Text style={s.sectionTitle}>{collection === 'history' ? 'Aucune liste terminée ou archivée' : 'Ta première liste t’attend'}</Text>
        <Text style={s.body}>Crée une liste ; ton brouillon sera enregistré dans ton compte.</Text></View>}
      {cached?.user === userId && <View style={s.notice}>
        <Text style={s.note}>Dernière liste enregistrée sur cet appareil : {cached.list.name}. Disponible pour les courses hors connexion.</Text>
        <RecipeButton title="Ouvrir la liste enregistrée sur cet appareil" variant="neutral" onPress={() => navigation.navigate('ShoppingDetail', { id: cached.list.id })} />
      </View>}
      {itemsOwner === userId && items.map(card)}
      {items.length < total && <RecipeButton title="Voir plus de listes" variant="neutral" disabled={loading} onPress={() => void load(true)} />}
    </>}
  </RecipeScreen>;
}
