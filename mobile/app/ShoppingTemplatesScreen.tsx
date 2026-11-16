import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RecipeButton, RecipeScreen, RecipeTitle, recipeStyles as s } from '../components/recipes';
import { useShoppingPage } from '../components/lists/useShoppingPage';
import { useAuth } from '../context/AuthContext';
import { fetchTemplates, templateIcons } from '../services/shoppingReuse';
import type { ListStackParams } from '../types/navigation';

export default function ShoppingTemplatesScreen({ navigation }: NativeStackScreenProps<ListStackParams, 'Templates'>) {
  const { session, requestSignIn } = useAuth();
  const page = useShoppingPage('templates', fetchTemplates, item => item.id);
  return <RecipeScreen><RecipeTitle>Mes modèles</RecipeTitle>
    <Text style={s.body}>Enregistre les besoins d’une liste depuis ses options. Chaque utilisation crée une liste indépendante, sans achats, possession ou anciens prix.</Text>
    {!session ? <RecipeButton title="Me connecter" onPress={() => requestSignIn('Connecte-toi pour retrouver tes modèles privés.')} /> : <>
      <RecipeButton title="Actualiser" variant="neutral" disabled={page.loading} onPress={() => void page.load()} />
      {page.loading && <ActivityIndicator accessibilityLabel="Chargement des modèles" />}
      {!!page.error && <Text accessibilityRole="alert" style={s.requiredItem}>{page.error}</Text>}
      {!page.items.length && !page.loading && !page.error && <Text style={s.body}>Aucun modèle enregistré.</Text>}
      {page.items.map(template => <Pressable key={template.id} accessibilityRole="button" accessibilityLabel={`Ouvrir le modèle ${template.name}`}
        style={s.choice} onPress={() => navigation.navigate('TemplateDetail', { id: template.id })}>
        <View style={s.row}><Text accessible={false} style={s.sectionTitle}>{templateIcons[template.icon]}</Text><Text style={s.sectionTitle}>{template.name}</Text></View>
        <Text style={s.note}>{template.items.length} articles · révision {template.revision}</Text>
      </Pressable>)}
      {page.items.length < page.total && <RecipeButton title="Voir plus de modèles" variant="neutral" disabled={page.loading} onPress={() => void page.load(true)} />}
    </>}
  </RecipeScreen>;
}
