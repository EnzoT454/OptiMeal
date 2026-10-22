import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Text } from 'react-native';
import { RecipeStackParams } from '../types/navigation';
import { RecipeChoice, RecipeScreen, RecipeTitle, recipeStyles, showRecipeComingSoon } from '../components/recipes';

export default function AddRecipeScreen({ navigation }: NativeStackScreenProps<RecipeStackParams, 'Add'>) {
  return <RecipeScreen>
    <RecipeTitle onBack={() => navigation.goBack()}>Ajouter une recette</RecipeTitle>
    <Text style={recipeStyles.intro}>Une recette à vous, une envie ou ce qui reste au frigo.</Text>
    <RecipeChoice title="Entrer manuellement" description="Remplissez le formulaire ou faites structurer votre texte."
      icon="book" onPress={() => navigation.navigate('ManualEntry')} />
    <RecipeChoice title="Trouver une idée" description="Décrivez votre envie. Nous vous proposons des plats."
      icon="search" onPress={() => showRecipeComingSoon('Trouver une idée')} />
    <RecipeChoice title="Cuisiner avec ce que j’ai" description="Partez des ingrédients déjà à la maison."
      icon="leaf" onPress={() => showRecipeComingSoon('Cuisiner avec ce que j’ai')} />
    <Text style={recipeStyles.note}>Vérifiez et corrigez chaque proposition avant de l’enregistrer.</Text>
  </RecipeScreen>;
}
