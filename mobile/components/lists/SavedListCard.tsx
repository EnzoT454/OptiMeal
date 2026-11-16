import { Pressable, Text, View } from 'react-native';
import { recipeStyles as s } from '../recipes';
import { dateLabel } from '../../services/shoppingLists';
import type { ShoppingListRead } from '../../types/shoppingLists';

export function SavedListTotals({ list }: { list: ShoppingListRead }) {
  return <>
    <Text style={s.body}>{list.totals.remaining_item_count} à acheter · {list.totals.purchased_item_count} achetés · {list.totals.owned_item_count} déjà disponibles</Text>
    <Text style={s.body}>{list.totals.estimate_complete ? 'Estimation des achats' : 'Sous-total connu'} : {list.totals.budget_known_amount.replace('.', ',')} $</Text>
    <Text style={s.note}>Reste connu à acheter : {list.totals.remaining_known_amount.replace('.', ',')} $ · {list.totals.unpriced_item_count} article(s) sans estimation complète.</Text>
  </>;
}
export default function SavedListCard({ list, onOpen }: { list: ShoppingListRead; onOpen: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`Ouvrir ${list.name}`} onPress={onOpen} style={[s.choice, { minHeight: 72, gap: 6 }]}>
    <Text style={s.sectionTitle}>{list.name}</Text>
    <Text style={s.note}>{list.status === 'draft' ? 'Brouillon' : list.status === 'active' ? 'En cours' : list.status === 'completed' ? 'Terminée' : 'Archivée'} · révision {list.revision} · {list.totals.item_count} articles</Text>
    {list.period && <Text style={s.body}>Repas du {dateLabel(list.period.start_date)} au {dateLabel(list.period.end_date)}</Text>}
    <Text style={s.note}>Courses prévues le {dateLabel(list.purchase_date)}</Text>
    <SavedListTotals list={list} />
  </Pressable>;
}
