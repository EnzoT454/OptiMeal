import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { RecipeButton, RecipeField, recipeStyles as s } from '../recipes';
import { listCommand, listsPath, quantityLabel } from '../../services/shoppingLists';
import type { ListCommand } from '../../services/shoppingLists';
import type { ShoppingCalculatedLine, ShoppingListRead } from '../../types/shoppingLists';
import { storeLabel, subtractAmount } from './courseQuantities';

export interface ProductRow {
  comparisonId: string; itemIds: string[]; line: ShoppingCalculatedLine; purchasedUnits: number; purchasedAmount?: string; purchasedQuantity?: string;
}
export function productRows(list: ShoppingListRead): ProductRow[] {
  const rows: ProductRow[] = [];
  if (list.assignment) for (const need of list.assignment.scenario.needs) for (const line of need.lines) {
    const saved = list.product_purchases?.find(p => p.comparison_id === list.assignment!.comparison_id
      && p.line.sale.product_id === line.sale.product_id && p.item_ids[0] === need.item_ids[0]);
    rows.push({ comparisonId: list.assignment.comparison_id, itemIds: need.item_ids, line, purchasedUnits: saved?.purchased_units ?? 0, purchasedAmount: saved?.estimated_amount ?? '0', purchasedQuantity: saved?.purchased_quantity ?? '0' });
  }
  for (const p of list.product_purchases ?? []) if (p.purchased_units && !rows.some(r => r.comparisonId === p.comparison_id
    && r.line.sale.product_id === p.line.sale.product_id && r.itemIds[0] === p.item_ids[0])) {
    rows.push({ comparisonId: p.comparison_id, itemIds: p.item_ids, line: p.line, purchasedUnits: p.purchased_units, purchasedAmount: p.estimated_amount, purchasedQuantity: p.purchased_quantity });
  }
  return rows;
}
export function productCommand(list: ShoppingListRead, row: ProductRow, units: number): ListCommand {
  return listCommand(`${listsPath}/${list.id}/product-purchases`, {
    expected_revision: list.revision, comparison_id: row.comparisonId, item_id: row.itemIds[0],
    product_id: row.line.sale.product_id, purchased_units: units,
  }, 'PUT');
}
export default function ProductPurchase({ list, row, disabled, onCommand, onOpen, detailed = false, display = 'full' }: {
  list: ShoppingListRead; row: ProductRow; disabled: boolean; detailed?: boolean; display?: 'full' | 'remaining' | 'purchased';
  onCommand: (command: ListCommand) => Promise<boolean>; onOpen?: () => void;
}) {
  const [units, setUnits] = useState(String(row.purchasedUnits));
  const [error, setError] = useState('');
  const line = row.line;
  const direct = line.pricing_method === 'direct';
  const packaged = direct || line.sale.price_basis === 'package';
  const names = row.itemIds.map(id => list.items.find(i => i.id === id)?.name ?? '').join(' + ');
  const historical = list.assignment?.comparison_id !== row.comparisonId;
  const purchasedView = display === 'purchased' || historical;
  const remainingView = display === 'remaining' && !historical;
  const displayedUnits = purchasedView ? row.purchasedUnits : remainingView ? Math.max(0, line.sale_units - row.purchasedUnits) : line.sale_units;
  const displayedAmount = purchasedView ? row.purchasedAmount ?? line.amount : remainingView ? subtractAmount(line.amount, [row.purchasedAmount ?? '0']) : line.amount;
  const [costWhole, costFraction = ''] = displayedAmount.split('.');
  const costLabel = `${costWhole},${costFraction.padEnd(2, '0')}`;
  const displayedQuantity = purchasedView ? row.purchasedQuantity ?? line.quantity : remainingView ? subtractAmount(line.quantity, [row.purchasedQuantity ?? '0']) : line.quantity;

  const checked = purchasedView ? row.purchasedUnits > 0 : row.purchasedUnits >= line.sale_units;
  const staleNew = !!list.assignment?.stale && !list.product_purchases?.some(p => p.comparison_id === row.comparisonId
    && p.line.sale.product_id === line.sale.product_id && p.item_ids[0] === row.itemIds[0]);
  const label = `${line.sale.raw_source.name} pour ${names}`;
  const summary = <>
    <Text style={s.sectionTitle}>{line.sale.raw_source.name}</Text>
    <Text style={s.body}>Pour : {names}</Text>
    <Text style={s.body}>{storeLabel(line.sale.raw_source.retailer)}{line.sale.raw_source.store_id ? ` · ${line.sale.raw_source.store_id}` : ''}</Text>
    <Text style={s.body}>{direct ? `${displayedUnits} produit(s)` : line.sale.price_basis === 'package' ? `${displayedUnits} paquet(s)` : `${displayedQuantity} ${list.assignment?.scenario.needs.find(n => n.item_ids[0] === row.itemIds[0])?.unit ?? ''}`} · {costLabel} $ estimés</Text>
    <Text style={s.note}>{row.purchasedUnits} {direct ? 'produit(s)' : line.sale.price_basis === 'package' ? 'paquet(s)' : 'pas de vente'} acheté(s){historical ? ' · achat conservé d’une proposition précédente' : ''}</Text>
  </>;
  return <View style={[s.choice, { gap: 10 }]}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Pressable accessibilityRole="checkbox" accessibilityLabel={`Acheté : ${label}`}
        accessibilityState={{ checked, disabled: disabled || staleNew }} disabled={disabled || staleNew}
        onPress={() => void onCommand(productCommand(list, row, checked ? 0 : line.sale_units))}
        style={{ minHeight: 48, minWidth: 48, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={s.sectionTitle}>{checked ? '☑' : '☐'}</Text>
      </Pressable>
      {onOpen ? <Pressable accessibilityRole="button" accessibilityLabel={`Fiche de ${label}`} onPress={onOpen} style={{ flex: 1, minHeight: 48 }}>{summary}</Pressable>
        : <View style={{ flex: 1 }}>{summary}</View>}
    </View>
    {detailed && <>
      <Text style={s.note}>Besoin : {quantityLabel(list.items.filter(i => row.itemIds.includes(i.id)).flatMap(i => i.required))}</Text>
      <Text style={s.note}>Format : {line.sale.format?.raw ?? (line.sale.content_per_package ? quantityLabel([line.sale.content_per_package]) : 'Voir la quantité de vente')}. {line.estimated_weight ? 'Poids réel et montant payé à confirmer.' : 'Estimation conservée, prix de caisse non confirmé.'}</Text>
      {line.sale.raw_source.is_promotion === true && <Text style={s.note}>Promotion du {String(line.sale.raw_source.valid_from ?? '?')} au {String(line.sale.raw_source.valid_to ?? '?')}{line.sale.raw_source.quantity_limit ? ` · limite ${String(line.sale.raw_source.quantity_limit)}` : ''}.</Text>}
      {line.sale.raw_source.price_after_limit != null && <Text style={s.note}>Après la limite : {String(line.sale.raw_source.price_after_limit).replace('.', ',')} $ par unité de vente.</Text>}
      <RecipeField label={direct ? 'Nombre de produits achetés' : line.sale.price_basis === 'package' ? 'Nombre de paquets achetés' : 'Nombre de pas de vente achetés'} value={units} onChangeText={setUnits} keyboardType="number-pad" editable={!disabled && !staleNew} />
      {!packaged && <Text style={s.note}>Un pas : {String(line.sale.sale_increment?.amount ?? '?')} {String(line.sale.sale_increment?.unit ?? '')}</Text>}
      {line.sale.minimum_sale && <Text style={s.note}>Minimum de vente : {quantityLabel([line.sale.minimum_sale])}</Text>}
      {!!error && <Text style={s.requiredItem}>{error}</Text>}
      <RecipeButton title="Enregistrer la quantité achetée" disabled={disabled || staleNew} onPress={() => {
        if (!/^(0|[1-9][0-9]*)$/.test(units.trim()) || units.trim().length > 7 || Number(units) > 1000000) { setError('Indique un nombre entier de 0 à 1 000 000.'); return; }
        setError(''); void onCommand(productCommand(list, row, Number(units)));
      }} />
    </>}
    {staleNew && <Text style={s.requiredItem}>Recalcule les prix avant d’enregistrer ce produit.</Text>}
  </View>;
}
