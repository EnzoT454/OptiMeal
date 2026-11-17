import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import type { ComponentProps } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { RecipeButton, RecipeScreen, RecipeTitle, recipeColors, recipeStyles as s } from '../components/recipes';
import { useShoppingPage } from '../components/lists/useShoppingPage';
import ListSummaryRow from '../components/lists/ListSummaryRow';
import { useAuth } from '../context/AuthContext';
import { fetchLists } from '../services/shoppingLists';
import { fetchTemplates } from '../services/shoppingReuse';
import type { ShoppingTemplateIcon } from '../types/shoppingLists';
import type { ListStackParams } from '../types/navigation';

const modelIcons: Record<ShoppingTemplateIcon, ComponentProps<typeof MaterialCommunityIcons>['name']> = {
  basket: 'format-list-bulleted', cart: 'clipboard-list-outline', leaf: 'leaf', restaurant: 'silverware-fork-knife', home: 'home-outline',
};
const sectionStyle = {
  gap: 12,
  paddingTop: 16,
  borderTopWidth: 1,
  borderTopColor: recipeColors.border,
};

export default function ListScreen({ navigation }: NativeStackScreenProps<ListStackParams, 'Lists'>) {
  const { session } = useAuth();
  const user = session?.user.id;
  const current = useShoppingPage('lists:current', offset => fetchLists(offset, 'current', undefined, user), item => item.id);
  const history = useShoppingPage('lists:history-preview', offset => fetchLists(offset, 'history', undefined, user, 3), item => item.id);
  const templates = useShoppingPage('templates', offset => fetchTemplates(offset, user), item => item.id);
  if (!session) return null; // The navigator handles sign-in before mounting personal screens.
  return <RecipeScreen>
    <RecipeTitle>Liste</RecipeTitle>
    <RecipeButton title="+ Créer une liste" onPress={() => navigation.navigate('CreateList')} />

    <View style={sectionStyle}>
      <Text accessibilityRole="header" style={s.sectionTitle}>En cours</Text>
      {current.loading && <ActivityIndicator accessibilityLabel="Chargement des listes en cours" color={recipeColors.green} />}
      {!!current.error && <Text accessibilityRole="alert" style={s.requiredItem}>{current.error}</Text>}
      {!current.loading && !current.error && !current.items.length && <Text style={s.body}>Aucune liste en cours.</Text>}
      {current.items.map(list => <ListSummaryRow key={list.id} list={list} onPress={() => navigation.navigate('ShoppingDetail', { id: list.id })} />)}
      {current.error && <RecipeButton title="Réessayer" variant="neutral" disabled={current.loading} onPress={() => void current.load()} />}
      {current.items.length < current.total && <RecipeButton title="Voir plus de listes" variant="neutral" disabled={current.loading} onPress={() => void current.load(true)} />}
    </View>

    <View style={sectionStyle}>
      <View style={s.row}>
        <Text accessibilityRole="header" style={[s.sectionTitle, { flex: 1 }]}>Historique</Text>
        {history.total > 0 && <Pressable accessibilityRole="button" accessibilityLabel="Voir tout l’historique"
          onPress={() => navigation.navigate('History')} style={{ minHeight: 48, paddingHorizontal: 8, justifyContent: 'center' }}>
          <Text style={s.remove}>Voir tout</Text>
        </Pressable>}
      </View>
      {history.loading && <ActivityIndicator accessibilityLabel="Chargement de l’historique" color={recipeColors.green} />}
      {!!history.error && <Text accessibilityRole="alert" style={s.requiredItem}>{history.error}</Text>}
      {!history.loading && !history.error && !history.items.length && <Text style={s.body}>Aucune liste dans l’historique.</Text>}
      {history.items.slice(0, 3).map(list => <ListSummaryRow key={list.id} list={list} onPress={() => navigation.navigate('ShoppingDetail', { id: list.id })} />)}
      {history.error && <RecipeButton title="Réessayer" variant="neutral" disabled={history.loading} onPress={() => void history.load()} />}
    </View>

    <View style={sectionStyle}>
      <Text accessibilityRole="header" style={s.sectionTitle}>Mes modèles</Text>
      {templates.loading && <ActivityIndicator accessibilityLabel="Chargement des modèles" color={recipeColors.green} />}
      {!!templates.error && <Text accessibilityRole="alert" style={s.requiredItem}>{templates.error}</Text>}
      {!templates.loading && !templates.error && !templates.items.length && <Text style={s.body}>Aucun modèle enregistré.</Text>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {templates.items.map(template => <Pressable key={template.id} accessibilityRole="button" accessibilityLabel={`Ouvrir le modèle ${template.name}`}
          onPress={() => navigation.navigate('TemplateDetail', { id: template.id })}
          style={[s.choice, { flexBasis: '45%', flexGrow: 1, alignItems: 'center', gap: 8, paddingVertical: 16 }]}>
          <View style={s.filterCircle}><MaterialCommunityIcons name={modelIcons[template.icon]} size={28} color={recipeColors.green} accessible={false} /></View>
          <Text style={[s.body, { color: recipeColors.ink, textAlign: 'center' }]}>{template.name}</Text>
        </Pressable>)}
      </View>
      {templates.error && <RecipeButton title="Réessayer" variant="neutral" disabled={templates.loading} onPress={() => void templates.load()} />}
      {templates.items.length < templates.total && <RecipeButton title="Voir plus de modèles" variant="neutral" disabled={templates.loading} onPress={() => void templates.load(true)} />}
    </View>
  </RecipeScreen>;
}
