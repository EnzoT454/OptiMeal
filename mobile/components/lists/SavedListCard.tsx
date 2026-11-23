import ShoppingPriceSummary from './ShoppingPriceSummary';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps } from 'react';
import { shoppingListKind, shoppingStoreCount } from '../../services/shoppingPresentation';
import { Pressable, Text, View } from 'react-native';
import { recipeColors, recipeStyles as s } from '../recipes';
import { dateLabel } from '../../services/shoppingLists';
import type { ShoppingListRead } from '../../types/shoppingLists';

export function SavedListTotals({ list }: { list: ShoppingListRead }) {
  const products = shoppingListKind(list) !== 'articles';
  const counters: { icon: ComponentProps<typeof MaterialCommunityIcons>['name']; value: number; label: string }[] = [
    { icon: products ? 'package-variant-closed' : 'format-list-bulleted', value: list.totals.item_count, label: products ? 'Produits' : 'Articles' },
    { icon: 'cart-arrow-down', value: list.totals.remaining_item_count, label: 'À acheter' },
    { icon: 'check-circle-outline', value: list.totals.purchased_item_count, label: 'Achetés' },
  ];
  if (products) counters.push(
    { icon: 'store-outline', value: shoppingStoreCount(list), label: 'Magasins' },
    { icon: 'help-circle-outline', value: list.totals.unpriced_item_count, label: 'Sans prix' });
  if (list.totals.owned_item_count) counters.push({ icon: 'home-outline', value: list.totals.owned_item_count, label: 'Disponibles' });
  const status = list.status === 'draft' ? 'Brouillon enregistré' : list.status === 'active' ? 'Liste en cours' : list.status === 'completed' ? 'Liste terminée' : 'Liste archivée';
  return <View style={{ gap: 16, alignItems: 'center', alignSelf: 'stretch' }}>
    <View style={[s.row, { justifyContent: 'center', flexWrap: 'wrap' }]}><MaterialCommunityIcons name="clipboard-list-outline" size={20} color={recipeColors.green} accessible={false} />
      <Text style={[s.sectionTitle, { textAlign: 'center' }]}>{status}</Text></View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 16 }}>
      {counters.map(counter => <View key={counter.label} accessible accessibilityLabel={`${counter.value} ${counter.label.toLocaleLowerCase('fr')}`} style={{ alignItems: 'center', minWidth: 60, gap: 3 }}>
        <MaterialCommunityIcons name={counter.icon} size={24} color={recipeColors.green} accessible={false} />
        <Text style={[s.sectionTitle, { textAlign: 'center' }]}>{counter.value}</Text><Text style={[s.note, { textAlign: 'center' }]}>{counter.label}</Text>
      </View>)}
    </View>
    {products && <ShoppingPriceSummary list={list} />}
  </View>;
}
export default function SavedListCard({ list, onOpen }: { list: ShoppingListRead; onOpen: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`Ouvrir ${list.name}`} onPress={onOpen} style={[s.choice, { minHeight: 72, gap: 6 }]}>
    <Text style={s.sectionTitle}>{list.name}</Text>
    <Text style={s.note}>{list.status === 'draft' ? 'Brouillon' : list.status === 'active' ? 'En cours' : list.status === 'completed' ? 'Terminée' : 'Archivée'} · {list.totals.item_count} articles</Text>
    {list.period && <Text style={s.body}>Repas du {dateLabel(list.period.start_date)} au {dateLabel(list.period.end_date)}</Text>}
    <SavedListTotals list={list} />
  </Pressable>;
}
