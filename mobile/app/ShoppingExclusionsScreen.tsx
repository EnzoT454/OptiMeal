import { ActivityIndicator, Text, View } from 'react-native';
import { RecipeButton, RecipeScreen, RecipeTitle, recipeStyles as s } from '../components/recipes';
import { useAuth } from '../context/AuthContext';
import { useShoppingPage } from '../components/lists/useShoppingPage';
import { useListCommand } from '../components/lists/useListCommand';
import { exclusionsPath, fetchExclusions } from '../services/shoppingReuse';
import { listCommand } from '../services/shoppingLists';
import type { ShoppingExclusionRead } from '../types/shoppingLists';

export default function ShoppingExclusionsScreen() {
  const { session, requestSignIn } = useAuth();
  const page = useShoppingPage('exclusions', fetchExclusions, item => item.ingredient_id);
  const command = useListCommand<ShoppingExclusionRead>('exclusions');
  async function remove(id: string) {
    const result = await command.run(command.pending ?? listCommand(`${exclusionsPath}/${id}`, { excluded: false }, 'PUT'));
    if (result) void page.load();
  }
  return <RecipeScreen><RecipeTitle>Ingrédients non suggérés</RecipeTitle>
    <Text style={s.body}>Ces ingrédients sont exclus des prochaines listes générées depuis ton calendrier. Tes listes et modèles existants restent inchangés. Tu peux toujours les ajouter manuellement.</Text>
    {!session ? <RecipeButton title="Me connecter" onPress={() => requestSignIn('Connecte-toi pour gérer les ingrédients non suggérés.')} /> : <>
      <RecipeButton title="Actualiser" variant="neutral" disabled={page.loading || command.busy} onPress={() => void page.load()} />
      {(page.loading || command.busy) && <ActivityIndicator accessibilityLabel="Chargement des préférences" />}
      {!!(page.error || command.error) && <Text accessibilityRole="alert" style={s.requiredItem}>{page.error || command.error}</Text>}
      {command.pending && <RecipeButton title="Reprendre la préférence" disabled={command.busy} onPress={() => void remove('')} />}
      {!page.items.length && !page.loading && !page.error && <Text style={s.body}>Aucun ingrédient exclu. Utilise « Ne plus suggérer » dans la fiche d’un article identifié.</Text>}
      {page.items.map(item => <View key={item.ingredient_id} style={s.choice}>
        <Text style={s.sectionTitle}>{item.name}</Text>
        <RecipeButton title={`Suggérer à nouveau ${item.name}`} variant="neutral" disabled={command.locked || page.loading} onPress={() => void remove(item.ingredient_id)} />
      </View>)}
      {page.items.length < page.total && <RecipeButton title="Voir plus d’ingrédients" variant="neutral" disabled={page.loading} onPress={() => void page.load(true)} />}
    </>}
  </RecipeScreen>;
}
