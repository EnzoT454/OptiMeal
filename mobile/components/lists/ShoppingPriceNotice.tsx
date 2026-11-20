import { Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ShoppingListRead } from '../../types/shoppingLists';
import { recipeColors, recipeStyles as s } from '../recipes';

export default function ShoppingPriceNotice({ list }: { list: ShoppingListRead }) {
  if (!list.assignment && !list.product_purchases?.some(p => p.purchased_units > 0)) return null;
  return <View style={[s.notice, { flexDirection: 'row', alignItems: 'flex-start', gap: 10 }]}>
    <MaterialCommunityIcons name="information-outline" size={22} color={recipeColors.green} accessible={false} />
    <Text style={[s.note, { flex: 1, color: recipeColors.green }]}>Prix au {list.assignment?.purchase_date ?? list.purchase_date}, hors taxes et consignes non documentées. Prix en caisse et disponibilité à vérifier.</Text>
  </View>;
}
