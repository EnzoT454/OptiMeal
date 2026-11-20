import { Text, View } from 'react-native';
import type { ShoppingListRead } from '../../types/shoppingLists';
import { shoppingBudget } from '../../services/shoppingPresentation';
import { recipeStyles as s } from '../recipes';

export default function ShoppingPriceSummary({ list }: { list: ShoppingListRead }) {
  const budget = shoppingBudget(list);
  if (!budget) return null;
  return <View style={{ alignSelf: 'stretch', alignItems: 'center', paddingTop: 4 }}>
    <View style={{ alignItems: 'center', gap: 4 }}>
      <Text style={s.note}>{budget.label}</Text><Text style={[s.title, { flex: 0 }]}>{budget.amount} $</Text>
      {!!budget.missing && <Text style={s.note}>{budget.missing} sans prix</Text>}
    </View>

  </View>;
}
