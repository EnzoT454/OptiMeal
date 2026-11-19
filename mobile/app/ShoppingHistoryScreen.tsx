import { ActivityIndicator, Text } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RecipeButton, RecipeScreen, RecipeTitle, recipeColors, recipeStyles as s } from '../components/recipes';
import { useAuth } from '../context/AuthContext';
import { useShoppingPage } from '../components/lists/useShoppingPage';
import ListSummaryRow from '../components/lists/ListSummaryRow';
import { fetchLists } from '../services/shoppingLists';
import type { ListStackParams } from '../types/navigation';

export default function ShoppingHistoryScreen({ navigation }: NativeStackScreenProps<ListStackParams, 'History'>) {
  const { session } = useAuth();
  const page = useShoppingPage('lists:history', offset => fetchLists(offset, 'history', undefined, session?.user.id), item => item.id);
  return <RecipeScreen>
    <RecipeTitle>Historique</RecipeTitle>
    {page.loading && <ActivityIndicator accessibilityLabel="Chargement de l’historique" color={recipeColors.green} />}
    {!!page.error && <Text accessibilityRole="alert" style={s.requiredItem}>{page.error}</Text>}
    {!page.loading && !page.error && !page.items.length && <Text style={s.body}>Aucune liste dans l’historique.</Text>}
    {page.items.map(list => <ListSummaryRow key={list.id} list={list} onPress={() => navigation.navigate('ShoppingDetail', { id: list.id })} />)}
    {page.error && <RecipeButton title="Réessayer" variant="neutral" disabled={page.loading} onPress={() => void page.load()} />}
    {page.items.length < page.total && <RecipeButton title="Voir plus" variant="neutral" disabled={page.loading} onPress={() => void page.load(true)} />}
  </RecipeScreen>;
}
