import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Text } from 'react-native';
import { RecipeStackParams } from '../types/navigation';
import { RecipeChoice, RecipeScreen, RecipeTitle, recipeStyles, showRecipeComingSoon } from '../components/recipes';

export default function ManualEntryScreen({ navigation }: NativeStackScreenProps<RecipeStackParams, 'ManualEntry'>) {
  return <RecipeScreen compact>
    <RecipeTitle onBack={() => navigation.goBack()}>Entrer manuellement</RecipeTitle>
    <Text style={recipeStyles.intro}>Choisissez comment saisir votre recette.</Text>
    <RecipeChoice title="Remplir le formulaire" description="Saisissez le nom, les ingrédients et les étapes dans les champs."
      icon="book" spacious onPress={() => navigation.navigate('Editor')} />
    <RecipeChoice title="Structurer mon idée" description="Décrivez les ingrédients et les étapes. L’IA les organise dans le même formulaire."
      icon="book" spacious onPress={() => showRecipeComingSoon('Structurer mon idée')} />
    <Text style={recipeStyles.note}>Vérifiez et corrigez chaque proposition avant de l’enregistrer.</Text>
  </RecipeScreen>;
}
