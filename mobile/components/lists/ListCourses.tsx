import { useState } from 'react';
import ShoppingListItemRow from './ShoppingListItemRow';
import { Pressable, Text, View } from 'react-native';
import { RecipeButton, recipeStyles as s } from '../recipes';
import { listCommand, listsPath, quantityLabel } from '../../services/shoppingLists';
import type { ListCommand } from '../../services/shoppingLists';
import type { ShoppingItemRead, ShoppingListRead } from '../../types/shoppingLists';
import ProductPurchase, { productRows } from './ProductPurchase';
import ListArticleSheet from './ListArticleSheet';
import { shoppingListKind } from '../../services/shoppingPresentation';
import { remainingQuantities, storeLabel } from './courseQuantities';

export default function ListCourses({ list, disabled, onCommand, error = '' }: {
  list: ShoppingListRead; error?: string; disabled: boolean; onCommand: (command: ListCommand) => Promise<boolean>;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [showBought, setShowBought] = useState(false);
  const [showRemoved, setShowRemoved] = useState(false);
  const [store, setStore] = useState('all');
  const rows = productRows(list);
  const isBought = (item: ShoppingItemRead) => item.coverage_status === 'purchased';
  const stores = [...new Set(rows.map(r => r.line.sale.raw_source.retailer))];
  const editable = list.status === 'draft' || list.status === 'active';
  const locked = disabled || !editable;
  const selectedItem = list.items.find(i => i.id === selected && !i.removed);
  function manualRow(item: ShoppingItemRead) {
    return <ShoppingListItemRow key={item.id} item={item} list={list} disabled={locked} onCommand={onCommand} onOpen={() => setSelected(item.id)} />;
  }

  const loose = list.items.filter(i => !i.removed && !rows.some(r => r.itemIds.includes(i.id)));
  const categories = [...new Set(loose.map(i => i.category))].sort((a, b) => a.localeCompare(b, 'fr'));
  return <View style={{ gap: 16 }}>
    <Text accessibilityRole="header" style={s.sectionTitle}>À acheter · {list.totals.remaining_item_count} {list.kind === 'products' ? 'produits restants' : 'articles restants'}</Text>
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
            <ProductPurchase key={`${row.comparisonId}:${row.line.sale.product_id}`} list={list} row={row} display="remaining" disabled={locked} onCommand={onCommand} onOpen={() => setSelected(row.itemIds[0])} />)}
        </View>)}
      </View>;
    })}
    {store === 'all' && categories.map(category => {
      const remaining = loose.filter(i => i.category === category && (!isBought(i) && i.coverage_status !== 'owned'));
      return remaining.length > 0 && <View key={category} style={{ gap: 8 }}><Text style={s.note}>{list.kind === 'products' ? 'Produits sans prix' : 'Articles'} · {category}</Text>{remaining.map(manualRow)}</View>;
    })}
    {shoppingListKind(list) !== 'products' && list.items.filter(i => !i.removed && rows.some(r => r.itemIds.includes(i.id)) && remainingQuantities(list, i).length > 0).map(item =>
      <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Vérifier le complément de ${item.name}`} onPress={() => setSelected(item.id)} style={s.notice}>
        <Text style={s.body}>{item.name} · encore {quantityLabel(remainingQuantities(list, item))}</Text>
        {list.assignment?.stale && <Text style={s.requiredItem}>Recalculer les prix pour les compléments.</Text>}
      </Pressable>)}
    <RecipeButton title={`Achetés (${list.totals.purchased_item_count}) · ${showBought ? 'Masquer' : 'Voir'}`} variant="neutral" accessibilityState={{ expanded: showBought }} onPress={() => setShowBought(!showBought)} />
    {showBought && <View style={{ gap: 10 }}>
      {rows.filter(r => r.purchasedUnits > 0 && (store === 'all' || r.line.sale.raw_source.retailer === store)).map(row =>
        <ProductPurchase key={`${row.comparisonId}:${row.line.sale.product_id}`} list={list} row={row} display="purchased" disabled={locked} onCommand={onCommand} onOpen={() => setSelected(row.itemIds[0])} />)}
      {store === 'all' && loose.filter(isBought).map(manualRow)}
      {!rows.some(r => r.purchasedUnits > 0) && !loose.some(isBought) && <Text style={s.note}>Aucun achat enregistré.</Text>}
    </View>}
    {list.items.some(i => !i.removed && i.coverage_status === 'owned') && <View style={{ gap: 8 }}><Text style={s.sectionTitle}>Déjà disponible</Text>{list.items.filter(i => !i.removed && i.coverage_status === 'owned').map(manualRow)}</View>}
    {list.items.some(item => item.removed) && <View style={{ gap: 8 }}>
      <RecipeButton title={`${list.kind === 'products' ? 'Produits retirés' : 'Articles retirés'} (${list.items.filter(item => item.removed).length})`} variant="neutral"
        accessibilityState={{ expanded: showRemoved }} onPress={() => setShowRemoved(!showRemoved)} />
      {showRemoved && list.items.filter(item => item.removed).map(item => <RecipeButton key={item.id} title={`Restaurer ${item.name}`} variant="neutral"
        disabled={locked || list.totals.item_count >= 500} onPress={() => void onCommand(listCommand(`${listsPath}/${list.id}/items/${item.id}`,
          { expected_revision: list.revision, removed: false }, 'PATCH'))} />)}
    </View>}
    {selectedItem && <ListArticleSheet key={selectedItem.id} item={selectedItem} list={list} commandError={error} disabled={disabled} onClose={() => setSelected(null)} onCommand={onCommand} />}
  </View>;
}
