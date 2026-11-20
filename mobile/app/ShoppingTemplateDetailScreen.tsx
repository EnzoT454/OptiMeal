import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RecipeButton, RecipeField, RecipeScreen, RecipeTitle, recipeColors, recipeStyles as s } from '../components/recipes';
import ListQuickAdd from '../components/lists/ListQuickAdd';
import RecipeUnitPicker from '../components/RecipeUnitPicker';
import { useListCommand } from '../components/lists/useListCommand';
import { positiveAmount } from '../components/lists/courseQuantities';
import { useAuth } from '../context/AuthContext';
import { shoppingListStack } from '../services/shoppingNavigation';
import { fetchTemplate, templatesPath } from '../services/shoppingReuse';
import { listCommand, localDate, quantityLabel, type ListCommand } from '../services/shoppingLists';
import type { RecipeUnit } from '../types/api';
import type { ShoppingBaseUnit, ShoppingTemplateItem, ShoppingTemplateRead } from '../types/shoppingLists';
import type { ListStackParams } from '../types/navigation';

export default function ShoppingTemplateDetailScreen({ route, navigation }: NativeStackScreenProps<ListStackParams, 'TemplateDetail'>) {
  const { id } = route.params;
  const { session } = useAuth();
  const user = session?.user.id;
  const context = useRef({ id, user });
  if (context.current.id !== id || context.current.user !== user) context.current = { id, user };
  const scope = context.current;
  const focused = useRef(false), generation = useRef(0);
  const latest = useRef({ scope, revision: 0 });
  if (latest.current.scope !== scope) latest.current = { scope, revision: 0 };
  const [stored, setStored] = useState<{ scope: object; value: ShoppingTemplateRead } | null>(null);
  const template = stored?.scope === scope ? stored.value : null;
  const [menu, setMenu] = useState(false);
  const [panel, setPanel] = useState<'rename' | 'article' | 'add' | 'delete' | null>(null);
  const [name, setName] = useState('');
  const [itemId, setItemId] = useState<string | null>(null);
  const [itemName, setItemName] = useState(''), [amount, setAmount] = useState('');
  const [unit, setUnit] = useState<RecipeUnit | null>(null);
  const [clearQuantities, setClearQuantities] = useState(false);
  const [loading, setLoading] = useState(false), [error, setError] = useState('');
  const command = useListCommand<ShoppingTemplateRead>(`template:${id}`);
  const creation = useListCommand(`template-create:${id}`);
  const isCurrent = (version: number) => focused.current && context.current === scope && generation.current === version;
  const locked = loading || command.locked || creation.locked;
  function adopt(value: ShoppingTemplateRead) {
    if (context.current !== scope || value.id !== id || value.revision < latest.current.revision) return;
    latest.current.revision = value.revision;
    setStored({ scope, value });
  }
  useFocusEffect(useCallback(() => {
    focused.current = true;
    const version = ++generation.current;
    setStored(null); setPanel(null); setMenu(false); setLoading(!!user); setError('');
    if (user) void fetchTemplate(id, user).then(value => { if (isCurrent(version)) adopt(value); })
      .catch(failure => { if (isCurrent(version)) setError(failure instanceof Error ? failure.message : 'Liste sauvegardée indisponible.'); })
      .finally(() => { if (isCurrent(version)) setLoading(false); });
    return () => { focused.current = false; generation.current++; setMenu(false); };
  }, [scope]));
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => <Pressable accessibilityRole="button" accessibilityLabel="Options de la liste sauvegardée"
        accessibilityState={{ expanded: menu, disabled: locked || !template || panel !== null }}
        disabled={locked || !template || panel !== null} onPress={() => setMenu(true)}
        style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}>
        <MaterialCommunityIcons name="dots-horizontal" size={26} color={recipeColors.green} accessible={false} />
      </Pressable>,
    });
  }, [navigation, locked, template, panel, menu]);
  async function reload() {
    if (!user) return;
    const version = generation.current;
    setLoading(true); setError('');
    try { const value = await fetchTemplate(id, user); if (isCurrent(version)) { adopt(value); setPanel(null); } }
    catch (failure) { if (isCurrent(version)) setError(failure instanceof Error ? failure.message : 'Liste sauvegardée indisponible.'); }
    finally { if (isCurrent(version)) setLoading(false); }
  }
  async function save(changes?: { name?: string; items?: ShoppingTemplateItem[] }, remove = false) {
    const intent = command.pending ?? (template && (changes || remove) ? listCommand(`${templatesPath}/${id}`,
      { expected_revision: template.revision, ...(!remove ? changes : {}) }, remove ? 'DELETE' : 'PATCH') : null);
    if (!intent) return;
    const version = generation.current;
    const result = await command.run(intent);
    if (!isCurrent(version)) return;
    if (result?.deleted) navigation.goBack();
    else if (result) { adopt(result); setPanel(null); setError(''); }
  }
  function editArticle(item?: ShoppingTemplateItem) {
    setMenu(false); setPanel('article'); setError('');
    setItemId(item?.id ?? null); setItemName(item?.name ?? ''); setClearQuantities(false);
    setAmount(item?.required.length === 1 ? item.required[0].amount : '');
    setUnit(item?.required.length === 1 ? item.required[0].unit : null);
  }
  async function addArticle(intent: ListCommand) {
    const version = generation.current;
    const result = await command.run(intent);
    if (!result || !isCurrent(version)) return false;
    adopt(result); setError(''); return true;
  }
  async function saveArticle() {
    if (!template || locked) return;
    if (!itemName.trim()) { setError('Indique le nom de l’article.'); return; }
    const quantity = amount.trim() ? positiveAmount(amount) : null;
    if (amount.trim() && (!quantity || !unit || !['g', 'ml', 'unit'].includes(unit))) {
      setError('Indique une quantité positive et son unité.'); return;
    }
    const previous = template.items.find(item => item.id === itemId);
    if (!previous) { setError('Article introuvable. Actualise la liste sauvegardée.'); return; }
    const original = clearQuantities ? [] : previous.required;
    const required = quantity && unit ? [...original.filter(q => q.unit !== unit), { amount: quantity, unit: unit as ShoppingBaseUnit }] : original;
    const item: ShoppingTemplateItem = { id: previous.id, name: itemName.trim(),
      ingredient_id: previous.ingredient_id,
      category: previous.category, required,
      preferred_product_id: null };
    await save({ items: template.items.map(current => current.id === item.id ? item : current) });
  }
  return <RecipeScreen>
    <RecipeTitle>{template?.name ?? 'Ma liste sauvegardée'}</RecipeTitle>
    {!!(error || command.error) && <>
      <Text accessibilityRole="alert" style={s.requiredItem}>{error || command.error}</Text>
      {!command.pending && <RecipeButton title="Actualiser la liste sauvegardée" variant="neutral" disabled={command.busy || loading} onPress={() => {
        if (panel && panel !== 'delete') Alert.alert('Actualiser la liste sauvegardée ?', 'La saisie non enregistrée sera remplacée.', [
          { text: 'Annuler', style: 'cancel' }, { text: 'Actualiser', onPress: () => void reload() },
        ]); else void reload();
      }} />}
    </>}
    {loading && <ActivityIndicator accessibilityLabel="Chargement de la liste sauvegardée" color={recipeColors.green} />}
    {command.pending && <RecipeButton title="Reprendre l’enregistrement" disabled={command.busy} onPress={() => void save()} />}
    {!!creation.error && <Text accessibilityRole="alert" style={s.requiredItem}>{creation.error}</Text>}
    {template && panel === null && <RecipeButton title={creation.pending ? 'Reprendre la création' : 'Utiliser cette liste'}
      disabled={creation.busy || !creation.ready || command.locked || loading} onPress={() => {
        const version = generation.current;
        void creation.run(creation.pending ?? listCommand(`${templatesPath}/${id}/instantiate`, {
          expected_template_revision: template.revision, name: template.name, purchase_date: localDate(), include_choices: false, activate: true,
        })).then(result => { if (result && isCurrent(version)) navigation.reset(shoppingListStack(result.id)); });
      }} />}
    {template && <>
      {panel === 'add' ? <>
        <Text style={s.sectionTitle}>Ajouter un article</Text>
        <ListQuickAdd template={template} disabled={locked || template.items.length >= 500} onCommand={addArticle}
          autoFocus onDone={() => setPanel(null)} />
        <RecipeButton title="Retour à la liste sauvegardée" variant="neutral" disabled={command.busy || !!command.pending} onPress={() => setPanel(null)} />
      </> : panel === 'delete' ? <View style={s.notice}>
        <Text accessibilityRole="header" style={s.sectionTitle}>Supprimer cette liste sauvegardée ?</Text>
        <Text style={s.body}>« {template.name} » sera retirée de Mes listes. Les listes de courses déjà créées et leurs achats seront conservés.</Text>
        <RecipeButton title="Supprimer la liste sauvegardée" style={{ backgroundColor: recipeColors.warning }} disabled={locked} onPress={() => void save(undefined, true)} />
        <RecipeButton title="Annuler" variant="neutral" disabled={command.busy || !!command.pending} onPress={() => { setPanel(null); setError(''); }} />
      </View> : panel === 'rename' ? <>
        <RecipeField label="Nom de la liste sauvegardée" value={name} onChangeText={setName} editable={!locked} maxLength={120} autoFocus />
        <RecipeButton title="Enregistrer le nom" disabled={locked || !name.trim()} onPress={() => void save({ name: name.trim() })} />
        <RecipeButton title="Annuler" variant="neutral" disabled={command.busy || !!command.pending} onPress={() => { setPanel(null); setError(''); }} />
      </> : panel === 'article' ? <>
        <Text style={s.sectionTitle}>Modifier l’article</Text>
        <RecipeField label="Article" value={itemName} onChangeText={setItemName} editable={!locked} maxLength={120} autoFocus />

        <RecipeField label="Quantité (facultative)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" editable={!locked} />
        <RecipeUnitPicker value={unit} onChange={setUnit} ingredientLabel={itemName || 'Article'} disabled={locked} allowedUnits={['g', 'ml', 'unit']} />
        {itemId && !clearQuantities && template.items.find(item => item.id === itemId)?.required.length !== 0 && <RecipeButton title="Retirer les quantités" variant="neutral" disabled={locked}
          onPress={() => { setClearQuantities(true); setAmount(''); setUnit(null); }} />}
        <RecipeButton title="Enregistrer l’article" disabled={locked || !itemName.trim() || !itemId && template.items.length >= 500} onPress={() => void saveArticle()} />
        {itemId && <RecipeButton title="Retirer cet article" variant="neutral" disabled={locked} onPress={() => Alert.alert('Retirer cet article de la liste sauvegardée ?', itemName, [
          { text: 'Annuler', style: 'cancel' }, { text: 'Retirer', style: 'destructive', onPress: () => void save({ items: template.items.filter(item => item.id !== itemId) }) },
        ])} />}
        <RecipeButton title="Annuler" variant="neutral" disabled={command.busy || !!command.pending} onPress={() => { setPanel(null); setError(''); }} />
      </> : <>
        {!template.items.length && <Text style={s.body}>Aucun article enregistré.</Text>}
        {template.items.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Modifier ${item.name}`} disabled={locked}
          onPress={() => editArticle(item)} style={[s.choice, { minHeight: 64 }]}>
          <Text style={s.sectionTitle}>{item.name}</Text>
          {!!item.required.length && <Text style={s.note}>{quantityLabel(item.required)}</Text>}
        </Pressable>)}
      </>}
    </>}
    {menu && <Modal visible transparent animationType="fade" onRequestClose={() => setMenu(false)}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#0007' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Fermer les options" onPress={() => setMenu(false)} style={{ flex: 1, minHeight: 48 }} />
        <SafeAreaView accessibilityViewIsModal edges={['bottom', 'left', 'right']} style={{ backgroundColor: recipeColors.background, padding: 20, gap: 12, borderTopLeftRadius: 22, borderTopRightRadius: 22 }}>
          <Text accessibilityRole="header" style={s.sectionTitle}>Options de la liste sauvegardée</Text>
          <RecipeButton title="Modifier le nom" variant="neutral" disabled={locked} onPress={() => { setMenu(false); setName(template?.name ?? ''); setPanel('rename'); setError(''); }} />
          <RecipeButton title="Supprimer la liste sauvegardée" variant="neutral" disabled={locked} onPress={() => {
            setMenu(false); setPanel('delete'); setError('');
          }} />
          <RecipeButton title="Ajouter un article" variant="neutral" disabled={locked || (template?.items.length ?? 0) >= 500} onPress={() => { setMenu(false); setPanel('add'); setError(''); }} />
          <RecipeButton title="Fermer" variant="neutral" onPress={() => setMenu(false)} />
        </SafeAreaView>
      </View>
    </Modal>}
  </RecipeScreen>;
}
