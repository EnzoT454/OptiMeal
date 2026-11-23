import { Text, View } from 'react-native';
import type { ShoppingListRead } from '../../types/shoppingLists';
import { shoppingBudget } from '../../services/shoppingPresentation';
import { recipeStyles as s } from '../recipes';

export default function ShoppingPriceSummary({ list }: { list: ShoppingListRead }) {
  const budget = shoppingBudget(list);
  const unknownOnly = list.kind === 'products' && list.totals.unpriced_item_count > 0;
  if (!budget && !unknownOnly) return null;
  return <View style={{ alignSelf: 'stretch', alignItems: 'center', paddingTop: 4 }}>
    <View style={{ alignItems: 'center', gap: 4 }}>
      <Text style={[s.note, { textAlign: 'center' }]}>{budget?.label ?? 'Sous-total connu'}</Text>
      <Text style={[s.title, { flex: 0, textAlign: 'center' }]}>{budget?.amount ?? '-'} $</Text>
    </View>

  </View>;
}
