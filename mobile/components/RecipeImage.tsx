import { Image, ImageSourcePropType, StyleSheet, View } from 'react-native';
import { RecipeSummary } from '../types/api';

// Association explicite : le tri et les filtres ne changent pas les illustrations.
const initialImages: Record<string, ImageSourcePropType> = {
  recipe_poulet_riz_brocoli: require('../../data/recipes/images/recette1.png'),
  recipe_pates_boeuf_tomate: require('../../data/recipes/images/recette2.png'),
  recipe_saumon_citron_legumes: require('../../data/recipes/images/recette3.png'),
  recipe_riz_crevettes_legumes: require('../../data/recipes/images/recette4.png'),
  recipe_mijote_pois_chiches_haricots: require('../../data/recipes/images/recette5.png'),
  recipe_omelette_cheddar_tomate: require('../../data/recipes/images/recette6.png'),
  recipe_pates_thon_courgette: require('../../data/recipes/images/recette7.png'),
  recipe_soupe_carotte_pomme_de_terre: require('../../data/recipes/images/recette8.png'),
  recipe_crepes_banane: require('../../data/recipes/images/recette9.png'),
  recipe_yogourt_pomme_banane: require('../../data/recipes/images/recette10.png'),
};

export default function RecipeImage({ recipe }: { recipe: Pick<RecipeSummary, 'id' | 'name' | 'image_url'> }) {
  const source = recipe.image_url ? { uri: recipe.image_url } : initialImages[recipe.id];
  if (!source) return null;
  return <View style={styles.frame}>
    <Image source={source} accessibilityLabel={recipe.name}
      resizeMode="cover" style={styles.image} />
  </View>;
}

const styles = StyleSheet.create({
  frame: { alignSelf: 'stretch', aspectRatio: 4 / 3, borderRadius: 10, overflow: 'hidden' },
  // Annuler les dimensions intrinsèques du PNG : seul le cadre fixe la taille.
  image: { ...StyleSheet.absoluteFill, width: undefined, height: undefined },
});
