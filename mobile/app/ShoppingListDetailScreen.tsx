import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RecipeButton, RecipeField, RecipeScreen, RecipeTitle, recipeColors, recipeStyles as s } from '../components/recipes';
import { useAuth } from '../context/AuthContext';
import IngredientPicker from '../components/IngredientPicker';
import { api } from '../services/api';
import RecipeUnitPicker from '../components/RecipeUnitPicker';
import { Message } from '../components/ui';
import ListComparison from '../components/lists/ListComparison';
import ListCourses from '../components/lists/ListCourses';
import type { ListCommand } from '../services/shoppingLists';
import { useListCommand } from '../components/lists/useListCommand';
import { fetchRevision } from '../services/shoppingReuse';
import { dateLabel, fetchList, listCommand, listsPath } from '../services/shoppingLists';
import type { ListStackParams } from '../types/navigation';
import type { Ingredient, Page, RecipeUnit } from '../types/api';
import type { ShoppingListRead } from '../types/shoppingLists';

export default function ShoppingListDetailScreen({ route, navigation }: NativeStackScreenProps<ListStackParams, 'ShoppingDetail'>) {
  const { id, revision } = route.params;
  const readOnly = revision !== undefined;
  const [list, setList] = useState<ShoppingListRead | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [ingredientId, setIngredientId] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<Ingredient[]>([]);
  const [picker, setPicker] = useState(false);
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState<RecipeUnit | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const { session } = useAuth();
  const userId = session?.user.id;
  const identity = `${userId}:${id}:${revision ?? 'current'}`;
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const [options, setOptions] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const [listName, setListName] = useState<string | null>(null);
  const command = useListCommand(id);
  const path = `${listsPath}/${id}`;
  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    setList(null);
    readValue().then(value => { if (active && currentIdentity.current === identity) accept(value); })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Liste indisponible.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, revision, userId]));
  async function readValue() { return readOnly ? (await fetchRevision(id, revision)).snapshot : fetchList(id); }
  function accept(value: ShoppingListRead) {
    setList(current => !readOnly && current?.id === value.id && current.revision > value.revision ? current : value);
  }
  async function refresh() {
    const attempt = identity;
    setLoading(true); setError('');
    try { const value = await readValue(); if (currentIdentity.current === attempt) accept(value); }
    catch (e) { setError(e instanceof Error ? e.message : 'Liste indisponible.'); }
    finally { setLoading(false); }
  }
  async function save(commandPath: string, body: object, method: 'POST' | 'PATCH' | 'PUT' = 'POST') {
    const result = await command.run(command.pending ?? listCommand(commandPath, body, method));
    if (result) { accept(result); setName(''); setIngredientId(null); setAmount(''); setUnit(null); setListName(null); setError(''); }
  }
  async function pickIngredient() {
    const attempt = identity; setLoading(true); setError('');
    try {
      const value = await api<Page<Ingredient>>('/api/v1/ingredients?limit=100');
      if (currentIdentity.current === attempt) { setCatalog(value.items); setPicker(true); }
    } catch (failure) { if (currentIdentity.current === attempt) setError(failure instanceof Error ? failure.message : 'Ingrédients indisponibles.'); }
    finally { if (currentIdentity.current === attempt) setLoading(false); }
  }
  function submit() {
    if (!list || !name.trim()) { setError('Indique le nom de l’article.'); return; }
    const decimal = amount.trim().replace(',', '.');
    if (decimal && (!/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(decimal) || !/[1-9]/.test(decimal) || !unit)) {
      setError('Indique une quantité positive et son unité, ou laisse la quantité vide.'); return;
    }
    const quantity = decimal && unit ? { amount: decimal, unit } : null;
    const body = { expected_revision: list.revision, name: name.trim(), quantity };
    const send = (merge: 'add' | 'separate' = 'add') => void save(`${path}/items`, { ...body, ...(ingredientId ? { ingredient_id: ingredientId, merge } : {}) });
    if (ingredientId && list.items.some(i => !i.removed && i.ingredient_id === ingredientId)) {
      Alert.alert('Ingrédient déjà présent', 'Additionner cette quantité au besoin existant ou garder un article distinct ?', [
        { text: 'Annuler', style: 'cancel' }, { text: 'Additionner au besoin', onPress: () => send('add') }, { text: 'Garder séparé', onPress: () => send('separate') },
      ]);
    } else if (list.items.some(i => !i.removed && i.name.trim().toLocaleLowerCase('fr') === name.trim().toLocaleLowerCase('fr'))) {
      Alert.alert('Article déjà présent', 'Un article porte déjà ce nom. Veux-tu ajouter une ligne distincte ?', [
        { text: 'Annuler', style: 'cancel' }, { text: 'Ajouter séparément', onPress: () => send() },
      ]);
    } else send();
  }
  const editable = !readOnly && (list?.status === 'draft' || list?.status === 'active');
  const locked = command.locked || loading || !editable;
  return <RecipeScreen>
    {loading && <ActivityIndicator accessibilityLabel="Chargement de la liste" color={recipeColors.green} />}
    <Message text={error || command.error} />
    {!readOnly && command.pending && <View style={s.notice}><Text style={s.sectionTitle}>Enregistrement à vérifier</Text>
      <Text style={s.body}>Reprends la demande précédente avant de modifier la liste. Ton ajout n’a pas été perdu.</Text>
      <RecipeButton title="Reprendre l’enregistrement" disabled={command.busy} onPress={() => void save(path, {})} />
    </View>}
    <RecipeButton title="Actualiser la liste" variant="neutral" disabled={command.busy || loading} onPress={() => void refresh()} />
    {list && <>
      <RecipeTitle>{list.name}</RecipeTitle>
      {readOnly && <Text style={s.requiredItem}>Révision {revision} · consultation seule. Les prix et quantités sont ceux enregistrés à cette date.</Text>}
      {list.origin && <Text style={s.note}>Copie indépendante {list.origin.kind === 'template' ? 'd’un modèle' : 'd’une liste'} · révision source {list.origin.revision}.</Text>}
      <Text style={s.body}>{list.status === 'draft' ? 'Brouillon enregistré' : list.status === 'active' ? 'Liste en cours' : list.status === 'completed' ? 'Liste terminée' : 'Liste archivée'} · révision {list.revision}</Text>
      <Text style={s.note}>Courses prévues le {dateLabel(list.purchase_date)}</Text>
      {list.period && <Text style={s.note}>Repas du {dateLabel(list.period.start_date)} au {dateLabel(list.period.end_date)}. Copie indépendante du calendrier.</Text>}
      <View style={s.notice}><Text style={s.sectionTitle}>{list.totals.item_count} articles</Text>
        <Text style={s.body}>{list.totals.remaining_item_count} à acheter · {list.totals.purchased_item_count} achetés · {list.totals.owned_item_count} déjà disponibles</Text>
        <Text style={s.body}>{(list.assignment && !list.assignment.stale && list.assignment.scenario.needs.some(n => n.lines.length)) || list.product_purchases?.some(p => p.purchased_units > 0)
          ? `${list.totals.estimate_complete ? 'Estimation des achats' : 'Sous-total connu'} : ${list.totals.budget_known_amount.replace('.', ',')} $`
          : 'Estimation indisponible'}</Text></View>
      <Text style={s.note}>Reste connu à acheter : {list.totals.remaining_known_amount.replace('.', ',')} $ · {list.totals.unpriced_item_count} article(s) sans estimation complète. Estimations hors taxes et consignes non documentées ; prix payés non confirmés.</Text>
      {list.assignment?.stale && <Text style={s.requiredItem}>Proposition à réévaluer : les achats effectués et leurs estimations sont conservés.</Text>}
      {editable && <RecipeButton title="Comparer les magasins" variant={list.status === 'active' ? 'neutral' : 'primary'} disabled={locked} onPress={() => setShowComparison(!showComparison)} />}
      {editable && showComparison && <ListComparison list={list} disabled={locked} onCommand={async (intent: ListCommand) => {
        const saved = await command.run(intent);
        if (!saved) return false;
        accept(saved); setError(''); return true;
      }} />}
      {!readOnly && list.status === 'active' && <RecipeButton title="Terminer les courses" disabled={locked} onPress={() => {
        const finish = (accept_remaining: boolean) => void save(`${path}/complete`, { expected_revision: list.revision, accept_remaining });
        if (list.totals.remaining_item_count) Alert.alert('Des besoins restent à acheter', `${list.totals.remaining_item_count} article(s) ne sont pas entièrement couverts. Terminer quand même ?`, [
          { text: 'Continuer les courses', style: 'cancel' }, { text: 'Terminer quand même', onPress: () => finish(true) },
        ]); else finish(false);
      }} />}
      {list.warnings.filter(w => w.code !== 'ESTIMATE_UNAVAILABLE').map((w, i) => <Text key={i} style={s.requiredItem}>{w.message}</Text>)}
      <RecipeButton title="Options de la liste" variant="neutral" onPress={() => setOptions(!options)} accessibilityState={{ expanded: options }} />
      {options && <>
      <RecipeButton title="Copier les besoins" variant="neutral" disabled={loading || command.busy} onPress={() => navigation.navigate('ReuseList', { id, revision: list.revision, mode: 'copy' })} />
      <RecipeButton title="Enregistrer comme modèle" variant="neutral" disabled={loading || command.busy} onPress={() => navigation.navigate('ReuseList', { id, revision: list.revision, mode: 'template' })} />
      <RecipeButton title="Consulter les révisions" variant="neutral" onPress={() => navigation.navigate('Revisions', { id })} />
      {editable && <RecipeButton title="Archiver la liste" variant="neutral" disabled={locked} onPress={() => Alert.alert('Archiver cette liste ?', 'Elle restera consultable dans l’historique et pourra être rouverte.', [
        { text: 'Annuler', style: 'cancel' }, { text: 'Archiver', onPress: () => void save(`${path}/archive`, { expected_revision: list.revision }) },
      ])} />}
      {editable && <RecipeButton title="Renommer la liste" variant="neutral" disabled={locked} onPress={() => setListName(list.name)} />}
      {listName !== null && <>
        <RecipeField label="Nouveau nom" value={listName} maxLength={120} editable={!locked} onChangeText={setListName} />
        <RecipeButton title="Enregistrer le nom" disabled={locked || !listName.trim()} onPress={() => void save(path, { expected_revision: list.revision, name: listName.trim() }, 'PATCH')} />
      </>}
      </>}
      {editable && <RecipeButton title="Ajouter un article" variant="neutral" disabled={locked} onPress={() => setShowAdd(!showAdd)} accessibilityState={{ expanded: showAdd }} />}
      {editable && showAdd ? <View style={[s.notice, { gap: 12 }]}>
        <Text style={s.sectionTitle}>Ajouter un article</Text>
        <RecipeField label="Article" value={name} maxLength={120} editable={!locked} onChangeText={value => { setName(value); setIngredientId(null); }} placeholder="Ex. Pain" />
        <RecipeButton title="Choisir un ingrédient du catalogue" variant="neutral" disabled={locked} onPress={() => void pickIngredient()} />
        <RecipeField label="Quantité (facultative)" value={amount} editable={!locked} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="Ex. 2" />
        <RecipeUnitPicker value={unit} onChange={setUnit} ingredientLabel={name || 'Article'} disabled={locked} />
        <Text style={s.note}>Sans quantité, l’article reste à préciser. Les articles saisis librement restent sur des lignes distinctes.</Text>
        <RecipeButton title="Ajouter à la liste" disabled={locked || !name.trim()} onPress={submit} />
      </View> : !readOnly && (list.status === 'archived' || list.status === 'completed') ? <RecipeButton title="Rouvrir cette liste" disabled={command.locked || loading} onPress={() => void save(`${path}/reopen`, { expected_revision: list.revision })} /> : null}
      {!list.items.some(i => !i.removed) && <Text style={s.body}>Aucun article pour le moment. Ajoute ce dont tu as besoin.</Text>}
      <ListCourses list={list} disabled={locked} error={command.error} onCommand={async intent => {
        const saved = await command.run(intent);
        if (!saved) return false;
        accept(saved); setError(''); return true;
      }} />
      {list.items.filter(i => i.removed).map(item => <View key={item.id} style={s.choice}>
        <Text style={s.body}>{item.name} · retiré</Text>
        <RecipeButton title={`Restaurer ${item.name}`} variant="neutral" disabled={locked} onPress={() => void save(`${path}/items/${item.id}`, { expected_revision: list.revision, removed: false }, 'PATCH')} />
      </View>)}
      {!readOnly && list.status === 'draft' && <RecipeButton title="Utiliser cette liste" disabled={locked} onPress={() => void save(`${path}/activate`, { expected_revision: list.revision })} />}
    </>}
    <IngredientPicker visible={picker} ingredients={catalog} onClose={() => setPicker(false)} onSelect={selectedId => { const item = catalog.find(i => i.id === selectedId); if (item) { setIngredientId(item.id); setName(item.name); } setPicker(false); }} />
  </RecipeScreen>;
}
