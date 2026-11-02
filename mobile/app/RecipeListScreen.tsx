import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Message, styles } from '../components/ui';
import { RecipeButton, RecipeChip, RecipeField, RecipeScreen, RecipeTitle, recipeColors, recipeStyles } from '../components/recipes';
import { api } from '../services/api';
import { Page, RecipeScope, RecipeSummary } from '../types/api';
import { RecipeStackParams } from '../types/navigation';
import RecipeImage from '../components/RecipeImage';
import { useAuth } from '../context/AuthContext';

type Section = Exclude<RecipeScope, 'accessible'>;
const sections: { value: Section; label: string }[] = [
  { value: 'discover', label: 'Découvrir' },
  { value: 'mine', label: 'Mes recettes' },
  { value: 'favorites', label: 'Favoris' },
];

export default function RecipeListScreen({ navigation }: NativeStackScreenProps<RecipeStackParams, 'List'>) {
  const { session, requestSignIn } = useAuth();
  const [query, setQuery] = useState(''); const [filter, setFilter] = useState('Toutes');
  const [items, setItems] = useState<RecipeSummary[]>([]); const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0); const [busy, setBusy] = useState(true);
  const [error, setError] = useState(''); const [retry, setRetry] = useState(0);
  const [section, setSection] = useState<Section>('discover');
  const activeSection = session ? section : 'discover';
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
  useFocusEffect(useCallback(() => {
    let active = true;
    if (filter === 'Petit budget') { setBusy(false); setError(''); return; }
    setBusy(true); setError('');
    const params = new URLSearchParams({ scope: activeSection, q: query, limit: '20', offset: String(offset) });
    if (filter === 'Rapides') params.set('quick', 'true');
    api<Page<RecipeSummary>>('/api/v1/recipes?' + params).then(result => {
      if (active) { setItems(result.items); setTotal(result.total); }
    }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [query, filter, offset, retry, activeSection, session?.user.id]));
  return <RecipeScreen>
    <RecipeTitle>Recettes</RecipeTitle><Text style={recipeStyles.subtitle}>Vos idées, toujours à portée de main.</Text>
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
    <View style={recipeStyles.chips}>{['Toutes', 'Rapides', 'Petit budget'].map(value =>
      <RecipeChip key={value} label={value} selected={filter === value} onPress={() => {
        if (value !== filter) { resetResults(); setFilter(value); }
      }} />)}</View>
    <RecipeButton title="+  Ajouter une recette" onPress={addRecipe} />
    {filter === 'Petit budget' ? <View style={recipeStyles.notice}>
      <Text style={recipeStyles.sectionTitle}>Petit budget</Text><Text style={recipeStyles.body}>Disponible prochainement.</Text>
    </View> : <>
    <View style={recipeStyles.row}><Text style={[recipeStyles.sectionTitle, { flex: 1 }]}>{activeSection === 'discover' ? 'Recettes à découvrir' : activeSection === 'mine' ? 'Mes recettes' : 'Mes favoris'}</Text>
      <Text style={recipeStyles.count}>{busy ? '…' : `${total} recette${total > 1 ? 's' : ''}`}</Text></View>
    <Message text={error} />
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
      {items.map(recipe => <View key={recipe.id} style={styles.card}>
        <RecipeImage recipe={recipe} />
        <Text style={{ fontSize: 20, fontWeight: '600' }}>{recipe.name}</Text>
        <Text>{recipe.total_time_minutes} min · {recipe.servings} portions{recipe.is_favorite ? ' · Favori' : ''}</Text>
        <Text style={recipeStyles.note}>{recipe.is_owned ? 'Par vous' : recipe.published_at ? 'Par la communauté' : 'Par OptiMeal'}</Text>
        {activeSection === 'mine' && <View style={recipeStyles.chips}><RecipeChip label={recipe.visibility === 'public' ? 'Publique' : 'Privée'} /></View>}
        <Button title="Voir la recette" onPress={() => navigation.navigate('Detail', { id: recipe.id })} />
      </View>)}
      {offset > 0 && <Button title="Page précédente" onPress={() => { setItems([]); setBusy(true); setOffset(Math.max(0, offset - 20)); }} />}
      {offset + 20 < total && <Button title="Page suivante" onPress={() => { setItems([]); setBusy(true); setOffset(offset + 20); }} />}
    </>}</>}
  </RecipeScreen>;
}
