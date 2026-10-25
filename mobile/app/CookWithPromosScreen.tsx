import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Message } from '../components/ui';
import { RecipeButton, RecipeScreen, RecipeTitle, recipeColors, recipeStyles } from '../components/recipes';
import RecipeImage from '../components/RecipeImage';
import { currentPrice, discount, fetchPromos, money, storeName } from '../components/promos';
import { api } from '../services/api';
import type { Detail, Offer, Page, Recipe, RecipeSummary } from '../types/api';
import { PromoStackParams } from '../types/navigation';

// Une recette et les promos qui correspondent à ses ingrédients.
type Match = { recipe: Recipe; offers: Offer[] };

// Toutes les recettes visibles par l'utilisateur, page par page (20 à la fois, comme l'écran Recettes).
async function fetchAllRecipes() {
  const summaries: RecipeSummary[] = [];
  let total = 1;
  while (summaries.length < total) {
    const page = await api<Page<RecipeSummary>>(`/api/v1/recipes?limit=20&offset=${summaries.length}`);
    summaries.push(...page.items);
    total = page.total;
    if (page.items.length === 0) break;
  }
  // La liste ne contient pas les ingrédients : on lit le détail de chaque recette.
  return Promise.all(summaries.map(s => api<Detail<Recipe>>('/api/v1/recipes/' + s.id).then(d => d.item)));
}

// Pour chaque ingrédient, la promo la moins chère (tous magasins confondus).
function bestOfferByIngredient(offers: Offer[]) {
  const best = new Map<string, Offer>();
  for (const offer of offers) {
    const current = best.get(offer.ingredient_id);
    if (!current || Number(currentPrice(offer)) < Number(currentPrice(current))) best.set(offer.ingredient_id, offer);
  }
  return best;
}

export default function CookWithPromosScreen({ navigation }: NativeStackScreenProps<PromoStackParams, 'Cook'>) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true); setError('');
    Promise.all([fetchPromos(), fetchAllRecipes()]).then(([offers, recipes]) => {
      if (!active) return;
      const best = bestOfferByIngredient(offers);
      const found = recipes
        .map(recipe => {
          const ids = [...new Set(recipe.ingredients.map(i => i.ingredient_id))];
          return { recipe, offers: ids.map(id => best.get(id)).filter((o): o is Offer => !!o) };
        })
        .filter(m => m.offers.length > 0)
        // D'abord les recettes avec le plus d'ingrédients en promo.
        .sort((a, b) => b.offers.length - a.offers.length || a.recipe.name.localeCompare(b.recipe.name));
      setMatches(found);
    }).catch(e => {
      if (active) setError(e instanceof Error ? e.message : 'Impossible de charger les recettes.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]));

  // Ouvre la recette dans l'onglet Recettes (écran de ton collègue, sans le modifier).
  const openRecipe = (id: string) =>
    navigation.getParent()?.navigate('Recettes', { screen: 'Detail', params: { id }, initial: false });

  return <RecipeScreen>
    <RecipeTitle onBack={() => navigation.goBack()}>Cuisiner avec les promos</RecipeTitle>
    <Text style={recipeStyles.subtitle}>Des recettes qui profitent des rabais de la semaine.</Text>

    {loading ? <ActivityIndicator color={recipeColors.green} style={{ marginTop: 24 }} />
      : error ? <View style={recipeStyles.notice}>
        <Message text={error} />
        <RecipeButton title="Réessayer" onPress={() => setRetry(retry + 1)} />
      </View>
      : matches.length === 0 ? <View style={recipeStyles.notice}>
        <Text style={recipeStyles.sectionTitle}>Aucune recette pour l’instant</Text>
        <Text style={recipeStyles.body}>Aucun ingrédient de tes recettes n’est en promo cette semaine.</Text>
      </View>
      : <>
        <Text style={recipeStyles.body}>{matches.length} recette{matches.length > 1 ? 's' : ''} avec des ingrédients en promo</Text>
        {matches.map(m => <RecipeCard key={m.recipe.id} match={m} onPress={() => openRecipe(m.recipe.id)} />)}
        <Text style={recipeStyles.note}>Pour chaque ingrédient, on affiche la promo la moins chère.</Text>
      </>}
  </RecipeScreen>;
}

function RecipeCard({ match, onPress }: { match: Match; onPress: () => void }) {
  const { recipe, offers } = match;
  const count = recipe.ingredients.length;
  return <Pressable accessibilityRole="button" accessibilityHint="Ouvre la recette" onPress={onPress} style={styles.card}>
    <RecipeImage recipe={recipe} />
    <Text style={styles.name}>{recipe.name}</Text>
    <Text style={recipeStyles.body}>
      {recipe.total_time_minutes} min · {recipe.servings} portions · {offers.length} ingrédient{offers.length > 1 ? 's' : ''} en promo sur {count}
    </Text>
    {offers.map(o => {
      const percent = discount(o);
      return <View key={o.id} style={styles.offerRow}>
        <Text style={styles.store}>{storeName(o.retailer).toUpperCase()}</Text>
        <Text style={styles.offerName} numberOfLines={1}>{o.product_name}</Text>
        <Text style={styles.offerPrice}>{money(currentPrice(o))}{percent != null ? `  −${percent} %` : ''}</Text>
      </View>;
    })}
  </Pressable>;
}

const styles = StyleSheet.create({
  card: { gap: 8, backgroundColor: 'white', borderRadius: 16, padding: 16 },
  name: { fontFamily: 'DMSans_700Bold', fontSize: 18, lineHeight: 24, color: recipeColors.ink },
  offerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: recipeColors.light, borderRadius: 10, padding: 10 },
  store: { fontFamily: 'DMSans_700Bold', fontSize: 11, lineHeight: 14, color: recipeColors.green, letterSpacing: 0.5 },
  offerName: { flex: 1, fontFamily: 'DMSans_500Medium', fontSize: 14, lineHeight: 18, color: recipeColors.ink },
  offerPrice: { fontFamily: 'DMSans_700Bold', fontSize: 14, lineHeight: 18, color: recipeColors.green },
});