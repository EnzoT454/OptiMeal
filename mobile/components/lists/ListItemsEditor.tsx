import ListQuickAdd from './ListQuickAdd';
import { shoppingListKind } from '../../services/shoppingPresentation';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { RecipeButton, RecipeField, recipeColors, recipeStyles as s } from '../recipes';
import IngredientPicker from '../IngredientPicker';
import RecipeUnitPicker from '../RecipeUnitPicker';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { listCommand, listsPath, quantityLabel } from '../../services/shoppingLists';
import type { ListCommand } from '../../services/shoppingLists';
import { positiveAmount } from './courseQuantities';
import type { Ingredient, Page, RecipeUnit } from '../../types/api';
import type { ShoppingListRead } from '../../types/shoppingLists';

export default function ListItemsEditor({ list, disabled, onCommand, onDone }: {
  list: ShoppingListRead; disabled: boolean; onCommand: (intent: ListCommand) => Promise<boolean>; onDone: () => void;
}) {
  const { session } = useAuth();
  const user = session?.user.id;
  const identity = `${user}:${list.id}`;
  const context = useRef(identity); context.current = identity;
  const active = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const [name, setName] = useState(''), [amount, setAmount] = useState('');
  const [unit, setUnit] = useState<RecipeUnit | null>(null);
  const [ingredient, setIngredient] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<Ingredient[]>([]), [picker, setPicker] = useState(false);
  const [loading, setLoading] = useState(false), [error, setError] = useState('');
  const request = useRef(false);
  const locked = disabled || loading;
  const path = `${listsPath}/${list.id}`;
  async function pickIngredient() {
    if (!user || locked || request.current) return;
    request.current = true; setLoading(true); setError('');
    try {
      const page = await api<Page<Ingredient>>('/api/v1/ingredients?limit=100', {}, true, 15000, user);
      if (active.current && context.current === identity) { setCatalog(page.items); setPicker(true); }
    } catch (failure) { if (active.current && context.current === identity) setError(failure instanceof Error ? failure.message : 'Catalogue indisponible.'); }
    finally { request.current = false; if (active.current && context.current === identity) setLoading(false); }
  }
  async function add(merge: 'add' | 'separate' = 'add') {
    const quantity = amount.trim() ? { amount: positiveAmount(amount.trim())!, unit: unit! } : null;
    const saved = await onCommand(listCommand(`${path}/items`, { expected_revision: list.revision, name: name.trim(), quantity,
      ...(ingredient ? { ingredient_id: ingredient, merge } : {}) }));
    if (saved && active.current && context.current === identity) { setName(''); setAmount(''); setUnit(null); setIngredient(null); setError(''); }
  }
  function submit() {
    if (locked) return;
    if (!name.trim()) { setError('Indique le nom de l’article.'); return; }
    if (amount.trim() && (!positiveAmount(amount.trim()) || !unit)) { setError('Indique une quantité positive et son unité.'); return; }
    setError('');
    if (ingredient && list.items.some(item => !item.removed && item.ingredient_id === ingredient)) {
      Alert.alert('Ingrédient déjà présent', 'Additionner cette quantité au besoin existant ou garder un article distinct ?', [
        { text: 'Annuler', style: 'cancel' }, { text: 'Additionner au besoin', onPress: () => void add('add') },
        { text: 'Garder séparé', onPress: () => void add('separate') },
      ]);
    } else if (list.items.some(item => !item.removed && item.name.trim().toLocaleLowerCase('fr') === name.trim().toLocaleLowerCase('fr'))) {
      Alert.alert('Article déjà présent', 'Ajouter une ligne distincte ?', [
        { text: 'Annuler', style: 'cancel' }, { text: 'Ajouter séparément', onPress: () => void add('separate') },
      ]);
    } else void add();
  }
  return <View style={{ gap: 14 }}>
    <Text accessibilityRole="header" style={s.sectionTitle}>Modifier les articles</Text>
    <RecipeButton title="Terminer les modifications" variant="neutral" disabled={locked} onPress={() => {
      if (name.trim() || amount.trim()) Alert.alert('Fermer la modification ?', 'L’article en cours de saisie ne sera pas ajouté.', [
        { text: 'Continuer la saisie', style: 'cancel' }, { text: 'Fermer', onPress: onDone },
      ]); else onDone();
    }} />
    {shoppingListKind(list) === 'articles' ? <>
    <RecipeField label="Article" value={name} onChangeText={value => { setName(value); setIngredient(null); }} editable={!locked} maxLength={120} placeholder="Ex. Pain" />
    <RecipeButton title="Choisir dans le catalogue" variant="neutral" disabled={locked} onPress={() => void pickIngredient()} />
    <RecipeField label="Quantité (facultative)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" editable={!locked} />
    <RecipeUnitPicker value={unit} onChange={setUnit} ingredientLabel={name || 'Article'} disabled={locked} />
    <RecipeButton title="Ajouter à la liste" disabled={locked || !name.trim() || list.totals.item_count >= 500} onPress={submit} />
    {loading && <ActivityIndicator color={recipeColors.green} accessibilityLabel="Chargement des ingrédients" />}
    {!!error && <Text accessibilityRole="alert" style={s.requiredItem}>{error}</Text>}
    </> : shoppingListKind(list) === 'products' ? <ListQuickAdd list={list} disabled={locked} onCommand={onCommand} /> : <Text style={s.note}>Cette ancienne liste mixte est conservée. Utilise une nouvelle liste pour ajouter des éléments.</Text>}
    {list.items.filter(item => !item.removed).map(item => <View key={item.id} style={s.choice}>
      <Text style={s.sectionTitle}>{item.name}</Text>
      {!!item.required.length && <Text style={s.note}>{quantityLabel(item.required)}</Text>}
      <RecipeButton title={`Supprimer ${item.name}`} variant="neutral" disabled={locked} onPress={() => Alert.alert('Supprimer cet article ?', item.name, [
        { text: 'Annuler', style: 'cancel' }, { text: 'Supprimer', style: 'destructive', onPress: () => void onCommand(listCommand(`${path}/items/${item.id}`,
          { expected_revision: list.revision, removed: true }, 'PATCH')) },
      ])} />
    </View>)}
    {list.items.some(item => item.removed) && <Text style={s.sectionTitle}>Articles supprimés</Text>}
    {list.items.filter(item => item.removed).map(item => <RecipeButton key={item.id} title={`Restaurer ${item.name}`} variant="neutral"
      disabled={locked || list.totals.item_count >= 500} onPress={() => void onCommand(listCommand(`${path}/items/${item.id}`, { expected_revision: list.revision, removed: false }, 'PATCH'))} />)}
    <IngredientPicker visible={picker} ingredients={catalog} onClose={() => setPicker(false)} onSelect={id => {
      const item = catalog.find(value => value.id === id);
      if (item) { setName(item.name); setIngredient(item.id); }
      setPicker(false);
    }} />
  </View>;
}
