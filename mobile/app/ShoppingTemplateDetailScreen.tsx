import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { randomUUID } from 'expo-crypto';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RecipeButton, RecipeField, RecipeScreen, RecipeTitle, recipeStyles as s } from '../components/recipes';
import IngredientPicker from '../components/IngredientPicker';
import RecipeUnitPicker from '../components/RecipeUnitPicker';
import { ListDateField } from '../components/lists/ListDateField';
import { useListCommand } from '../components/lists/useListCommand';
import { positiveAmount } from '../components/lists/courseQuantities';
import { api } from '../services/api';
import { fetchTemplate, templatesPath, templateIcons } from '../services/shoppingReuse';
import { listCommand, localDate, quantityLabel } from '../services/shoppingLists';
import type { Ingredient, Page, RecipeUnit } from '../types/api';
import type { ShoppingBaseUnit, ShoppingListRead, ShoppingTemplateIcon, ShoppingTemplateItem, ShoppingTemplateRead } from '../types/shoppingLists';
import type { ListStackParams } from '../types/navigation';

export default function ShoppingTemplateDetailScreen({ route, navigation }: NativeStackScreenProps<ListStackParams, 'TemplateDetail'>) {
  const { id } = route.params;
  const focused = useRef(false);
  const latest = useRef({ id, revision: 0 });
  if (latest.current.id !== id) latest.current = { id, revision: 0 };
  const [template, setTemplate] = useState<ShoppingTemplateRead | null>(null);
  const [name, setName] = useState(''); const [icon, setIcon] = useState<ShoppingTemplateIcon>('basket');
  const [items, setItems] = useState<ShoppingTemplateItem[]>([]);
  const [editing, setEditing] = useState(false);
  const [itemId, setItemId] = useState<string | null>(null);
  const [itemName, setItemName] = useState(''); const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState<RecipeUnit | null>(null);
  const [ingredient, setIngredient] = useState<Ingredient | null>(null);
  const [catalog, setCatalog] = useState<Ingredient[]>([]); const [picker, setPicker] = useState(false);
  const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(localDate); const [listName, setListName] = useState('');
  const [choices, setChoices] = useState(false);
  const command = useListCommand<ShoppingTemplateRead>(`template:${id}`);
  const instance = useListCommand<ShoppingListRead>(`instantiate:${id}`);
  function adopt(value: ShoppingTemplateRead) { if (value.id !== id || value.revision < latest.current.revision) return; latest.current.revision = value.revision; setTemplate(value); setName(value.name); setIcon(value.icon); setItems(value.items); setListName(value.name); }
  async function load() {
    setLoading(true); setError('');
    try { const value = await fetchTemplate(id); if (focused.current) { adopt(value); setEditing(false); } }
    catch (e) { setError(e instanceof Error ? e.message : 'Modèle indisponible.'); }
    finally { setLoading(false); }
  }
  useFocusEffect(useCallback(() => {
    let active = true; focused.current = true; setLoading(true);
    fetchTemplate(id).then(value => { if (active) adopt(value); })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Modèle indisponible.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; focused.current = false; };
  }, [id]));
  const locked = loading || command.locked || instance.locked;
  async function save(remove = false) {
    const intent = command.pending ?? (template ? listCommand(`${templatesPath}/${id}`,
      remove ? { expected_revision: template.revision } : { expected_revision: template.revision, name: name.trim(), icon, items }, remove ? 'DELETE' : 'PATCH') : null);
    if (!intent) return;
    const result = await command.run(intent);
    if (!focused.current) return;
    if (result?.deleted) navigation.goBack();
    else if (result) { adopt(result); setEditing(false); setError(''); }
  }
  async function create() {
    const intent = instance.pending ?? (template ? listCommand(`${templatesPath}/${id}/instantiate`, {
      expected_template_revision: template.revision, name: listName.trim(), purchase_date: purchaseDate, include_choices: choices,
    }) : null);
    if (!intent) return;
    const result = await instance.run(intent);
    if (result && focused.current) navigation.navigate('ShoppingDetail', { id: result.id });
  }
  async function pickIngredient() {
    setError('');
    try { const page = await api<Page<Ingredient>>('/api/v1/ingredients?limit=100'); if (focused.current) { setCatalog(page.items); setPicker(true); } }
    catch (e) { setError(e instanceof Error ? e.message : 'Ingrédients indisponibles.'); }
  }
  function addItem() {
    if (!itemName.trim()) { setError('Indique le nom de l’article.'); return; }
    const quantity = amount.trim() ? positiveAmount(amount) : null;
    if (amount.trim() && (!quantity || !unit || !['g', 'ml', 'unit'].includes(unit))) { setError('Indique une quantité positive et son unité.'); return; }
    const previous = items.find(item => item.id === itemId);
    const required = quantity && unit ? [...(previous?.required.filter(q => q.unit !== unit) ?? []), { amount: quantity, unit: unit as ShoppingBaseUnit }] : previous?.required ?? [];
    const next: ShoppingTemplateItem = { id: itemId ?? randomUUID(), name: itemName.trim(), ingredient_id: previous?.ingredient_id ?? ingredient?.id ?? null,
      category: previous?.category ?? ingredient?.category ?? 'Autres', required, preferred_product_id: previous?.preferred_product_id ?? null };
    setItems(current => itemId ? current.map(item => item.id === itemId ? next : item) : [...current, next]);
    setItemId(null); setItemName(''); setAmount(''); setUnit(null); setIngredient(null); setError('');
  }
  return <RecipeScreen><RecipeTitle>{template ? `${templateIcons[template.icon]} ${template.name}` : 'Mon modèle'}</RecipeTitle>
    <Text style={s.body}>Ce modèle ne contient ni achats ni possession ni prix. Le modifier ne change aucune liste déjà créée. Les exclusions ne retirent pas automatiquement ses articles.</Text>
    {!!(error || command.error || instance.error) && <Text accessibilityRole="alert" style={s.requiredItem}>{error || command.error || instance.error}</Text>}
    {loading && <ActivityIndicator accessibilityLabel="Chargement du modèle" />}
    <RecipeButton title="Actualiser le modèle" variant="neutral" disabled={loading || command.busy || instance.busy} onPress={() => {
      if (editing) Alert.alert('Recharger le modèle ?', 'Les modifications non enregistrées de cet écran seront remplacées.', [{ text: 'Annuler', style: 'cancel' }, { text: 'Actualiser', onPress: () => void load() }]);
      else void load();
    }} />
    {command.pending && <RecipeButton title="Reprendre le modèle" disabled={command.busy} onPress={() => void save()} />}
    {instance.pending && <RecipeButton title="Reprendre la création" disabled={instance.busy} onPress={() => void create()} />}
    {template && <>
      <Text style={s.note}>Révision {template.revision} · {template.items.length} articles</Text>
      {!editing ? <>
        {template.items.map(item => <View key={item.id} style={s.choice}><Text style={s.sectionTitle}>{item.name}</Text><Text style={s.body}>{quantityLabel(item.required)}</Text>
          {item.preferred_product_id && <Text style={s.note}>Choix de produit conservé ; à vérifier à la prochaine comparaison.</Text>}</View>)}
        <RecipeField label="Nom de la nouvelle liste" value={listName} onChangeText={setListName} editable={!locked} maxLength={120} />
        <ListDateField label="Date prévue des courses" value={purchaseDate} onChange={setPurchaseDate} disabled={locked} />
        {template.items.some(item => item.preferred_product_id) && <Pressable accessibilityRole="checkbox" disabled={locked} accessibilityState={{ checked: choices, disabled: locked }} onPress={() => setChoices(!choices)} style={s.notice}>
          <Text style={s.body}>{choices ? '☑' : '☐'} Reprendre les choix de produits, à vérifier avant les courses</Text>
        </Pressable>}
        <RecipeButton title="Créer une liste depuis ce modèle" disabled={locked || !listName.trim()} onPress={() => void create()} />
        <RecipeButton title="Modifier le modèle" variant="neutral" disabled={locked} onPress={() => setEditing(true)} />
        <RecipeButton title="Supprimer le modèle" variant="neutral" disabled={locked} onPress={() => Alert.alert('Supprimer ce modèle ?', 'Les listes et leurs révisions seront conservées.', [
          { text: 'Annuler', style: 'cancel' }, { text: 'Supprimer', style: 'destructive', onPress: () => void save(true) },
        ])} />
      </> : <>
        <RecipeField label="Nom du modèle" value={name} onChangeText={setName} editable={!locked} maxLength={120} />
        <View style={s.chips}>{(Object.keys(templateIcons) as ShoppingTemplateIcon[]).map(value => <RecipeButton key={value} title={value === 'basket' ? 'Panier' : value === 'cart' ? 'Chariot' : value === 'leaf' ? 'Feuille' : value === 'home' ? 'Maison' : 'Repas'}
          variant={icon === value ? 'primary' : 'neutral'} accessibilityState={{ selected: icon === value }} disabled={locked} onPress={() => setIcon(value)} />)}</View>
        {items.map(item => <View key={item.id} style={s.choice}><Text style={s.sectionTitle}>{item.name}</Text><Text style={s.body}>{quantityLabel(item.required)}</Text>
          <RecipeButton title={`Modifier ${item.name}`} variant="neutral" disabled={locked} onPress={() => { setItemId(item.id); setItemName(item.name); setIngredient(null); setAmount(item.required.length === 1 ? item.required[0].amount : ''); setUnit(item.required.length === 1 ? item.required[0].unit : null); }} />
          {item.required.length > 0 && <RecipeButton title={`Retirer les quantités de ${item.name}`} variant="neutral" disabled={locked} onPress={() => setItems(current => current.map(i => i.id === item.id ? { ...i, required: [] } : i))} />}
          {item.preferred_product_id && <RecipeButton title={`Retirer le choix de produit de ${item.name}`} variant="neutral" disabled={locked} onPress={() => setItems(current => current.map(i => i.id === item.id ? { ...i, preferred_product_id: null } : i))} />}
          <RecipeButton title={`Retirer ${item.name} du modèle`} variant="neutral" disabled={locked} onPress={() => setItems(current => current.filter(i => i.id !== item.id))} />
        </View>)}
        <Text style={s.sectionTitle}>{itemId ? 'Modifier le besoin du modèle' : 'Ajouter au modèle'}</Text>
        <RecipeField label="Article du modèle" value={itemName} onChangeText={v => { setItemName(v); if (!itemId) setIngredient(null); }} editable={!locked} maxLength={120} />
        {!itemId && <RecipeButton title="Choisir un ingrédient du catalogue" variant="neutral" disabled={locked} onPress={() => void pickIngredient()} />}
        <RecipeField label="Quantité du modèle (facultative)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" editable={!locked} />
        <RecipeUnitPicker value={unit} onChange={setUnit} ingredientLabel={itemName || 'Article'} disabled={locked} allowedUnits={['g', 'ml', 'unit']} />
        <Text style={s.note}>Une quantité renseignée remplace cette dimension et conserve les autres. Pour tout effacer, utilise « Retirer les quantités ».</Text>
        <RecipeButton title={itemId ? 'Valider le besoin modifié' : 'Ajouter le besoin au modèle'} disabled={locked || !itemName.trim() || items.length >= 500 && !itemId} onPress={addItem} />
        {(itemId || itemName.trim()) && <RecipeButton title="Annuler la saisie de l’article" variant="neutral" disabled={locked} onPress={() => { setItemId(null); setItemName(''); setAmount(''); setUnit(null); setIngredient(null); }} />}
        <RecipeButton title="Enregistrer les modifications du modèle" disabled={locked || !name.trim() || !!itemId || !!itemName.trim()} onPress={() => void save()} />
        <RecipeButton title="Annuler les modifications du modèle" variant="neutral" disabled={command.busy || !!command.pending} onPress={() => { adopt(template); setEditing(false); setItemId(null); setItemName(''); }} />
      </>}
    </>}
    <IngredientPicker visible={picker} ingredients={catalog} onClose={() => setPicker(false)} onSelect={ingredientId => { const chosen = catalog.find(i => i.id === ingredientId); if (chosen) { setIngredient(chosen); setItemName(chosen.name); } setPicker(false); }} />
  </RecipeScreen>;
}
