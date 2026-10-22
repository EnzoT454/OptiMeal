import { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Heading, Message, Screen } from '../components/ui';
import { api } from '../services/api';
import { Detail, Ingredient, Page, Recipe } from '../types/api';
import { RecipeStackParams } from '../types/navigation';
import RecipeImage from '../components/RecipeImage';
import { RecipeChip, recipeStyles } from '../components/recipes';
import { difficultyLabels, recipeBadges } from '../services/recipeForm';

export default function RecipeDetailScreen({ route, navigation }: NativeStackScreenProps<RecipeStackParams, 'Detail'>) {
  const [recipe, setRecipe] = useState<Recipe | null>(null); const [names, setNames] = useState<Record<string, string>>({});
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [retry, setRetry] = useState(0);
  useFocusEffect(useCallback(() => {
    let active = true;
    setRecipe(null); setError('');
    api<Detail<Recipe>>('/api/v1/recipes/' + route.params.id).then(result => { if (active) setRecipe(result.item); })
      .catch(e => { if (active) setError(e.message); });
    api<Page<Ingredient>>('/api/v1/ingredients?limit=100').then(result => {
      if (active) setNames(Object.fromEntries(result.items.map(i => [i.id, i.name])));
    }).catch(() => { /* La recette reste disponible sans le catalogue local. */ });
    return () => { active = false; };
  }, [route.params.id, retry]));
  async function favorite() {
    if (!recipe || busy) return;
    setBusy(true); setError('');
    try {
      await api<void>('/api/v1/recipes/' + recipe.id + '/favorite', { method: recipe.is_favorite ? 'DELETE' : 'PUT' });
      setRecipe({ ...recipe, is_favorite: !recipe.is_favorite });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function remove() {
    if (!recipe || busy) return;
    setBusy(true);
    try { await api<void>('/api/v1/recipes/' + recipe.id, { method: 'DELETE' }); navigation.popToTop(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <Screen><Message text={error} />
    {!recipe ? <><Text>{error ? 'Recette indisponible.' : 'Chargement…'}</Text><Button title="Réessayer" onPress={() => setRetry(retry + 1)} /></> : <>
      <RecipeImage recipe={recipe} />
      <Heading>{recipe.name}</Heading><Text>{recipe.description}</Text>
      <Text>{recipe.total_time_minutes} min · {recipe.difficulty ? difficultyLabels[recipe.difficulty] : 'Difficulté non précisée'} · {recipe.servings} portions</Text>
      {recipe.review_required && <Text>Recette de démonstration à vérifier avant utilisation.</Text>}
      <Button title={recipe.is_favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'} disabled={busy} onPress={() => void favorite()} />
      <View style={recipeStyles.chips}>{recipeBadges(recipe).map(tag => <RecipeChip key={tag} label={tag} />)}</View>
      {recipe.tags?.includes('Économique') && <Text style={recipeStyles.note}>Économique : étiquette choisie par l’auteur, coût non calculé.</Text>}
      <Heading>Ingrédients</Heading>
      {recipe.ingredients.map(i => <Text key={i.ingredient_id}>{i.quantity} {i.unit} · {names[i.ingredient_id] ?? i.ingredient_id}{i.preparation ? ' · ' + i.preparation : ''}</Text>)}
      <Heading>Préparation</Heading>{recipe.instructions.map(step => <Text key={step.position}>{step.position}. {step.text}</Text>)}
      {recipe.is_owned && <>
        <Button title="Modifier" disabled={busy} onPress={() => navigation.navigate('Editor', { id: recipe.id })} />
        <Button title="Supprimer" disabled={busy} onPress={() => Alert.alert('Supprimer cette recette ?', 'Cette action est définitive.', [
          { text: 'Annuler', style: 'cancel' }, { text: 'Supprimer', style: 'destructive', onPress: () => void remove() },
        ])} />
      </>}
    </>}
  </Screen>;
}
