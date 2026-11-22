import { useCallback } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { RecipeButton, RecipeScreen, recipeColors, recipeStyles as s } from '../components/recipes';
import { useAuth } from '../context/AuthContext';
import { useShoppingPage } from '../components/lists/useShoppingPage';
import { useListCommand } from '../components/lists/useListCommand';
import { exclusionsPath, fetchExclusions } from '../services/shoppingReuse';
import { listCommand } from '../services/shoppingLists';
import type { ShoppingExclusionRead } from '../types/shoppingLists';

// Ingrédients que l'app n'ajoute plus automatiquement aux listes.
// Le titre est déjà dans la barre du haut ; l'écran se recharge à chaque ouverture (plus de bouton Actualiser).
export default function ShoppingExclusionsScreen() {
  const { session, requestSignIn } = useAuth();
  const page = useShoppingPage('exclusions', fetchExclusions, item => item.ingredient_id);
  const command = useListCommand<ShoppingExclusionRead>('exclusions');

  useFocusEffect(useCallback(() => {
    if (session) void page.load();
  }, [session?.user.id]));

  async function remove(id: string) {
    const result = await command.run(command.pending ?? listCommand(`${exclusionsPath}/${id}`, { excluded: false }, 'PUT'));
    if (result) void page.load();
  }

  const occupe = page.loading || command.busy;

  return <RecipeScreen avecEntete>
    <Text style={s.body}>Ces ingrédients ne sont plus ajoutés automatiquement à tes listes.</Text>

    {!session ? <RecipeButton title="Me connecter" onPress={() => requestSignIn('Connecte-toi pour gérer les ingrédients non suggérés.')} /> : <>
      {occupe && <ActivityIndicator accessibilityLabel="Chargement des préférences" color={recipeColors.green} />}
      {!!(page.error || command.error) && <Text accessibilityRole="alert" style={s.requiredItem}>{page.error || command.error}</Text>}
      {!!page.error && <RecipeButton title="Réessayer" variant="neutral" disabled={occupe} onPress={() => void page.load()} />}
      {command.pending && <RecipeButton title="Reprendre la préférence" disabled={command.busy} onPress={() => void remove('')} />}

      {!page.items.length && !page.loading && !page.error &&
        <Text style={s.note}>Aucun ingrédient pour l’instant. Dans une liste, touche un article puis « Ne plus suggérer ».</Text>}

      {/* Une ligne par ingrédient, avec « Rétablir » à droite */}
      {page.items.length > 0 && <View style={{ backgroundColor: 'white', borderRadius: 16, paddingHorizontal: 16 }}>
        {page.items.map((item, index) => <View key={item.ingredient_id} style={{
          flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52,
          borderTopWidth: index > 0 ? 1 : 0, borderTopColor: recipeColors.border,
        }}>
          <MaterialCommunityIcons name="cancel" size={20} color={recipeColors.muted} accessible={false} />
          <Text style={[s.body, { flex: 1, color: recipeColors.ink }]} numberOfLines={1}>{item.name}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`Suggérer à nouveau ${item.name}`}
            disabled={command.locked || page.loading} hitSlop={10} onPress={() => void remove(item.ingredient_id)}
            style={({ pressed }) => ({ paddingVertical: 8, opacity: pressed || command.locked || page.loading ? 0.5 : 1 })}>
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 15, lineHeight: 20, color: recipeColors.green }}>Rétablir</Text>
          </Pressable>
        </View>)}
      </View>}

      {page.items.length < page.total && <RecipeButton title="Voir plus d’ingrédients" variant="neutral" disabled={page.loading} onPress={() => void page.load(true)} />}
    </>}
  </RecipeScreen>;
}