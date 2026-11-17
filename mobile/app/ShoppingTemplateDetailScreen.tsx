import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { randomUUID } from 'expo-crypto';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RecipeButton, RecipeField, RecipeScreen, RecipeTitle, recipeColors, recipeStyles as s } from '../components/recipes';
import IngredientPicker from '../components/IngredientPicker';
import RecipeUnitPicker from '../components/RecipeUnitPicker';
import { useListCommand } from '../components/lists/useListCommand';
import { positiveAmount } from '../components/lists/courseQuantities';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { fetchTemplate, templatesPath } from '../services/shoppingReuse';
import { listCommand, quantityLabel } from '../services/shoppingLists';
import type { Ingredient, Page, RecipeUnit } from '../types/api';
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
  const [panel, setPanel] = useState<'rename' | 'product' | null>(null);
  const [name, setName] = useState('');
  const [itemId, setItemId] = useState<string | null>(null);
  const [itemName, setItemName] = useState(''), [amount, setAmount] = useState('');
  const [unit, setUnit] = useState<RecipeUnit | null>(null);
  const [clearQuantities, setClearQuantities] = useState(false);
  const [ingredient, setIngredient] = useState<Ingredient | null>(null);
  const [catalog, setCatalog] = useState<Ingredient[]>([]), [picker, setPicker] = useState(false);
  const [loading, setLoading] = useState(false), [error, setError] = useState('');
  const command = useListCommand<ShoppingTemplateRead>(`template:${id}`);
  const isCurrent = (version: number) => focused.current && context.current === scope && generation.current === version;
  const locked = loading || command.locked;
  function adopt(value: ShoppingTemplateRead) {
    if (context.current !== scope || value.id !== id || value.revision < latest.current.revision) return;
    latest.current.revision = value.revision;
    setStored({ scope, value });
  }
  useFocusEffect(useCallback(() => {
    focused.current = true;
    const version = ++generation.current;
    setStored(null); setPanel(null); setMenu(false); setPicker(false); setLoading(!!user); setError('');
    if (user) void fetchTemplate(id, user).then(value => { if (isCurrent(version)) adopt(value); })
      .catch(failure => { if (isCurrent(version)) setError(failure instanceof Error ? failure.message : 'Modèle indisponible.'); })
      .finally(() => { if (isCurrent(version)) setLoading(false); });
    return () => { focused.current = false; generation.current++; setMenu(false); setPicker(false); };
  }, [scope]));
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => <Pressable accessibilityRole="button" accessibilityLabel="Options du modèle"
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
    catch (failure) { if (isCurrent(version)) setError(failure instanceof Error ? failure.message : 'Modèle indisponible.'); }
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
  function editProduct(item?: ShoppingTemplateItem) {
    setMenu(false); setPanel('product'); setError('');
    setItemId(item?.id ?? null); setItemName(item?.name ?? ''); setIngredient(null); setClearQuantities(false);
    setAmount(item?.required.length === 1 ? item.required[0].amount : '');
    setUnit(item?.required.length === 1 ? item.required[0].unit : null);
  }
  async function pickIngredient() {
    if (!user) return;
    const version = generation.current;
    setError('');
    try {
      const page = await api<Page<Ingredient>>('/api/v1/ingredients?limit=100', {}, true, 15000, user);
      if (isCurrent(version)) { setCatalog(page.items); setPicker(true); }
    } catch (failure) { if (isCurrent(version)) setError(failure instanceof Error ? failure.message : 'Ingrédients indisponibles.'); }
  }
  async function saveProduct() {
    if (!template || locked) return;
    if (!itemName.trim()) { setError('Indique le nom du produit.'); return; }
    const quantity = amount.trim() ? positiveAmount(amount) : null;
    if (amount.trim() && (!quantity || !unit || !['g', 'ml', 'unit'].includes(unit))) {
      setError('Indique une quantité positive et son unité.'); return;
    }
    const previous = template.items.find(item => item.id === itemId);
    const original = clearQuantities ? [] : previous?.required ?? [];
    const required = quantity && unit ? [...original.filter(q => q.unit !== unit), { amount: quantity, unit: unit as ShoppingBaseUnit }] : original;
    const item: ShoppingTemplateItem = { id: previous?.id ?? randomUUID(), name: itemName.trim(),
      ingredient_id: previous?.ingredient_id ?? ingredient?.id ?? null,
      category: previous?.category ?? ingredient?.category ?? 'Autres', required,
      preferred_product_id: previous?.preferred_product_id ?? null };
    await save({ items: previous ? template.items.map(current => current.id === item.id ? item : current) : [...template.items, item] });
  }
  return <RecipeScreen>
    <RecipeTitle>{template?.name ?? 'Mon modèle'}</RecipeTitle>
    {!!(error || command.error) && <>
      <Text accessibilityRole="alert" style={s.requiredItem}>{error || command.error}</Text>
      {!command.pending && <RecipeButton title="Actualiser le modèle" variant="neutral" disabled={command.busy || loading} onPress={() => {
        if (panel) Alert.alert('Actualiser le modèle ?', 'La saisie non enregistrée sera remplacée.', [
          { text: 'Annuler', style: 'cancel' }, { text: 'Actualiser', onPress: () => void reload() },
        ]); else void reload();
      }} />}
    </>}
    {loading && <ActivityIndicator accessibilityLabel="Chargement du modèle" color={recipeColors.green} />}
    {command.pending && <RecipeButton title="Reprendre l’enregistrement" disabled={command.busy} onPress={() => void save()} />}
    {template && <>
      {panel === 'rename' ? <>
        <RecipeField label="Nom du modèle" value={name} onChangeText={setName} editable={!locked} maxLength={120} autoFocus />
        <RecipeButton title="Enregistrer le nom" disabled={locked || !name.trim()} onPress={() => void save({ name: name.trim() })} />
        <RecipeButton title="Annuler" variant="neutral" disabled={command.busy || !!command.pending} onPress={() => { setPanel(null); setError(''); }} />
      </> : panel === 'product' ? <>
        <Text style={s.sectionTitle}>{itemId ? 'Modifier le produit' : 'Ajouter un produit'}</Text>
        <RecipeField label="Produit" value={itemName} onChangeText={value => { setItemName(value); if (!itemId) setIngredient(null); }} editable={!locked} maxLength={120} autoFocus />
        {!itemId && <RecipeButton title="Choisir dans le catalogue" variant="neutral" disabled={locked} onPress={() => void pickIngredient()} />}
        <RecipeField label="Quantité (facultative)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" editable={!locked} />
        <RecipeUnitPicker value={unit} onChange={setUnit} ingredientLabel={itemName || 'Produit'} disabled={locked} allowedUnits={['g', 'ml', 'unit']} />
        {itemId && !clearQuantities && template.items.find(item => item.id === itemId)?.required.length !== 0 && <RecipeButton title="Retirer les quantités" variant="neutral" disabled={locked}
          onPress={() => { setClearQuantities(true); setAmount(''); setUnit(null); }} />}
        <RecipeButton title={itemId ? 'Enregistrer le produit' : 'Ajouter au modèle'} disabled={locked || !itemName.trim() || !itemId && template.items.length >= 500} onPress={() => void saveProduct()} />
        {itemId && <RecipeButton title="Retirer ce produit" variant="neutral" disabled={locked} onPress={() => Alert.alert('Retirer ce produit du modèle ?', itemName, [
          { text: 'Annuler', style: 'cancel' }, { text: 'Retirer', style: 'destructive', onPress: () => void save({ items: template.items.filter(item => item.id !== itemId) }) },
        ])} />}
        <RecipeButton title="Annuler" variant="neutral" disabled={command.busy || !!command.pending} onPress={() => { setPanel(null); setError(''); }} />
      </> : <>
        {!template.items.length && <Text style={s.body}>Aucun produit enregistré.</Text>}
        {template.items.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Modifier ${item.name}`} disabled={locked}
          onPress={() => editProduct(item)} style={[s.choice, { minHeight: 64 }]}>
          <Text style={s.sectionTitle}>{item.name}</Text>
          {!!item.required.length && <Text style={s.note}>{quantityLabel(item.required)}</Text>}
        </Pressable>)}
      </>}
    </>}
    {menu && <Modal visible transparent animationType="fade" onRequestClose={() => setMenu(false)}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#0007' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Fermer les options" onPress={() => setMenu(false)} style={{ flex: 1, minHeight: 48 }} />
        <SafeAreaView accessibilityViewIsModal edges={['bottom', 'left', 'right']} style={{ backgroundColor: recipeColors.background, padding: 20, gap: 12, borderTopLeftRadius: 22, borderTopRightRadius: 22 }}>
          <Text accessibilityRole="header" style={s.sectionTitle}>Options du modèle</Text>
          <RecipeButton title="Modifier le nom" variant="neutral" disabled={locked} onPress={() => { setMenu(false); setName(template?.name ?? ''); setPanel('rename'); setError(''); }} />
          <RecipeButton title="Supprimer le modèle" variant="neutral" disabled={locked} onPress={() => {
            setMenu(false);
            Alert.alert('Supprimer ce modèle ?', 'Les listes existantes seront conservées.', [
              { text: 'Annuler', style: 'cancel' }, { text: 'Supprimer', style: 'destructive', onPress: () => void save(undefined, true) },
            ]);
          }} />
          <RecipeButton title="Ajouter un produit" variant="neutral" disabled={locked || (template?.items.length ?? 0) >= 500} onPress={() => editProduct()} />
          <RecipeButton title="Fermer" variant="neutral" onPress={() => setMenu(false)} />
        </SafeAreaView>
      </View>
    </Modal>}
    <IngredientPicker visible={picker} ingredients={catalog} onClose={() => setPicker(false)} onSelect={ingredientId => {
      const chosen = catalog.find(item => item.id === ingredientId);
      if (chosen) { setIngredient(chosen); setItemName(chosen.name); }
      setPicker(false);
    }} />
  </RecipeScreen>;
}
