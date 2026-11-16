import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RecipeButton, RecipeField, RecipeScreen, RecipeTitle, recipeColors, recipeStyles as s } from '../components/recipes';
import RecipeUnitPicker from '../components/RecipeUnitPicker';
import { Message } from '../components/ui';
import ListComparison from '../components/lists/ListComparison';
import type { ListCommand } from '../services/shoppingLists';
import { useListCommand } from '../components/lists/useListCommand';
import { dateLabel, fetchList, listCommand, listsPath, quantityLabel } from '../services/shoppingLists';
import type { ListStackParams } from '../types/navigation';
import type { RecipeUnit } from '../types/api';
import type { ShoppingItemRead, ShoppingListRead } from '../types/shoppingLists';

export default function ShoppingListDetailScreen({ route }: NativeStackScreenProps<ListStackParams, 'ShoppingDetail'>) {
  const { id } = route.params;
  const [list, setList] = useState<ShoppingListRead | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState<RecipeUnit | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [listName, setListName] = useState<string | null>(null);
  const command = useListCommand(id);
  const path = `${listsPath}/${id}`;
  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    fetchList(id).then(value => { if (active) setList(value); })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Liste indisponible.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]));
  async function refresh() {
    setLoading(true); setError('');
    try { setList(await fetchList(id)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Liste indisponible.'); }
    finally { setLoading(false); }
  }
  async function save(commandPath: string, body: object, method: 'POST' | 'PATCH' = 'POST') {
    const result = await command.run(command.pending ?? listCommand(commandPath, body, method));
    if (result) { setList(result); setName(''); setAmount(''); setUnit(null); setEditing(null); setListName(null); setError(''); }
  }
  function submit() {
    if (!list || !name.trim()) { setError('Indique le nom de l’article.'); return; }
    const decimal = amount.trim().replace(',', '.');
    if (decimal && (!/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(decimal) || !/[1-9]/.test(decimal) || !unit)) {
      setError('Indique une quantité positive et son unité, ou laisse la quantité vide.'); return;
    }
    const quantity = decimal && unit ? { amount: decimal, unit } : null;
    const body = { expected_revision: list.revision, name: name.trim(), quantity };
    const send = () => void save(editing ? `${path}/items/${editing}` : `${path}/items`, body, editing ? 'PATCH' : 'POST');
    if (!editing && list.items.some(i => !i.removed && i.name.trim().toLocaleLowerCase('fr') === name.trim().toLocaleLowerCase('fr'))) {
      Alert.alert('Article déjà présent', 'Un article porte déjà ce nom. Veux-tu ajouter une ligne distincte ?', [
        { text: 'Annuler', style: 'cancel' }, { text: 'Ajouter séparément', onPress: send },
      ]);
    } else send();
  }
  function edit(item: ShoppingItemRead) {
    setEditing(item.id); setName(item.name);
    setAmount(item.required.length === 1 ? item.required[0].amount : '');
    setUnit(item.required.length === 1 ? item.required[0].unit : null);
    setError('');
  }
  const editedUnit = list?.items.find(i => i.id === editing)?.required[0]?.unit;
  const allowedUnits: RecipeUnit[] | undefined = !editedUnit ? undefined
    : editedUnit === 'g' ? ['g'] : editedUnit === 'unit' ? ['unit'] : ['ml', 'cup', 'tbsp', 'tsp'];
  const editable = list?.status === 'draft' || list?.status === 'active';
  const locked = command.locked || loading || !editable;
  return <RecipeScreen>
    {loading && <ActivityIndicator accessibilityLabel="Chargement de la liste" color={recipeColors.green} />}
    <Message text={error || command.error} />
    {command.pending && <View style={s.notice}><Text style={s.sectionTitle}>Enregistrement à vérifier</Text>
      <Text style={s.body}>Reprends la demande précédente avant de modifier la liste. Ton ajout n’a pas été perdu.</Text>
      <RecipeButton title="Reprendre l’enregistrement" disabled={command.busy} onPress={() => void save(path, {})} />
    </View>}
    <RecipeButton title="Actualiser la liste" variant="neutral" disabled={command.busy || loading} onPress={() => void refresh()} />
    {list && <>
      <RecipeTitle>{list.name}</RecipeTitle>
      <Text style={s.body}>{list.status === 'draft' ? 'Brouillon enregistré' : list.status === 'active' ? 'Liste en cours' : list.status === 'completed' ? 'Liste terminée' : 'Liste archivée'} · révision {list.revision}</Text>
      <Text style={s.note}>Courses prévues le {dateLabel(list.purchase_date)}</Text>
      {list.period && <Text style={s.note}>Repas du {dateLabel(list.period.start_date)} au {dateLabel(list.period.end_date)}. Copie indépendante du calendrier.</Text>}
      <View style={s.notice}><Text style={s.sectionTitle}>{list.totals.item_count} articles</Text>
        <Text style={s.body}>{list.totals.remaining_item_count} à acheter · {list.totals.purchased_item_count} achetés · {list.totals.owned_item_count} déjà disponibles</Text>
        <Text style={s.body}>{list.assignment && !list.assignment.stale
          ? `${list.totals.estimate_complete ? 'Estimation des achats' : 'Sous-total connu'} : ${list.totals.budget_known_amount.replace('.', ',')} $`
          : 'Estimation indisponible'}</Text></View>
      {list.assignment && <View style={s.notice}>
        <Text style={s.sectionTitle}>{list.assignment.stale ? 'Ancienne proposition à réévaluer' : 'Répartition enregistrée'}</Text>
        {list.assignment.scenario.store_totals.map(store => <Text key={`${store.retailer}:${store.store_id}`} style={s.body}>
          {store.retailer === 'superc' ? 'Super C' : store.retailer === 'maxi' ? 'Maxi' : 'Metro'}{store.store_id ? ` · ${store.store_id}` : ''} : {store.amount.replace('.', ',')} $
        </Text>)}
        {list.assignment.scenario.needs.map(need => <View key={need.item_ids.join(',')}>
          <Text style={s.body}>{need.name}{need.manual ? ' · choix manuel' : ''}</Text>
          {need.lines.map(line => <Text key={line.sale.product_id} style={s.note}>{line.sale.raw_source.name} · {line.quantity} {need.unit} · {line.amount.replace('.', ',')} $</Text>)}
          {!need.lines.length && <Text style={s.note}>{need.status === 'owned' ? 'Déjà disponible' : 'Achat ou prix à vérifier'}</Text>}
        </View>)}
      </View>}
      {editable && <ListComparison list={list} disabled={locked} onCommand={async (intent: ListCommand) => {
        const saved = await command.run(intent);
        if (!saved) return false;
        setList(saved); setError(''); return true;
      }} />}
      {list.warnings.filter(w => w.code !== 'ESTIMATE_UNAVAILABLE').map((w, i) => <Text key={i} style={s.requiredItem}>{w.message}</Text>)}
      <RecipeButton title="Renommer la liste" variant="neutral" disabled={locked} onPress={() => setListName(list.name)} />
      {listName !== null && <>
        <RecipeField label="Nouveau nom" value={listName} maxLength={120} editable={!locked} onChangeText={setListName} />
        <RecipeButton title="Enregistrer le nom" disabled={locked || !listName.trim()} onPress={() => void save(path, { expected_revision: list.revision, name: listName.trim() }, 'PATCH')} />
      </>}
      {editable ? <View style={[s.notice, { gap: 12 }]}>
        <Text style={s.sectionTitle}>{editing ? 'Modifier l’article' : 'Ajouter un article'}</Text>
        <RecipeField label="Article" value={name} maxLength={120} editable={!locked} onChangeText={setName} placeholder="Ex. Pain" />
        <RecipeField label="Quantité (facultative)" value={amount} editable={!locked} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="Ex. 2" />
        <RecipeUnitPicker value={unit} onChange={setUnit} ingredientLabel={name || 'Article'} disabled={locked} allowedUnits={editing ? allowedUnits : undefined} />
        <Text style={s.note}>Sans quantité, l’article reste à préciser. Les articles saisis librement restent sur des lignes distinctes. L’édition conserve le type d’unité du besoin.</Text>
        <RecipeButton title={editing ? 'Enregistrer l’article' : 'Ajouter à la liste'} disabled={locked || !name.trim()} onPress={submit} />
        {editing && <RecipeButton title="Annuler la modification" variant="neutral" disabled={command.busy || !!command.pending} onPress={() => { setEditing(null); setName(''); setAmount(''); setUnit(null); }} />}
      </View> : list.status === 'archived' ? <RecipeButton title="Rouvrir cette liste" disabled={command.locked || loading} onPress={() => void save(`${path}/reopen`, { expected_revision: list.revision })} /> : null}
      {!list.items.some(i => !i.removed) && <Text style={s.body}>Aucun article pour le moment. Ajoute ce dont tu as besoin.</Text>}
      {list.items.filter(i => !i.removed).map(item => <View key={item.id} style={[s.choice, { borderWidth: 1, borderColor: recipeColors.border }]}>
        <Text style={s.note}>{item.category}</Text><Text style={s.sectionTitle}>{item.name}</Text>
        <Text style={s.body}>{quantityLabel(item.required)}</Text>
        {item.contributions.filter(c => c.source === 'calendar').map(c => <Text key={c.id} style={s.note}>{c.recipe_name} · {c.meal_date ? dateLabel(c.meal_date) : ''} · {c.servings} portions</Text>)}
        {editable && <>
          {item.required.length <= 1 && <RecipeButton title={`Modifier ${item.name}`} variant="neutral" disabled={locked} onPress={() => edit(item)} />}
          <RecipeButton title={`Retirer ${item.name}`} variant="neutral" disabled={locked} onPress={() => {
            Alert.alert('Retirer cet article ?', item.name, [{ text: 'Annuler', style: 'cancel' }, { text: 'Retirer', onPress: () => void save(`${path}/items/${item.id}`, { expected_revision: list.revision, removed: true }, 'PATCH') }]);
          }} />
        </>}
      </View>)}
      {list.items.filter(i => i.removed).map(item => <View key={item.id} style={s.choice}>
        <Text style={s.body}>{item.name} · retiré</Text>
        <RecipeButton title={`Restaurer ${item.name}`} variant="neutral" disabled={locked} onPress={() => void save(`${path}/items/${item.id}`, { expected_revision: list.revision, removed: false }, 'PATCH')} />
      </View>)}
      {list.status === 'draft' && <RecipeButton title="Utiliser cette liste" disabled={locked} onPress={() => void save(`${path}/activate`, { expected_revision: list.revision })} />}
    </>}
  </RecipeScreen>;
}
