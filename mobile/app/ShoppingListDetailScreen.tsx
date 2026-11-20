import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RecipeButton, RecipeField, RecipeScreen, RecipeTitle, recipeColors, recipeStyles as s } from '../components/recipes';
import { useAuth } from '../context/AuthContext';
import { Message } from '../components/ui';
import PinListAction from '../components/lists/PinListAction';
import { SavedListTotals } from '../components/lists/SavedListCard';
import ListCourses from '../components/lists/ListCourses';
import ShoppingPriceNotice from '../components/lists/ShoppingPriceNotice';
import ListQuickAdd from '../components/lists/ListQuickAdd';
import { shoppingListKind } from '../services/shoppingPresentation';
import type { ListCommand } from '../services/shoppingLists';
import { useListCommand } from '../components/lists/useListCommand';
import { recalculatePricesCommand, dateLabel, fetchList, listCommand, listsPath } from '../services/shoppingLists';
import type { ListStackParams } from '../types/navigation';
import type { ShoppingListRead } from '../types/shoppingLists';

export default function ShoppingListDetailScreen({ route, navigation }: NativeStackScreenProps<ListStackParams, 'ShoppingDetail'>) {
  const { id } = route.params;
  const { session } = useAuth();
  const userId = session?.user.id;
  const identity = `${userId}:${id}`;
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const generation = useRef(0);
  const [stored, setList] = useState<{ identity: string; value: ShoppingListRead } | null>(null);
  const list = stored?.identity === identity ? stored.value : null;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [options, setOptions] = useState(false);
  const [panel, setPanel] = useState<'rename' | 'complete' | null>(null);
  const [addingProducts, setAddingProducts] = useState(false);
  const [listName, setListName] = useState<string | null>(null);
  const command = useListCommand(id);
  const path = `${listsPath}/${id}`;
  function accept(value: ShoppingListRead) {
    if (currentIdentity.current !== identity || value.id !== id) return;
    setList(previous => previous?.identity === identity && previous.value.revision > value.revision ? previous : { identity, value });
  }
  async function refresh() {
    if (!userId) return;
    const version = ++generation.current;
    setLoading(true); setError('');
    try { const value = await fetchList(id, userId); if (generation.current === version) accept(value); }
    catch (failure) { if (generation.current === version && currentIdentity.current === identity) setError(failure instanceof Error ? failure.message : 'Liste indisponible.'); }
    finally { if (generation.current === version && currentIdentity.current === identity) setLoading(false); }
  }
  useFocusEffect(useCallback(() => {
    setList(null); setPanel(null); setOptions(false); setListName(null);
    void refresh();
    return () => { generation.current++; };
  }, [identity]));
  async function send(intent: ListCommand) {
    const version = generation.current;
    const result = await command.run(intent);
    if (!result || version !== generation.current || currentIdentity.current !== identity) return false;
    accept(result); if (panel === 'rename') setPanel(null); setListName(null); setError('');
    if (result.status === 'completed' && intent.path === `${path}/complete`) navigation.navigate('Lists', { section: 'recent' });
    return true;
  }
  async function save(commandPath: string, body: object, method: 'POST' | 'PATCH' | 'PUT' = 'POST') {
    return send(command.pending ?? listCommand(commandPath, body, method));
  }
  const kind = list ? shoppingListKind(list) : 'articles';
  const refreshNeeded = kind === 'products' && !!list?.items.some(item => !item.removed) && (!list.assignment || list.assignment.stale);
  const visibleWarnings = list?.warnings.filter(w => w.code !== 'ESTIMATE_UNAVAILABLE' && !(kind === 'products' && ['COPY_PRODUCT_CHOICES', 'COMPARISON_STALE'].includes(w.code))) ?? [];
  const editable = list?.status === 'draft' || list?.status === 'active';
  const locked = command.locked || loading || !editable;
  const menuLocked = command.locked || loading || !list || panel !== null;
  useEffect(() => {
    navigation.setOptions({ headerRight: () => <Pressable accessibilityRole="button" accessibilityLabel="Options de la liste"
      accessibilityState={{ expanded: options, disabled: menuLocked }} disabled={menuLocked} onPress={() => setOptions(true)}
      style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}>
      <MaterialCommunityIcons name="dots-horizontal" size={26} color={recipeColors.green} accessible={false} />
    </Pressable> });
  }, [navigation, menuLocked, options]);
  function openPanel(next: 'rename') {
    if (!list || locked) return;
    setOptions(false); setPanel(next); setError('');
    if (next === 'rename') { setListName(list.name); }
  }
  function finish() {
    if (!list || locked || list.status !== 'active') return;
    setOptions(false);
    const complete = (accept_remaining: boolean) => void save(`${path}/complete`, { expected_revision: list.revision, accept_remaining });
    if (list.totals.remaining_item_count) setPanel('complete');
    else complete(false);
  }
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform?.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={64}><RecipeScreen>
    {loading && <ActivityIndicator accessibilityLabel="Chargement de la liste" color={recipeColors.green} />}
    <Message text={error || command.error} />
    {command.pending && <View style={s.notice}><Text style={s.sectionTitle}>Enregistrement à vérifier</Text>
      <Text style={s.body}>Reprends la demande précédente avant de modifier la liste. Ton ajout n’a pas été perdu.</Text>
      <RecipeButton title="Reprendre l’enregistrement" disabled={command.busy} onPress={() => void save(path, {})} />
    </View>}
    {!!error && <RecipeButton title="Réessayer" variant="neutral" disabled={command.busy || loading} onPress={() => void refresh()} />}
    {list && <>
      <RecipeTitle>{list.name}</RecipeTitle>
      {editable && panel === null && kind !== 'mixed' && <ListQuickAdd list={list} disabled={locked} onCommand={send} onEditingChange={setAddingProducts} />}
      {kind === 'mixed' && <Text style={s.note}>Ancienne liste mixte conservée. Crée une liste d’articles ou de produits pour de nouveaux ajouts.</Text>}
      {list.period && <Text style={s.note}>Repas du {dateLabel(list.period.start_date)} au {dateLabel(list.period.end_date)}. Copie indépendante du calendrier.</Text>}
      <View style={s.notice}>
        <SavedListTotals list={list} />
      </View>
      {refreshNeeded && <Text accessibilityLiveRegion="polite" style={s.note}>Veuillez actualiser les prix.</Text>}
      {list.status === 'active' && panel === null && list.totals.item_count > 0 && list.totals.remaining_item_count === 0 &&
        <RecipeButton title="Terminer la liste" disabled={locked || addingProducts} onPress={finish} />}
      {editable && panel === null && kind === 'products' && list.items.some(item => !item.removed) && <>
        <RecipeButton title="Actualiser les prix" variant="neutral" disabled={locked || addingProducts}
          onPress={() => void send(recalculatePricesCommand(list, { refresh_date: true }))} />
        {addingProducts && <Text style={s.note}>Touche Terminé après tes ajouts pour actualiser les prix.</Text>}
      </>}
      {visibleWarnings.map((w, i) => <Text key={i} style={s.requiredItem}>{w.message}</Text>)}
      {panel === 'complete' && <View style={s.notice}>
        <Text style={s.sectionTitle}>Terminer cette liste ?</Text>
        <Text style={s.body}>{list.totals.remaining_item_count} élément(s) restent à acheter. Cette copie quittera les récentes ; tes listes sauvegardées seront conservées.</Text>
        <RecipeButton title="Terminer quand même" disabled={locked} onPress={() => void save(`${path}/complete`, { expected_revision: list.revision, accept_remaining: true })} />
        <RecipeButton title="Continuer les courses" variant="neutral" disabled={command.locked} onPress={() => setPanel(null)} />
      </View>}
      {panel === 'rename' && <View style={{ gap: 12 }}>
        <RecipeField label="Nouveau nom" value={listName ?? ''} maxLength={120} editable={!locked} onChangeText={setListName} />
        <RecipeButton title="Enregistrer le nom" disabled={locked || !listName?.trim()} onPress={() => {
          if (listName?.trim()) void save(path, { expected_revision: list.revision, name: listName.trim() }, 'PATCH').then(saved => { if (saved) setPanel(null); });
        }} />
        <RecipeButton title="Annuler" variant="neutral" disabled={command.busy || !!command.pending} onPress={() => { setPanel(null); setListName(null); }} />
      </View>}
      {!list.items.some(i => !i.removed) && <Text style={s.body}>{kind === 'products' ? 'Aucun produit.' : 'Aucun article.'}</Text>}
      <ListCourses list={list} disabled={locked || panel !== null} error={command.error} onCommand={send} />
      {list.status === 'draft' && <RecipeButton title="Utiliser cette liste" disabled={locked} onPress={() => void save(`${path}/activate`, { expected_revision: list.revision })} />}
      <ShoppingPriceNotice list={list} />
    </>}
    {options && list && <Modal visible transparent animationType="fade" onRequestClose={() => setOptions(false)}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#0007' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Fermer les options de la liste" onPress={() => setOptions(false)} style={{ flex: 1, minHeight: 48 }} />
        <SafeAreaView accessibilityViewIsModal onAccessibilityEscape={() => setOptions(false)} edges={['bottom', 'left', 'right']} style={{ maxHeight: '85%', backgroundColor: recipeColors.background, padding: 20, borderTopLeftRadius: 22, borderTopRightRadius: 22 }}>
          <ScrollView contentContainerStyle={{ gap: 12 }}>
            <Text accessibilityRole="header" style={s.sectionTitle}>Options de la liste</Text>
            <RecipeButton title="Renommer la liste" variant="neutral" disabled={locked} onPress={() => openPanel('rename')} />
            {editable ? <PinListAction id={id} disabled={locked} /> : <RecipeButton title="Épingler sur Accueil" variant="neutral" disabled onPress={() => {}} />}
            <RecipeButton title="Enregistrer dans mes listes" variant="neutral" disabled={command.locked || loading} onPress={() => {
              setOptions(false); navigation.navigate('ReuseList', { id, revision: list.revision, mode: 'template' });
            }} />
            {editable ? <RecipeButton title="Marquer comme terminée" variant="neutral" disabled={locked || list.status !== 'active'} onPress={finish} />
              : <RecipeButton title="Rouvrir la liste" variant="neutral" disabled={command.locked || loading} onPress={() => {
                setOptions(false); void save(`${path}/reopen`, { expected_revision: list.revision });
              }} />}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>}
  </RecipeScreen></KeyboardAvoidingView>;
}
