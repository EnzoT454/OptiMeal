import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RecipeButton, RecipeField, recipeColors as c, recipeStyles as s } from '../recipes';
import { dateLabel, listCommand, listsPath, quantityLabel } from '../../services/shoppingLists';
import type { ListCommand } from '../../services/shoppingLists';
import type { ShoppingCoverage, ShoppingItemRead, ShoppingListRead } from '../../types/shoppingLists';
import { coverageLabels, positiveAmount, purchasedQuantities, remainingQuantities } from './courseQuantities';
import ProductPurchase, { pendingProductRows } from './ProductPurchase';
import RecipeUnitPicker from '../RecipeUnitPicker';
import type { RecipeUnit } from '../../types/api';
import ListExclusionAction from './ListExclusionAction';
import ListComparison from './ListComparison';

export default function ListArticleSheet({ list, item, disabled, onClose, onCommand, commandError = '', purchasesOnly = false, pendingCommands = [] }: {
  commandError?: string; purchasesOnly?: boolean; pendingCommands?: ListCommand[]; list: ShoppingListRead; item: ShoppingItemRead; disabled: boolean; onClose: () => void;
  onCommand: (command: ListCommand) => Promise<boolean>;
}) {
  const [mode, setMode] = useState<'owned' | 'purchase' | 'need' | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newUnit, setNewUnit] = useState<RecipeUnit | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [itemName, setItemName] = useState(item.name);
  const rows = pendingProductRows(list, pendingCommands).filter(r => r.itemIds.includes(item.id));
  const path = `${listsPath}/${list.id}/items/${item.id}`;
  const editable = list.status === 'draft' || list.status === 'active';
  const purchaseLocked = disabled || !editable;
  const locked = purchaseLocked || purchasesOnly;
  const bought = list.purchases.find(p => p.item_id === item.id);
  function begin(next: 'owned' | 'purchase' | 'need') {
    setMode(next); setError('');
    const quantities = next === 'owned' ? item.owned : next === 'need' ? item.required : bought?.coverage ?? [];
    setValues(Object.fromEntries(quantities.map(q => [q.unit, q.amount])));
  }
  async function coverage(kind: 'owned' | 'purchase', clear = false, full = false) {
    const quantities = item.required.map(q => ({ unit: q.unit,
      amount: full ? q.amount : positiveAmount(values[q.unit] ?? '') }));
    if (!clear && !full && item.required.length && quantities.some(q => values[q.unit]?.trim() && !q.amount)) {
      setError('Indique des quantités positives, ou laisse vides les dimensions non couvertes.'); return;
    }
    const coverage: ShoppingCoverage = clear ? {} : item.required.length
      ? { quantities: quantities.filter((q): q is { unit: typeof q.unit; amount: string } => !!q.amount) }
      : { confirms_unquantified: true };
    const intent = kind === 'owned' ? { coverage } : { purchased: !!coverage.quantities?.length || coverage.confirms_unquantified === true, coverage };
    if (await onCommand(listCommand(`${path}/${kind === 'owned' ? 'possession' : 'manual-purchase'}`,
      { expected_revision: list.revision, ...intent }, 'PUT'))) { setMode(null); setError(''); }
  }
  return <Modal visible transparent animationType="slide" onRequestClose={onClose}>
    <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#0007' }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Fermer la fiche" onPress={onClose} style={{ minHeight: 24, flex: 1 }} />
      <SafeAreaView edges={['bottom', 'left', 'right']} style={{ maxHeight: '92%', backgroundColor: c.background, borderTopLeftRadius: 22, borderTopRightRadius: 22 }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 16 }} accessibilityViewIsModal>
          <Text accessibilityRole="header" style={s.title}>{item.name}</Text>
          <RecipeButton title="Fermer la fiche" variant="neutral" onPress={onClose} />
          <Text style={s.sectionTitle}>{coverageLabels[item.coverage_status]}</Text>
          <Text style={s.body}>Besoin : {quantityLabel(item.required)}</Text>
          <Text style={s.body}>Déjà disponible : {item.owned.length ? quantityLabel(item.owned) : item.owned_unquantified_need_revision === item.need_revision ? 'Confirmé pour ce besoin sans quantité' : 'Rien de déclaré'}</Text>
          <Text style={s.body}>Acheté : {purchasedQuantities(list, item.id).length ? quantityLabel(purchasedQuantities(list, item.id)) : bought?.confirmed_need_revision === item.need_revision ? 'Confirmé sans quantité' : 'Rien de déclaré'}</Text>
          {remainingQuantities(list, item).length > 0 && <Text style={s.requiredItem}>Complément à acheter : {quantityLabel(remainingQuantities(list, item))}</Text>}
          {list.warnings.filter(w => w.item_id === item.id).map((w, i) => <Text key={i} style={s.requiredItem}>{w.message}</Text>)}
          {item.contributions.filter(c => c.source === 'calendar').map(c => <Text key={c.id} style={s.note}>Pour : {c.recipe_name} · {c.meal_date ? dateLabel(c.meal_date) : ''} · {c.servings} portions</Text>)}
          {rows.map(row => <ProductPurchase key={`${row.comparisonId}:${row.line.sale.product_id}:${row.purchasedUnits}`} list={list} row={row} detailed disabled={purchaseLocked} onCommand={onCommand} />)}
          {!rows.length && <Text style={s.note}>Produit et prix inconnus. Un achat déclaré reste possible sans inventer de prix.</Text>}
          {!!commandError && <Text accessibilityRole="alert" style={s.requiredItem}>{commandError} Ferme la fiche pour actualiser la liste ou reprendre l’enregistrement si nécessaire.</Text>}
          {!!error && <Text style={s.requiredItem}>{error}</Text>}
          {editable && <>
            <RecipeButton title="Modifier le besoin" variant="neutral" disabled={locked} onPress={() => begin('need')} />
            <RecipeButton title="J’en ai déjà" variant="neutral" disabled={locked} onPress={() => begin('owned')} />
            {(item.owned.length > 0 || item.owned_unquantified_need_revision !== null) && <RecipeButton title="Annuler la possession" variant="neutral" disabled={locked} onPress={() => void coverage('owned', true)} />}
            {(!rows.some(r => r.comparisonId === list.assignment?.comparison_id) || list.assignment?.stale) && <RecipeButton title="Déclarer un achat sans prix" variant="neutral" disabled={locked} onPress={() => begin('purchase')} />}
            {bought?.purchased && <RecipeButton title="Annuler l’achat déclaré sans prix" variant="neutral" disabled={locked} onPress={() => void coverage('purchase', true)} />}
            {(mode === 'owned' || mode === 'purchase') && <View style={s.notice}>
              <Text style={s.sectionTitle}>{mode === 'owned' ? 'Quantité déjà disponible' : 'Quantité totale achetée sans prix'}</Text>
              <Text style={s.note}>Cette déclaration concerne uniquement cette liste. L’enregistrement remplace la déclaration précédente. Les achats de produits enregistrés sont comptés séparément.</Text>
              {item.required.map(q => <RecipeField key={q.unit} label={`Quantité en ${q.unit}`} value={values[q.unit] ?? ''} keyboardType="decimal-pad" editable={!locked}
                onChangeText={v => setValues(current => ({ ...current, [q.unit]: v }))} />)}
              <RecipeButton title={item.required.length ? 'Enregistrer la quantité déclarée' : 'Confirmer pour ce besoin sans quantité'} disabled={locked} onPress={() => void coverage(mode)} />
              {mode === 'owned' && item.required.length > 0 && <RecipeButton title="J’ai la totalité du besoin" variant="neutral" disabled={locked} onPress={() => void coverage('owned', false, true)} />}
            </View>}
            {mode === 'need' && <View style={s.notice}>
              <RecipeField label="Nom de l’article" value={itemName} onChangeText={setItemName} editable={!locked} maxLength={120} />
              <RecipeButton title="Enregistrer le nom de l’article" disabled={locked || !itemName.trim()} onPress={() => void onCommand(listCommand(path, { expected_revision: list.revision, name: itemName.trim() }, 'PATCH'))} />
              <Text style={s.note}>Les quantités déjà achetées sont conservées. Une augmentation fait apparaître le complément ; compare ensuite pour préparer ses achats.</Text>
              {!item.required.length && <>
                <RecipeField label="Besoin total" value={newAmount} onChangeText={setNewAmount} keyboardType="decimal-pad" editable={!locked} />
                <RecipeUnitPicker value={newUnit} onChange={setNewUnit} ingredientLabel={item.name} disabled={locked} />
                <RecipeButton title="Préciser le besoin" disabled={locked} onPress={() => {
                  const amount = positiveAmount(newAmount);
                  if (!amount || !newUnit) { setError('Indique une quantité positive et son unité.'); return; }
                  void onCommand(listCommand(path, { expected_revision: list.revision, quantity: { amount, unit: newUnit } }, 'PATCH'));
                }} />
              </>}
              {item.required.map(q => <View key={q.unit}>
                <RecipeField label={`Besoin total en ${q.unit}`} value={values[q.unit] ?? ''} keyboardType="decimal-pad" editable={!locked} onChangeText={v => setValues(current => ({ ...current, [q.unit]: v }))} />
                <RecipeButton title={`Enregistrer le besoin en ${q.unit}`} disabled={locked} onPress={() => {
                  const amount = positiveAmount(values[q.unit] ?? '');
                  if (!amount) { setError('Indique une quantité positive.'); return; }
                  void onCommand(listCommand(path, { expected_revision: list.revision, quantity: { amount, unit: q.unit } }, 'PATCH'));
                }} />
              </View>)}
            </View>}
            {item.ingredient_id && <RecipeButton title="Le prendre ailleurs" variant="neutral" disabled={locked} onPress={() => setChoosing(!choosing)} />}
            {list.choices.some(c => c.item_id === item.id) && <RecipeButton title="Revenir au choix automatique" variant="neutral" disabled={locked} onPress={() => void onCommand(listCommand(`${path}/choice`, { expected_revision: list.revision, product_id: null }, 'PUT'))} />}
            {choosing && <ListComparison list={list} disabled={locked} onCommand={onCommand} itemId={item.id} />}
            {item.ingredient_id && <ListExclusionAction ingredientId={item.ingredient_id} name={item.name} disabled={locked} />}
            <RecipeButton title="Retirer de la liste" variant="neutral" disabled={locked} onPress={() => Alert.alert('Retirer cet article ?', 'Il restera restaurable dans cette liste.', [
              { text: 'Annuler', style: 'cancel' }, { text: 'Retirer', onPress: async () => {
                if (await onCommand(listCommand(path, { expected_revision: list.revision, removed: true }, 'PATCH'))) onClose();
              } },
            ])} />
          </>}
        </ScrollView>
      </SafeAreaView>
    </View>
  </Modal>;
}
