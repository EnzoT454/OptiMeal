import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { ShoppingItemRead, ShoppingListRead } from '../../types/shoppingLists';
import { listCommand, listsPath, quantityLabel, type ListCommand } from '../../services/shoppingLists';
import { manualCheckCoverage } from './courseQuantities';
import { recipeColors, recipeStyles as s } from '../recipes';
import { ProductImage } from '../ProductImage';
import { storeLabel } from './courseQuantities';

export default function ShoppingListItemRow({ item, list, disabled, onOpen, onCommand }: {
  item: ShoppingItemRead; list: ShoppingListRead; disabled: boolean; onOpen: () => void;
  onCommand: (intent: ListCommand) => Promise<boolean>;
}) {
  const [pending, setPending] = useState<boolean | null>(null);
  const owned = item.coverage_status === 'owned';
  const choice = list.choices.find(value => value.item_id === item.id);
  const product = choice ? list.assignment?.selected_products?.[choice.product_id] : null;
  const checked = pending ?? item.coverage_status === 'purchased';
  async function toggle() {
    if (disabled || pending !== null || owned) return;
    const next = !checked; setPending(next);
    try {
      await onCommand(listCommand(`${listsPath}/${list.id}/items/${item.id}/manual-purchase`, {
        expected_revision: list.revision, purchased: next, coverage: next ? manualCheckCoverage(item) : {},
      }, 'PUT'));
    } finally { setPending(null); }
  }
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderBottomColor: recipeColors.border }}>
    {!owned && <Pressable accessibilityRole="checkbox" accessibilityLabel={`Acheté sans prix : ${item.name}`}
      accessibilityState={{ checked, busy: pending !== null, disabled: disabled || pending !== null }}
      disabled={disabled || pending !== null} onPress={() => void toggle()}
      style={{ minWidth: 48, minHeight: 56, justifyContent: 'center', alignItems: 'center' }}>
      <Text style={[s.sectionTitle, { color: recipeColors.green }]}>{checked ? '☑' : '☐'}</Text>
    </Pressable>}
    {product?.image_url && <ProductImage uri={product.image_url} size={40} />}
    <Pressable accessibilityRole="button" accessibilityLabel={`Modifier ${item.name}`} onPress={onOpen}
      style={{ flex: 1, minHeight: 56, justifyContent: 'center', paddingVertical: 8, gap: 4 }}>
      <Text style={[s.body, { color: recipeColors.ink, textDecorationLine: checked ? 'line-through' : 'none' }]}>{item.name}{item.required.length ? ` · ${quantityLabel(item.required)}` : ''}</Text>
      {product && <Text style={s.note}>{product.name} · {storeLabel(product.retailer)} · Prix indisponible</Text>}
      {owned && <Text style={s.note}>Déjà disponible</Text>}
      {item.coverage_status === 'partial' && <Text style={s.note}>Partiellement couvert</Text>}
      {pending !== null && <Text accessibilityLiveRegion="polite" style={s.note}>Enregistrement…</Text>}
    </Pressable>
  </View>;
}
