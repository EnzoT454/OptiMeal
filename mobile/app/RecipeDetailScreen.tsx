import { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Heading, Message, Screen } from '../components/ui';
import { api } from '../services/api';
import { Detail, Ingredient, Page, Recipe, RecipeVisibility } from '../types/api';
import { RecipeStackParams } from '../types/navigation';
import RecipeImage from '../components/RecipeImage';
import RecipeRatingPanel from '../components/RecipeRatingPanel';
import { RecipeChip, recipeStyles } from '../components/recipes';
import { recipeBadges, recipeUnitLabel } from '../services/recipeForm';
import { useAuth } from '../context/AuthContext';

export default function RecipeDetailScreen({ route, navigation }: NativeStackScreenProps<RecipeStackParams, 'Detail'>) {
  const { session, requestSignIn } = useAuth();
  const [recipe, setRecipe] = useState<Recipe | null>(null); const [names, setNames] = useState<Record<string, string>>({});
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [retry, setRetry] = useState(0);
  const [ratingBusy, setRatingBusy] = useState(false);
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
    if (!recipe || busy || ratingBusy) return;
    if (!session) { requestSignIn('Connecte-toi pour enregistrer tes recettes favorites.'); return; }
    setBusy(true); setError('');
    try {
      await api<void>('/api/v1/recipes/' + recipe.id + '/favorite', { method: recipe.is_favorite ? 'DELETE' : 'PUT' });
      setRecipe({ ...recipe, is_favorite: !recipe.is_favorite });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function remove() {
    if (!recipe || recipe.visibility === 'public' || busy || ratingBusy) return;
    setBusy(true);
    try { await api<void>('/api/v1/recipes/' + recipe.id, { method: 'DELETE' }); navigation.popToTop(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function changeVisibility(visibility: RecipeVisibility) {
    if (!recipe?.is_owned || recipe.visibility === 'public' || !session || busy || ratingBusy) return;
    setBusy(true); setError('');
    try {
      const result = await api<Detail<Recipe>>('/api/v1/recipes/' + recipe.id + '/visibility', {
        method: 'PATCH', body: JSON.stringify({ visibility }),
      });
      setRecipe(result.item);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  function confirmVisibility() {
    if (!recipe?.is_owned || recipe.visibility === 'public' || !session || busy || ratingBusy) return;
    Alert.alert('Publier définitivement cette recette ?',
      'Elle restera visible dans Découvrir et les calendriers. Tu ne pourras plus la rendre privée ni la supprimer, même en supprimant ton compte.', [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Publier', onPress: () => void changeVisibility('public') },
      ]);
  }
  return <Screen><Message text={error} />
    {!recipe ? <><Text>{error ? 'Recette indisponible.' : 'Chargement…'}</Text><Button title="Réessayer" onPress={() => setRetry(retry + 1)} /></> : <>
      <RecipeImage recipe={recipe} />
      <Heading>{recipe.name}</Heading><Text>{recipe.description}</Text>
      <Text>{recipe.total_time_minutes} min · {recipe.servings} portions</Text>
      {recipe.review_required && <Text>Recette de démonstration à vérifier avant utilisation.</Text>}
      <Button title={recipe.is_favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'} disabled={busy || ratingBusy} onPress={() => void favorite()} />
      <View style={recipeStyles.chips}>{recipeBadges(recipe).map(tag => <RecipeChip key={tag} label={tag} />)}</View>
      {recipe.tags?.includes('Économique') && <Text style={recipeStyles.note}>Économique : étiquette choisie par l’auteur, coût non calculé.</Text>}
      <Heading>Ingrédients</Heading>
      {recipe.ingredients.map(i => <Text key={i.ingredient_id}>{i.quantity} {recipeUnitLabel(i.unit)} · {names[i.ingredient_id] ?? i.ingredient_id}{i.preparation ? ' · ' + i.preparation : ''}</Text>)}
      <Heading>Préparation</Heading>{recipe.instructions.map(step => <Text key={step.position}>{step.position}. {step.text}</Text>)}
      <RecipeRatingPanel key={recipe.id + ':' + (session?.user.id ?? 'visitor')} recipe={recipe} disabled={busy}
        onChange={setRecipe} onBusyChange={setRatingBusy}
        onUnavailable={() => { setRecipe(null); setRatingBusy(false); setError('Cette recette n’est plus accessible.'); }} />
      {recipe.is_owned && <>
        <View style={recipeStyles.notice}>
          <Text style={recipeStyles.sectionTitle}>Visibilité de la recette</Text>
          <Text style={recipeStyles.body}>{recipe.visibility === 'public' ? 'Publique — publication définitive. La recette restera dans Découvrir et les calendriers, même après la suppression de ton compte.' : 'Privée — accessible uniquement dans ton compte.'}</Text>
          {recipe.visibility === 'private' && <Button title="Publier la recette" disabled={busy || ratingBusy} onPress={confirmVisibility} />}
        </View>
        <Button title="Modifier" disabled={busy || ratingBusy} onPress={() => navigation.navigate('Editor', { id: recipe.id })} />
        {recipe.visibility === 'private' && <Button title="Supprimer" disabled={busy || ratingBusy} onPress={() => Alert.alert('Supprimer cette recette ?', 'Cette action est définitive.', [
          { text: 'Annuler', style: 'cancel' }, { text: 'Supprimer', style: 'destructive', onPress: () => void remove() },
        ])} />}
      </>}
    </>}
  </Screen>;
}
