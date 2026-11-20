import { Pressable, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ShoppingListRead } from '../../types/shoppingLists';
import { shoppingBudget, shoppingListKind, shoppingStoreCount } from '../../services/shoppingPresentation';
import { recipeColors, recipeStyles as s } from '../recipes';

export default function ListSummaryRow({ list, onPress }: { list: ShoppingListRead; onPress: () => void }) {
  const budget = shoppingBudget(list);
  const product = shoppingListKind(list) !== 'articles';
  const stores = shoppingStoreCount(list);
  const unit = product ? 'produits' : 'articles';
  const accent = product ? '#315b86' : recipeColors.green;
  const status = list.status === 'completed' ? 'Terminée' : list.status === 'archived' ? 'Archivée' : 'En cours';
  return <Pressable accessibilityRole="button"
    accessibilityLabel={`Ouvrir ${list.name}. ${status}. ${list.totals.remaining_item_count} ${unit} à acheter.${product ? ` ${stores} magasins. ${budget ? ` ${budget.label} : ${budget.amount} dollars canadiens. ${budget.missing} sans prix.` : ' Prix indisponible.'}` : ''}`}
    onPress={onPress} style={{ minHeight: 80, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: recipeColors.border }}>
    <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: product ? '#edf3fa' : recipeColors.light }}>
      <MaterialCommunityIcons name={product ? 'cart-outline' : 'format-list-bulleted'} size={24} color={accent} accessible={false} />
    </View>
    <View style={{ flex: 1, gap: 6 }}>
      <Text style={s.sectionTitle}>{list.name}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 22, rowGap: 6 }}>
        <View accessible accessibilityLabel={`${list.totals.remaining_item_count} ${unit} restants à acheter`} style={[s.row, { gap: 4 }]}>
          <MaterialCommunityIcons name="cart-arrow-down" size={17} color={accent} accessible={false} />
          <Text style={s.note}>{list.totals.remaining_item_count} à acheter</Text>
        </View>
        {product && <View accessible accessibilityLabel={`${stores} magasins`} style={[s.row, { gap: 4 }]}>
          <MaterialCommunityIcons name="store-outline" size={17} color={accent} accessible={false} />
          <Text style={s.note}>{stores}</Text>
        </View>}
      </View>
    </View>
    {product && <View style={{ alignItems: 'flex-end', flexShrink: 1, maxWidth: '38%', gap: 3 }}>
      <Text style={[s.note, { textAlign: 'right' }]}>{budget?.label ?? 'Prix indisponible'}</Text>
      {budget && <Text style={[s.sectionTitle, { color: accent }]}>{budget.amount} $</Text>}
      {!!budget?.missing && <Text style={s.note}>{budget.missing} sans prix</Text>}
    </View>}
  </Pressable>;
}
