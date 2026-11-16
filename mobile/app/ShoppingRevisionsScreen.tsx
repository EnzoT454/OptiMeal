import { ActivityIndicator, Pressable, Text } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RecipeButton, RecipeScreen, RecipeTitle, recipeStyles as s } from '../components/recipes';
import { useShoppingPage } from '../components/lists/useShoppingPage';
import { fetchRevisions, timestampLabel } from '../services/shoppingReuse';
import type { ListStackParams } from '../types/navigation';

export default function ShoppingRevisionsScreen({ route, navigation }: NativeStackScreenProps<ListStackParams, 'Revisions'>) {
  const { id } = route.params;
  const page = useShoppingPage(`revisions:${id}`, offset => fetchRevisions(id, offset), item => String(item.revision));
  return <RecipeScreen><RecipeTitle>Historique des révisions</RecipeTitle>
    <Text style={s.body}>Chaque révision conserve les besoins, quantités, produits et estimations enregistrés à cette date.</Text>
    <RecipeButton title="Actualiser" variant="neutral" disabled={page.loading} onPress={() => void page.load()} />
    {page.loading && <ActivityIndicator accessibilityLabel="Chargement des révisions" />}
    {!!page.error && <Text accessibilityRole="alert" style={s.requiredItem}>{page.error}</Text>}
    {page.items.map(item => <Pressable key={item.revision} accessibilityRole="button" style={s.choice}
      onPress={() => navigation.push('ShoppingDetail', { id, revision: item.revision })}>
      <Text style={s.sectionTitle}>Révision {item.revision} · {item.name}</Text>
      <Text style={s.body}>{timestampLabel(item.recorded_at)} · {item.item_count} articles</Text>
      <Text style={s.note}>{item.status === 'completed' ? 'Terminée' : item.status === 'archived' ? 'Archivée' : item.status === 'active' ? 'En cours' : 'Brouillon'}</Text>
    </Pressable>)}
    {page.items.length < page.total && <RecipeButton title="Voir plus de révisions" variant="neutral" disabled={page.loading} onPress={() => void page.load(true)} />}
  </RecipeScreen>;
}
