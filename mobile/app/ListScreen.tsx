import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useEffect, useState, type ComponentProps } from 'react';
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

export default function ListScreen({ navigation, route }: NativeStackScreenProps<ListStackParams, 'Lists'>) {
  const { session } = useAuth();
  const user = session?.user.id;
  const [section, setSection] = useState<'recent' | 'saved'>('recent');
  useEffect(() => {
    if (route?.params?.section) { setSection(route.params.section); navigation.setParams({ section: undefined }); }
  }, [route?.params?.section, navigation]);
  const current = useShoppingPage('lists:current', offset => fetchLists(offset, 'current', undefined, user, 5), item => item.id);
  const templates = useShoppingPage('templates', offset => fetchTemplates(offset, user), item => item.id);
  if (!session) return null; // The navigator handles sign-in before mounting personal screens.
  return <RecipeScreen>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <RecipeTitle>Listes</RecipeTitle>
      <Pressable accessibilityRole="button" accessibilityLabel="Créer une liste" onPress={() => navigation.navigate('CreateList')}
        style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: recipeColors.green }}>
        <MaterialCommunityIcons name="plus" size={28} color="white" accessible={false} />
      </Pressable>
    </View>
    <View style={{ flexDirection: 'row', padding: 4, gap: 4, borderRadius: 14, backgroundColor: recipeColors.light }}>
      {([{ value: 'recent', label: 'Listes récentes' }, { value: 'saved', label: 'Mes listes' }] as const).map(option =>
        <Pressable key={option.value} accessibilityRole="tab" accessibilityLabel={option.label}
          accessibilityState={{ selected: section === option.value }} onPress={() => setSection(option.value)}
          style={{ flex: 1, minHeight: 48, paddingHorizontal: 6, paddingVertical: 12, borderRadius: 10,
            justifyContent: 'center', alignItems: 'center', backgroundColor: section === option.value ? recipeColors.green : 'transparent' }}>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} maxFontSizeMultiplier={1.2}
            style={[s.body, { fontFamily: 'DMSans_700Bold', textAlign: 'center', color: section === option.value ? 'white' : recipeColors.green }]}>{option.label}</Text>
        </Pressable>)}
    </View>
    {section === 'saved' && <Text style={s.body}>Il s’agit de vos listes sauvegardées.</Text>}

    {section === 'recent' && <>
      <View style={sectionStyle}>
        {current.loading && <ActivityIndicator accessibilityLabel="Chargement des listes en cours" color={recipeColors.green} />}
        {!!current.error && <Text accessibilityRole="alert" style={s.requiredItem}>{current.error}</Text>}
        {!current.loading && !current.error && !current.items.length && <View style={{ gap: 10 }}><Text style={s.body}>Aucune liste pour le moment.</Text><RecipeButton title="Créer ma première liste" onPress={() => navigation.navigate('CreateList')} /></View>}
        {current.items.slice(0, 5).map(list => <ListSummaryRow key={list.id} list={list} onPress={() => navigation.navigate('ShoppingDetail', { id: list.id })} />)}
        {current.error && <RecipeButton title="Réessayer" variant="neutral" disabled={current.loading} onPress={() => void current.load()} />}
        {current.total > 5 && <Pressable accessibilityRole="button" accessibilityLabel="Voir toutes les listes" onPress={() => navigation.navigate('AllLists')}
          style={{ alignSelf: 'flex-start', minHeight: 48, justifyContent: 'center', paddingRight: 16 }}><Text style={s.remove}>Voir tout</Text></Pressable>}
      </View>

    </>}
    {section === 'saved' && <View style={sectionStyle}>
      {templates.loading && <ActivityIndicator accessibilityLabel="Chargement des listes sauvegardées" color={recipeColors.green} />}
      {!!templates.error && <Text accessibilityRole="alert" style={s.requiredItem}>{templates.error}</Text>}
      {!templates.loading && !templates.error && !templates.items.length && <Text style={s.body}>Aucune liste sauvegardée.</Text>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {templates.items.map(template => <Pressable key={template.id} accessibilityRole="button" accessibilityLabel={`Ouvrir la liste sauvegardée ${template.name}`}
          onPress={() => navigation.navigate('TemplateDetail', { id: template.id })}
          style={[s.choice, { flexBasis: '45%', flexGrow: 1, alignItems: 'center', gap: 8, paddingVertical: 16 }]}>
          <View style={s.filterCircle}><MaterialCommunityIcons name={modelIcons[template.icon]} size={28} color={recipeColors.green} accessible={false} /></View>
          <Text style={[s.body, { color: recipeColors.ink, textAlign: 'center' }]}>{template.name}</Text>
          <Text style={[s.note, { color: recipeColors.green }]}>Articles</Text>
        </Pressable>)}
      </View>
      {templates.error && <RecipeButton title="Réessayer" variant="neutral" disabled={templates.loading} onPress={() => void templates.load()} />}
      {templates.items.length < templates.total && <RecipeButton title="Voir plus de listes sauvegardées" variant="neutral" disabled={templates.loading} onPress={() => void templates.load(true)} />}
    </View>}
  </RecipeScreen>;
}
