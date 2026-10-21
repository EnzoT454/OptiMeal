import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Field, Heading, Message, Screen, styles } from '../components/ui';
import { api } from '../services/api';
import { Page, RecipeSummary } from '../types/api';
import { RecipeStackParams } from '../types/navigation';

export default function RecipeListScreen({ navigation }: NativeStackScreenProps<RecipeStackParams, 'List'>) {
  const [query, setQuery] = useState(''); const [filter, setFilter] = useState('Toutes');
  const [items, setItems] = useState<RecipeSummary[]>([]); const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(''); const [retry, setRetry] = useState(0);
  useFocusEffect(useCallback(() => {
    let active = true;
    setBusy(true); setError('');
    const params = new URLSearchParams({ q: query, limit: '20', offset: String(offset) });
    if (filter === 'Rapides') params.set('quick', 'true');
    if (filter === 'Favoris') params.set('favorites', 'true');
    api<Page<RecipeSummary>>('/api/v1/recipes?' + params).then(result => {
      if (active) { setItems(result.items); setTotal(result.total); }
    }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [query, filter, offset, retry]));
  return <Screen><Heading>Mes recettes</Heading><Text>Les recettes de départ et tes créations.</Text>
    <Button title="Créer une recette" onPress={() => navigation.navigate('Editor')} />
    <Field label="Rechercher une recette" value={query} onChangeText={value => { setOffset(0); setQuery(value); }} />
    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>{['Toutes', 'Favoris', 'Rapides'].map(value =>
      <Button key={value} title={(filter === value ? '✓ ' : '') + value} onPress={() => { setOffset(0); setFilter(value); }} />)}</View>
    <Text>Petit budget sera disponible avec les prix des produits.</Text><Message text={error} />
    {error ? <Button title="Réessayer" onPress={() => setRetry(retry + 1)} /> : busy ? <Text>Chargement…</Text> : <>
      <Text>{total} recette{total > 1 ? 's' : ''}</Text>
      {items.length === 0 && <Text>Aucune recette pour cette recherche.</Text>}
      {items.map(recipe => <View key={recipe.id} style={styles.card}>
        <Text style={{ fontSize: 20, fontWeight: '600' }}>{recipe.name}</Text>
        <Text>{recipe.total_time_minutes} min · {recipe.servings} portions{recipe.is_favorite ? ' · Favori' : ''}</Text>
        <Button title="Voir la recette" onPress={() => navigation.navigate('Detail', { id: recipe.id })} />
      </View>)}
      {offset > 0 && <Button title="Page précédente" onPress={() => setOffset(Math.max(0, offset - 20))} />}
      {offset + 20 < total && <Button title="Page suivante" onPress={() => setOffset(offset + 20)} />}
    </>}
  </Screen>;
}
