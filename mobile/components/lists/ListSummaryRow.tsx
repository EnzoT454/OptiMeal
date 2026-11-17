import { Pressable, Text, View } from 'react-native';
import type { ComponentProps } from 'react';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { recipeColors, recipeStyles as s } from '../recipes';
import { dateLabel } from '../../services/shoppingLists';
import type { ShoppingListRead } from '../../types/shoppingLists';

export default function ListSummaryRow({ list, onPress }: { list: ShoppingListRead; onPress: () => void }) {
  const stores = new Set<string>();
  if (list.assignment && !list.assignment.stale) {
    for (const store of list.assignment.scenario.store_totals) stores.add(JSON.stringify([store.retailer, store.store_id]));
  }
  for (const purchase of list.product_purchases ?? []) {
    if (purchase.purchased_units > 0) {
      const source = purchase.line.sale.raw_source;
      stores.add(JSON.stringify([source.retailer, source.store_id]));
    }
  }
  const [whole, fraction = ''] = list.totals.budget_known_amount.split('.');
  const amount = `${whole},${fraction.padEnd(2, '0')} $`;
  const unknown = !list.totals.estimate_complete && !/[1-9]/.test(list.totals.budget_known_amount);
  const cost = unknown ? '—' : `${list.totals.estimate_complete ? '' : '≥ '}${amount}`;
  const costLabel = unknown ? 'Coût à déterminer' : `${list.totals.estimate_complete ? 'Coût total estimé' : 'Coût total estimé, au moins'} ${amount}`;
  const status = list.status === 'completed' ? 'Terminée' : list.status === 'archived' ? 'Archivée' : 'En cours';
  const metrics: { icon: ComponentProps<typeof MaterialCommunityIcons>['name']; value: string }[] = [
    { icon: 'format-list-bulleted', value: String(list.totals.item_count) },
    { icon: 'storefront-outline', value: String(stores.size) },
    { icon: 'calendar-blank-outline', value: list.purchase_date.split('-').reverse().join('/') },
    { icon: 'cash', value: cost },
  ];
  return <Pressable accessibilityRole="button"
    accessibilityLabel={`Ouvrir ${list.name}. ${status}. ${list.totals.item_count} articles. ${stores.size} magasins. Courses le ${dateLabel(list.purchase_date)}. ${costLabel}.`}
    onPress={onPress} style={[s.choice, { minHeight: 80, flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
    <View style={{ flex: 1, gap: 10 }}>
      <Text style={s.sectionTitle}>{list.name}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 8 }}>
        {metrics.map(metric => <View key={metric.icon} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <MaterialCommunityIcons name={metric.icon} size={18} color={recipeColors.muted} accessible={false} />
          <Text style={s.note}>{metric.value}</Text>
        </View>)}
      </View>
    </View>
    <MaterialCommunityIcons name="chevron-right" size={22} color={recipeColors.muted} accessible={false} />
  </Pressable>;
}
