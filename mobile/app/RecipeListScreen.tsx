import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Message, styles } from '../components/ui';
import { RecipeButton, RecipeChip, RecipeField, RecipeScreen, RecipeTitle, recipeStyles } from '../components/recipes';
import { api } from '../services/api';
import { Page, RecipeSummary } from '../types/api';
import { RecipeStackParams } from '../types/navigation';
import RecipeImage from '../components/RecipeImage';

export default function RecipeListScreen({ navigation }: NativeStackScreenProps<RecipeStackParams, 'List'>) {
  const [query, setQuery] = useState(''); const [filter, setFilter] = useState('Toutes');
  const [items, setItems] = useState<RecipeSummary[]>([]); const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(''); const [retry, setRetry] = useState(0);
  useFocusEffect(useCallback(() => {
    let active = true;
    if (filter === 'Petit budget') { setBusy(false); setError(''); return; }
    setBusy(true); setError('');
    const params = new URLSearchParams({ q: query, limit: '20', offset: String(offset) });
    if (filter === 'Rapides') params.set('quick', 'true');
    if (filter === 'Favoris') params.set('favorites', 'true');
    api<Page<RecipeSummary>>('/api/v1/recipes?' + params).then(result => {
      if (active) { setItems(result.items); setTotal(result.total); }
    }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [query, filter, offset, retry]));
  return <RecipeScreen>
    <RecipeTitle>Recettes</RecipeTitle><Text style={recipeStyles.subtitle}>Vos idées, toujours à portée de main.</Text>
    <RecipeField label="Rechercher" placeholder="Rechercher une recette" value={query} onChangeText={value => { setOffset(0); setQuery(value); }} />
    <View style={recipeStyles.chips}>{['Toutes', 'Favoris', 'Rapides', 'Petit budget'].map(value =>
      <RecipeChip key={value} label={value} selected={filter === value} onPress={() => { setOffset(0); setFilter(value); }} />)}</View>
    <RecipeButton title="+  Ajouter une recette" onPress={() => navigation.navigate('Add')} />
    {filter === 'Petit budget' ? <View style={recipeStyles.notice}>
      <Text style={recipeStyles.sectionTitle}>Petit budget</Text><Text style={recipeStyles.body}>Disponible prochainement.</Text>
    </View> : <>
    <View style={recipeStyles.row}><Text style={[recipeStyles.sectionTitle, { flex: 1 }]}>{filter === 'Favoris' ? 'Mes favoris' : 'Ma collection'}</Text>
      <Text style={recipeStyles.count}>{busy ? '…' : `${total} recette${total > 1 ? 's' : ''}`}</Text></View>
    <Message text={error} />
    {error ? <Button title="Réessayer" onPress={() => setRetry(retry + 1)} /> : busy ? <Text>Chargement…</Text> : <>
      {items.length === 0 && <Text>Aucune recette pour cette recherche.</Text>}
      {items.map(recipe => <View key={recipe.id} style={styles.card}>
        <RecipeImage recipe={recipe} />
        <Text style={{ fontSize: 20, fontWeight: '600' }}>{recipe.name}</Text>
        <Text>{recipe.total_time_minutes} min · {recipe.servings} portions{recipe.is_favorite ? ' · Favori' : ''}</Text>
        <Button title="Voir la recette" onPress={() => navigation.navigate('Detail', { id: recipe.id })} />
      </View>)}
      {offset > 0 && <Button title="Page précédente" onPress={() => setOffset(Math.max(0, offset - 20))} />}
      {offset + 20 < total && <Button title="Page suivante" onPress={() => setOffset(offset + 20)} />}
    </>}</>}
  </RecipeScreen>;
}
