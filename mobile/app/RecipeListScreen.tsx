import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Button, Message, styles } from '../components/ui';
import { RecipeButton, RecipeChip, RecipeField, RecipeScreen, RecipeTitle, recipeColors, recipeStyles } from '../components/recipes';
import { api } from '../services/api';
import { Page, RecipeScope, RecipeSummary, RecipeSort } from '../types/api';
import { RecipeStackParams } from '../types/navigation';
import RecipeImage from '../components/RecipeImage';
import { useAuth } from '../context/AuthContext';

type Section = Exclude<RecipeScope, 'accessible'>;
const sections: { value: Section; label: string }[] = [
  { value: 'discover', label: 'Découvrir' },
  { value: 'mine', label: 'Mes recettes' },
  { value: 'favorites', label: 'Favoris' },
];
const filters = [
  { label: 'Toutes', icon: 'view-grid-outline' },
  { label: 'Rapides', icon: 'timer-outline' },
  { label: 'Faciles', icon: 'egg-pan' },
  { label: 'Petit budget', icon: 'piggy-bank-outline' },
] as const;

export default function RecipeListScreen({ navigation }: NativeStackScreenProps<RecipeStackParams, 'List'>) {
  const { session, requestSignIn } = useAuth();
  const [query, setQuery] = useState(''); const [filter, setFilter] = useState('Toutes');
  const [items, setItems] = useState<RecipeSummary[]>([]); const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0); const [busy, setBusy] = useState(true);
  const [error, setError] = useState(''); const [retry, setRetry] = useState(0);
  const [section, setSection] = useState<Section>('discover');
  const [sorts, setSorts] = useState<Record<Section, RecipeSort>>({ discover: 'top', mine: 'newest', favorites: 'top' });
  const [pendingFavorites, setPendingFavorites] = useState<Set<string>>(new Set());
  const [favoriteError, setFavoriteError] = useState('');
  const favoriteRequests = useRef(new Set<string>());
  const activeView = useRef<object | null>(null);
  const activeSection = session ? section : 'discover';
  const activeSort = sorts[activeSection];
  const sortOptions: { value: RecipeSort; label: string }[] =
    [{ value: 'top', label: 'Mieux notées' }, { value: 'newest', label: 'Plus récentes' }];
  function resetResults() { setItems([]); setTotal(0); setError(''); setBusy(true); setOffset(0); }
  function selectSection(value: Section) {
    if (value !== 'discover' && !session) {
      requestSignIn(value === 'mine' ? 'Connecte-toi pour retrouver les recettes que tu as créées.' : 'Connecte-toi pour retrouver tes recettes favorites.');
      return;
    }
    if (value === activeSection) return;
    resetResults(); setSection(value);
  }
  function addRecipe() {
    if (!session) { requestSignIn('Connecte-toi pour ajouter tes propres recettes.'); return; }
    navigation.navigate('Add');
  }
  async function toggleFavorite(recipe: RecipeSummary) {
    if (!session) { requestSignIn('Connecte-toi pour enregistrer tes recettes favorites.'); return; }
    if (favoriteRequests.current.has(recipe.id)) return;
    const view = activeView.current;
    favoriteRequests.current.add(recipe.id);
    setPendingFavorites(new Set(favoriteRequests.current)); setFavoriteError('');
    try {
      await api<void>(`/api/v1/recipes/${recipe.id}/favorite`, { method: recipe.is_favorite ? 'DELETE' : 'PUT' });
      if (activeView.current !== view) {
        // Une nouvelle section a pu être chargée pendant l’écriture.
        if (activeView.current) setRetry(value => value + 1);
        return;
      }
      if (activeSection === 'favorites' && recipe.is_favorite) {
        if (items.length === 1 && offset > 0) setOffset(value => Math.max(0, value - 20));
        setRetry(value => value + 1);
      } else {
        setItems(previous => previous.map(item => item.id === recipe.id ? { ...item, is_favorite: !recipe.is_favorite } : item));
      }
    } catch (e) {
      if (activeView.current === view) setFavoriteError((e as Error).message);
    } finally {
      favoriteRequests.current.delete(recipe.id);
      if (activeView.current) setPendingFavorites(new Set(favoriteRequests.current));
    }
  }
  useFocusEffect(useCallback(() => {
    let active = true;
    const view = {};
    activeView.current = view;
    setPendingFavorites(new Set(favoriteRequests.current)); setFavoriteError('');
    const cleanup = () => { active = false; if (activeView.current === view) activeView.current = null; };
    if (filter === 'Petit budget') { setBusy(false); setError(''); return cleanup; }
    setBusy(true); setError('');
    const params = new URLSearchParams({ scope: activeSection, sort: activeSort, q: query, limit: '20', offset: String(offset) });
    if (filter === 'Rapides') params.set('quick', 'true');
    if (filter === 'Faciles') params.set('easy', 'true');
    api<Page<RecipeSummary>>('/api/v1/recipes?' + params).then(result => {
      if (active) { setItems(result.items); setTotal(result.total); }
    }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setBusy(false); });
    return cleanup;
  }, [query, filter, offset, retry, activeSection, activeSort, session?.user.id]));
  return <RecipeScreen>
    <RecipeTitle>Recettes</RecipeTitle>
    <View style={{ flexDirection: 'row', padding: 4, gap: 4, borderRadius: 14, backgroundColor: recipeColors.light }}>
      {sections.map(option => <Pressable key={option.value} accessibilityRole="tab" accessibilityLabel={option.label}
        accessibilityState={{ selected: activeSection === option.value }} onPress={() => selectSection(option.value)}
        style={{ flex: 1, minHeight: 48, paddingHorizontal: 6, paddingVertical: 12, borderRadius: 10,
          justifyContent: 'center', alignItems: 'center', backgroundColor: activeSection === option.value ? recipeColors.green : 'transparent' }}>
        <Text style={[recipeStyles.body, { fontFamily: 'DMSans_700Bold', textAlign: 'center', color: activeSection === option.value ? 'white' : recipeColors.green }]}>{option.label}</Text>
      </Pressable>)}
    </View>
    <RecipeField label="Rechercher" placeholder={activeSection === 'mine' ? 'Rechercher dans mes recettes' : activeSection === 'favorites' ? 'Rechercher dans mes favoris' : 'Rechercher une recette publique'}
      value={query} onChangeText={value => { if (value !== query) { resetResults(); setQuery(value); } }} />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }}
      contentContainerStyle={{ paddingHorizontal: 20, gap: 6 }}>
      {filters.map(option => <RecipeChip key={option.label} label={option.label} icon={option.icon}
        selected={filter === option.label} onPress={() => {
          if (option.label !== filter) { resetResults(); setFilter(option.label); }
        }} />)}
    </ScrollView>
    <RecipeButton title="+  Ajouter une recette" onPress={addRecipe} />
    {filter === 'Petit budget' ? <View style={recipeStyles.notice}>
      <Text style={recipeStyles.sectionTitle}>Petit budget</Text><Text style={recipeStyles.body}>Disponible prochainement.</Text>
    </View> : <>
    <View style={recipeStyles.row}><Text style={[recipeStyles.sectionTitle, { flex: 1 }]}>{activeSection === 'discover' ? 'Recettes à découvrir' : activeSection === 'mine' ? 'Mes recettes' : 'Mes favoris'}</Text>
      <Text style={recipeStyles.count}>{busy ? '…' : `${total} recette${total > 1 ? 's' : ''}`}</Text></View>
    {activeSection !== 'mine' && <View accessibilityRole="radiogroup" accessibilityLabel="Trier les recettes" style={recipeStyles.chips}>
      {sortOptions.map(option => <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={option.label}
        accessibilityState={{ checked: activeSort === option.value }} onPress={() => {
          if (activeSort !== option.value) { resetResults(); setSorts(previous => ({ ...previous, [activeSection]: option.value })); }
        }} style={[recipeStyles.chip, { minHeight: 44, justifyContent: 'center' }, activeSort === option.value && { backgroundColor: recipeColors.green }]}>
        <Text style={[recipeStyles.chipText, activeSort === option.value && { color: 'white' }]}>{option.label}</Text>
      </Pressable>)}
    </View>}
    <Message text={error} />
    <Message text={favoriteError} />
    {error ? <Button title="Réessayer" onPress={() => setRetry(retry + 1)} /> : busy ? <Text>Chargement…</Text> : <>
      {items.length === 0 && <View style={recipeStyles.notice}>
        {query.trim() || filter !== 'Toutes' ? <>
          <Text style={recipeStyles.body}>Aucune recette trouvée avec cette recherche ou ces filtres.</Text>
          <RecipeButton title="Effacer la recherche et les filtres" variant="neutral" onPress={() => { resetResults(); setQuery(''); setFilter('Toutes'); }} />
        </> : offset > 0 ? <Text style={recipeStyles.body}>Aucune recette sur cette page.</Text> : activeSection === 'mine' ? <>
          <Text style={recipeStyles.body}>Tu n’as pas encore créé de recette.</Text>
          <RecipeButton title="Ajouter ma première recette" onPress={addRecipe} />
        </> : activeSection === 'favorites' ? <>
          <Text style={recipeStyles.body}>Ajoute les recettes qui te plaisent aux favoris pour les retrouver ici.</Text>
          <RecipeButton title="Découvrir des recettes" variant="neutral" onPress={() => selectSection('discover')} />
        </> : <Text style={recipeStyles.body}>Aucune recette publique à découvrir pour le moment.</Text>}
      </View>}
      {items.map(recipe => {
        const rating = recipe.rating.count === 0 ? 'Non notée' :
          Number(recipe.rating.average).toLocaleString('fr-CA', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
        const author = recipe.is_owned ? 'Par vous' : recipe.published_at ? 'Par la communauté' : 'Par OptiMeal';
        const metadata = [
          { icon: 'clock-outline', text: `${recipe.total_time_minutes} min` },
          { icon: 'account-group-outline', text: `${recipe.servings} pers.` },
          { icon: 'basket-outline', text: `${recipe.ingredient_count ?? '—'} ingr.` },
          { icon: 'format-list-numbered', text: `${recipe.step_count ?? '—'} étapes` },
        ] as const;
        return <View key={recipe.id} style={[styles.card, { padding: 0, borderRadius: 16, gap: 0 }]}>
        <Pressable accessibilityRole="button"
        accessibilityLabel={`Ouvrir la recette : ${recipe.name}. ${recipe.total_time_minutes} minutes, ${recipe.servings} portions. ${recipe.ingredient_count ?? 'Nombre inconnu d’'} ingrédients, ${recipe.step_count ?? 'nombre inconnu d’'} étapes. ${recipe.rating.count === 0 ? 'Pas encore évaluée.' : `${rating} sur 5, ${recipe.rating.count} évaluations.`} ${author}.${recipe.is_favorite ? ' En favori.' : ''}${activeSection === 'mine' ? recipe.visibility === 'public' ? ' Publique.' : ' Privée.' : ''}`}
        onPress={() => navigation.navigate('Detail', { id: recipe.id })}
        style={({ pressed }) => [{ padding: 14, borderRadius: 16, gap: 12 }, pressed && { opacity: 0.8 }]}>
        <View style={{ aspectRatio: 16 / 9, backgroundColor: recipeColors.light, borderRadius: 10, overflow: 'hidden' }}>
          <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
            <MaterialCommunityIcons name="silverware-fork-knife" size={32} color={recipeColors.muted} accessible={false} />
          </View>
          <RecipeImage recipe={recipe} aspectRatio={16 / 9} />
        </View>
        <Text numberOfLines={2} style={{ fontFamily: 'DMSans_700Bold', fontSize: 19, lineHeight: 25, color: recipeColors.ink }}>{recipe.name}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 8 }}>
          {metadata.map(item => <View key={item.icon} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <MaterialCommunityIcons name={item.icon} size={16} color={recipeColors.muted} accessible={false} />
            <Text style={recipeStyles.note}>{item.text}</Text>
          </View>)}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8,
          paddingTop: 10, borderTopWidth: 1, borderTopColor: recipeColors.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexGrow: 1, flexShrink: 1, flexBasis: 110 }}>
            {activeSection === 'mine' && <MaterialCommunityIcons name={recipe.visibility === 'public' ? 'earth' : 'lock-outline'}
              size={14} color={recipeColors.muted} accessible={false} />}
            <Text style={[recipeStyles.note, { flexShrink: 1 }]}>{author}{activeSection === 'mine' ? recipe.visibility === 'public' ? ' · Publique' : ' · Privée' : ''}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
            <MaterialCommunityIcons name={recipe.rating.count === 0 ? 'star-outline' : 'star'} size={17}
              color={recipe.rating.count === 0 ? recipeColors.muted : recipeColors.green} accessible={false} />
            <Text style={[recipeStyles.note, { color: recipeColors.ink, fontFamily: 'DMSans_700Bold' }]}>{rating}</Text>
            {recipe.rating.count > 0 && <Text style={recipeStyles.note}>{`(${recipe.rating.count})`}</Text>}
          </View>
        </View>
      </Pressable>
        <Pressable accessibilityRole="button"
          accessibilityLabel={`${recipe.is_favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'} : ${recipe.name}`}
          accessibilityState={{ selected: recipe.is_favorite, disabled: pendingFavorites.has(recipe.id), busy: pendingFavorites.has(recipe.id) }}
          disabled={pendingFavorites.has(recipe.id)} onPress={() => void toggleFavorite(recipe)}
          style={({ pressed }) => ({ position: 'absolute', top: 22, right: 22, width: 48, height: 48, borderRadius: 24,
            alignItems: 'center', justifyContent: 'center', backgroundColor: 'white',
            borderWidth: 1, borderColor: recipeColors.border, opacity: pressed ? 0.75 : 1 })}>
          {pendingFavorites.has(recipe.id) ? <ActivityIndicator size="small" color={recipeColors.green} /> :
            <MaterialCommunityIcons name={recipe.is_favorite ? 'heart' : 'heart-outline'} size={24} color={recipeColors.green} accessible={false} />}
        </Pressable>
      </View>;
      })}
      {offset > 0 && <Button title="Page précédente" onPress={() => { setItems([]); setBusy(true); setOffset(Math.max(0, offset - 20)); }} />}
      {offset + 20 < total && <Button title="Page suivante" onPress={() => { setItems([]); setBusy(true); setOffset(offset + 20); }} />}
    </>}</>}
  </RecipeScreen>;
}
