import { Text, View } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { fetchLists, dateLabel } from '../../services/shoppingLists';
import type { ShoppingPeriod } from '../../types/shoppingLists';
import { RecipeButton, recipeStyles as s } from '../recipes';
import { Message } from '../ui';
import SavedListCard from './SavedListCard';
import { useShoppingPage } from './useShoppingPage';

export default function CalendarLists({ period, onCreate, onOpen }: {
  period: ShoppingPeriod; onCreate: () => void; onOpen: (id: string) => void;
}) {
  const { session } = useAuth();
  const page = useShoppingPage(`calendar:${period.start_date}:${period.end_date}`,
    offset => fetchLists(offset, undefined, period, session?.user.id), item => item.id);
  return <View style={s.notice}>
    <Text style={s.sectionTitle}>Listes de cette période</Text>
    <Text style={s.body}>Du {dateLabel(period.start_date)} au {dateLabel(period.end_date)}</Text>
    <RecipeButton title="Créer une liste pour cette période" onPress={onCreate} />
    <Text style={s.note}>Les listes sont des copies enregistrées. Modifier les repas ne modifie pas leurs besoins ni leurs achats.</Text>
    <RecipeButton title={page.loading ? 'Chargement des listes…' : 'Actualiser les listes de cette période'} variant="neutral" disabled={page.loading} onPress={() => void page.load()} />
    <Message text={page.error} />
    {!!page.error && page.items.length > 0 && <Text style={s.requiredItem}>Dernières listes chargées pour cette période ; actualise pour vérifier leurs changements.</Text>}
    {!page.loading && !page.error && !page.items.length && <Text style={s.body}>Aucune liste enregistrée pour cette période.</Text>}
    {page.items.map(list => <SavedListCard key={list.id} list={list} onOpen={() => onOpen(list.id)} />)}
    {page.items.length < page.total && <RecipeButton title="Voir plus de listes de cette période" variant="neutral" disabled={page.loading} onPress={() => void page.load(true)} />}
  </View>;
}
