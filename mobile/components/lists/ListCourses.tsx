import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { RecipeButton, recipeStyles as s } from '../recipes';
import { listCommand, listsPath, quantityLabel } from '../../services/shoppingLists';
import type { ListCommand } from '../../services/shoppingLists';
import type { ShoppingItemRead, ShoppingListRead } from '../../types/shoppingLists';
import ProductPurchase, { productRows } from './ProductPurchase';
import ListArticleSheet from './ListArticleSheet';
import { coverageLabels, manualCheckCoverage, remainingQuantities, storeLabel } from './courseQuantities';

export default function ListCourses({ list, disabled, onCommand, error = '' }: {
  list: ShoppingListRead; error?: string; disabled: boolean; onCommand: (command: ListCommand) => Promise<boolean>;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [showBought, setShowBought] = useState(false);
  const [store, setStore] = useState('all');
  const rows = productRows(list);
  const stores = [...new Set(rows.map(r => r.line.sale.raw_source.retailer))];
  const editable = list.status === 'draft' || list.status === 'active';
  const locked = disabled || !editable;
  const selectedItem = list.items.find(i => i.id === selected && !i.removed);
  function manualRow(item: ShoppingItemRead) {
    const bought = item.coverage_status === 'purchased';
    const owned = item.coverage_status === 'owned';
    const remaining = remainingQuantities(list, item);
    return <View key={item.id} style={[s.choice, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
      {!owned && <Pressable accessibilityRole="checkbox" accessibilityLabel={`Acheté : ${item.name}`}
        accessibilityState={{ checked: bought, disabled: locked }} disabled={locked}
        onPress={() => void onCommand(listCommand(`${listsPath}/${list.id}/items/${item.id}/manual-purchase`, {
          expected_revision: list.revision, purchased: !bought, coverage: bought ? {} : manualCheckCoverage(item),
        }, 'PUT'))} style={{ minHeight: 48, minWidth: 48, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={s.sectionTitle}>{bought ? '☑' : '☐'}</Text>
      </Pressable>}
      <Pressable accessibilityRole="button" accessibilityLabel={`Fiche de ${item.name}`} onPress={() => setSelected(item.id)} style={{ flex: 1, minHeight: 48, gap: 6 }}>
        <Text style={s.sectionTitle}>{item.name}</Text><Text style={s.body}>Besoin : {quantityLabel(item.required)}</Text>
        <Text style={s.note}>{coverageLabels[item.coverage_status]} · {item.category}</Text>
        {item.coverage_status === 'partial' && remaining.length > 0 && <Text style={s.requiredItem}>Complément : {quantityLabel(remaining)}</Text>}
        {!owned && <Text style={s.note}>Produit et prix à préciser</Text>}
      </Pressable>
    </View>;
  }
  const loose = list.items.filter(i => !i.removed && !rows.some(r => r.itemIds.includes(i.id)));
  const categories = [...new Set(loose.map(i => i.category))].sort((a, b) => a.localeCompare(b, 'fr'));
  return <View style={{ gap: 16 }}>
    <Text accessibilityRole="header" style={s.sectionTitle}>Reste à acheter</Text>
    {stores.length > 0 && <View style={s.chips}>
      <RecipeButton title="Tous les magasins" variant="neutral" onPress={() => setStore('all')} accessibilityState={{ selected: store === 'all' }} />
      {stores.map(retailer => <RecipeButton key={retailer} title={storeLabel(retailer)} variant="neutral" onPress={() => setStore(retailer)} accessibilityState={{ selected: store === retailer }} />)}
    </View>}
    {stores.filter(retailer => store === 'all' || store === retailer).map(retailer => {
      const storeRows = rows.filter(r => r.line.sale.raw_source.retailer === retailer && r.purchasedUnits < r.line.sale_units && r.comparisonId === list.assignment?.comparison_id && r.itemIds.some(id => list.items.some(i => i.id === id && !i.removed && i.coverage_status !== 'owned')));
      const grouped = [...new Set(storeRows.map(r => list.items.find(i => i.id === r.itemIds[0])?.category ?? 'Autres'))].sort((a, b) => a.localeCompare(b, 'fr'));
      return storeRows.length > 0 && <View key={retailer} style={{ gap: 12 }}>
        <Text accessibilityRole="header" style={s.sectionTitle}>{storeLabel(retailer)}</Text>
        {grouped.map(category => <View key={category} style={{ gap: 8 }}><Text style={s.note}>{category}</Text>
          {storeRows.filter(r => (list.items.find(i => i.id === r.itemIds[0])?.category ?? 'Autres') === category).map(row =>
            <ProductPurchase key={`${row.comparisonId}:${row.line.sale.product_id}`} list={list} row={row} disabled={locked} onCommand={onCommand} onOpen={() => setSelected(row.itemIds[0])} />)}
        </View>)}
      </View>;
    })}
    {store === 'all' && categories.map(category => {
      const remaining = loose.filter(i => i.category === category && (i.coverage_status === 'remaining' || i.coverage_status === 'partial'));
      return remaining.length > 0 && <View key={category} style={{ gap: 8 }}><Text style={s.note}>Magasin à choisir · {category}</Text>{remaining.map(manualRow)}</View>;
    })}
    {list.items.filter(i => !i.removed && rows.some(r => r.itemIds.includes(i.id)) && remainingQuantities(list, i).length > 0).map(item =>
      <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Vérifier le complément de ${item.name}`} onPress={() => setSelected(item.id)} style={s.notice}>
        <Text style={s.body}>{item.name} · encore {quantityLabel(remainingQuantities(list, item))}</Text>
        {list.assignment?.stale && <Text style={s.requiredItem}>Comparer les compléments avant de préparer leurs achats.</Text>}
      </Pressable>)}
    <RecipeButton title={`${showBought ? 'Masquer' : 'Voir'} les achats enregistrés`} variant="neutral" accessibilityState={{ expanded: showBought }} onPress={() => setShowBought(!showBought)} />
    {showBought && <View style={{ gap: 10 }}>
      {rows.filter(r => r.purchasedUnits > 0 && (store === 'all' || r.line.sale.raw_source.retailer === store)).map(row =>
        <ProductPurchase key={`${row.comparisonId}:${row.line.sale.product_id}`} list={list} row={row} disabled={locked} onCommand={onCommand} onOpen={() => setSelected(row.itemIds[0])} />)}
      {store === 'all' && loose.filter(i => i.coverage_status === 'purchased').map(manualRow)}
      {!rows.some(r => r.purchasedUnits > 0) && !loose.some(i => i.coverage_status === 'purchased') && <Text style={s.note}>Aucun achat enregistré.</Text>}
    </View>}
    {list.items.some(i => !i.removed && i.coverage_status === 'owned') && <View style={{ gap: 8 }}><Text style={s.sectionTitle}>Déjà disponible</Text>{list.items.filter(i => !i.removed && i.coverage_status === 'owned').map(manualRow)}</View>}
    {selectedItem && <ListArticleSheet key={selectedItem.id} item={selectedItem} list={list} commandError={error} disabled={disabled} onClose={() => setSelected(null)} onCommand={onCommand} />}
  </View>;
}
