import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, Switch, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Message } from '../components/ui';
import { RecipeButton, RecipeField, RecipeScreen, RecipeTitle, recipeColors, recipeStyles } from '../components/recipes';
import IngredientPicker from '../components/IngredientPicker';
import RecipeImage from '../components/RecipeImage';
import RecipeUnitPicker from '../components/RecipeUnitPicker';
import { api } from '../services/api';
import { chooseRecipeImage, uploadRecipeImage } from '../services/recipeImages';
import { parseIngredientQuantity } from '../services/recipeForm';
import { Detail, Ingredient, Page, Recipe, RecipeUnit, RecipeVisibility, RecipeWrite } from '../types/api';
import { RecipeStackParams } from '../types/navigation';

type IngredientDraft = { ingredient_id: string; quantity: string; unit: RecipeUnit | null; preparation: string | null };
const emptyIngredient = (): IngredientDraft => ({ ingredient_id: '', quantity: '', unit: null, preparation: null });

export default function RecipeEditorScreen({ route, navigation }: NativeStackScreenProps<RecipeStackParams, 'Editor'>) {
  const id = route.params?.id;
  const [catalog, setCatalog] = useState<Ingredient[]>([]);
  const [name, setName] = useState(''); const [description, setDescription] = useState('');
  const [servings, setServings] = useState('2'); const [prep, setPrep] = useState('25'); const [cook, setCook] = useState('0');
  const [tags, setTags] = useState('');
  const [image, setImage] = useState<string | null>(null); const [localImage, setLocalImage] = useState<string | null>(null);
  const [ingredients, setIngredients] = useState<IngredientDraft[]>([emptyIngredient()]);
  const [steps, setSteps] = useState(['']); const [extra, setExtra] = useState(false);
  const [pickerIndex, setPickerIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false); const [picking, setPicking] = useState(false);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [retry, setRetry] = useState(0);
  const [visibility, setVisibility] = useState<RecipeVisibility>('private');
  const [initialVisibility, setInitialVisibility] = useState<RecipeVisibility>('private');
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    Promise.all([api<Page<Ingredient>>('/api/v1/ingredients?limit=100'), id ? api<Detail<Recipe>>('/api/v1/recipes/' + id) : Promise.resolve(null)])
      .then(([data, detail]) => {
        if (!active) return;
        if (detail) {
          const r = detail.item;
          if (!r.is_owned) throw new Error('Cette recette partagée ne peut pas être modifiée.');
          setName(r.name); setDescription(r.description); setServings(String(r.servings));
          setPrep(String(r.prep_time_minutes)); setCook(String(r.cook_time_minutes)); setImage(r.image_url);
          setTags((r.tags ?? []).join(', '));
          setIngredients(r.ingredients.map(i => ({ ingredient_id: i.ingredient_id, quantity: i.quantity, unit: i.unit, preparation: i.preparation })));
          setSteps(r.instructions.map(step => step.text));
          setVisibility(r.visibility); setInitialVisibility(r.visibility);
        }
        setCatalog(data.items);
      }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, retry]);
  function change(index: number, fields: Partial<IngredientDraft>) {
    setIngredients(items => items.map((item, position) => position === index ? { ...item, ...fields } : item));
  }
  async function pickImage() {
    if (busy || picking) return;
    setPicking(true); setError('');
    try {
      const uri = await chooseRecipeImage();
      if (uri) setLocalImage(uri);
    } catch (e) { setError((e as Error).message); } finally { setPicking(false); }
  }
  async function save(confirmed = false) {
    if (busy || picking) return;
    let body: RecipeWrite;
    try {
      if (!name.trim()) {
        throw new Error('Ajoute un nom pour enregistrer la recette.');
      }
      if (!id && !(localImage?.trim() || image?.trim())) {
        throw new Error('Ajoute une photo pour créer la recette.');
      }
      const integer = (value: string) => /^\d+$/.test(value) && Number.isSafeInteger(Number(value));
      if (!integer(servings) || Number(servings) < 1 || !integer(prep) || !integer(cook) ||
          !ingredients.length || ingredients.some(i => !i.ingredient_id) || !steps.length || steps.some(step => !step.trim())) {
        throw new Error('Complète le nom, les portions, les durées, au moins un ingrédient et les étapes.');
      }
      const labels = tags.split(',').map(tag => tag.trim()).filter(Boolean);
      if (labels.length > 10 || labels.some(tag => tag.length > 40)) throw new Error('Ajoute au maximum 10 étiquettes de 40 caractères chacune.');
      body = { name: name.trim(), description: description.trim() || name.trim(), servings: Number(servings),
        prep_time_minutes: Number(prep), cook_time_minutes: Number(cook), total_time_minutes: Number(prep) + Number(cook),
        image_url: image, tags: labels,
        ingredients: ingredients.map(i => ({ ingredient_id: i.ingredient_id, ...parseIngredientQuantity(i.quantity, i.unit), preparation: i.preparation?.trim() || null })),
        instructions: steps.map((text, index) => ({ position: index + 1, text: text.trim() })) };
    } catch (e) { setError((e as Error).message); Alert.alert('Vérifie la recette', (e as Error).message); return; }
    if (!confirmed && visibility === 'public' && initialVisibility !== 'public') {
      Alert.alert('Publier définitivement cette recette ?',
        'Elle restera visible dans Découvrir et les calendriers. Tu ne pourras plus la rendre privée ni la supprimer, même en supprimant ton compte.', [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Enregistrer et publier', onPress: () => void save(true) },
        ]);
      return;
    }
    setBusy(true); setError('');
    let contentSaved = false;
    try {
      if (localImage) {
        const url = await uploadRecipeImage(localImage);
        body.image_url = url;
        setImage(url); setLocalImage(null);
      }
      let result = await api<Detail<Recipe>>(id ? '/api/v1/recipes/' + id : '/api/v1/recipes', {
        method: id ? 'PUT' : 'POST', body: JSON.stringify(id ? body : { ...body, visibility }),
      });
      contentSaved = true;
      if (id && visibility === 'public' && result.item.visibility !== 'public') {
        result = await api<Detail<Recipe>>('/api/v1/recipes/' + id + '/visibility', { method: 'PATCH', body: JSON.stringify({ visibility }) });
      }
      setInitialVisibility(result.item.visibility);
      navigation.reset({ index: 1, routes: [{ name: 'List' }, { name: 'Detail', params: { id: result.item.id } }] });
    } catch (e) {
      const message = contentSaved ? 'Les modifications sont enregistrées, mais le changement de visibilité n’a pas été confirmé. Réessaie pour vérifier et appliquer le statut choisi.' :
        (e as Error).message;
      setError(message); Alert.alert(contentSaved ? 'Enregistrement incomplet' : 'Enregistrement impossible', message);
    } finally { setBusy(false); }
  }
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <RecipeScreen>
      <RecipeTitle onBack={busy || picking ? undefined : () => navigation.goBack()}>{id ? 'Modifier la recette' : 'Nouvelle recette'}</RecipeTitle>
      <Message text={error} />
      {loading ? <Text>Chargement…</Text> : catalog.length === 0 ? <RecipeButton title="Réessayer" onPress={() => setRetry(retry + 1)} /> :
        <View style={{ gap: 20 }} pointerEvents={busy || picking ? 'none' : 'auto'}>
          <RecipeField label="Nom de la recette (obligatoire)" placeholder="Ex. : Salade de riz maison" value={name} onChangeText={setName} />
          {(localImage || image) && <RecipeImage recipe={{ id: id ?? '', name: name || 'Photo de la recette', image_url: localImage ?? image }} />}
          <View style={{ gap: 8 }}>
            <Pressable accessibilityRole="button" onPress={() => void pickImage()} disabled={busy || picking} style={recipeStyles.notice}>
              <Text style={[recipeStyles.sectionTitle, { fontSize: 16, lineHeight: 22, color: recipeColors.green }]}>{picking ? 'Préparation de la photo…' : localImage || image ? 'Changer la photo' : '+ Ajouter une photo'}</Text>
              <Text style={recipeStyles.note}>{id ? 'Photo de la recette' : 'Obligatoire pour créer la recette'}</Text>
            </Pressable>
            {(localImage || image) && <Pressable accessibilityRole="button" onPress={() => { setLocalImage(null); setImage(null); }}><Text style={recipeStyles.remove}>Retirer la photo</Text></Pressable>}
          </View>
          <RecipeField label="Portions" keyboardType="number-pad" value={servings} onChangeText={setServings} />
          <RecipeField label="Préparation (minutes)" keyboardType="number-pad" value={prep} onChangeText={setPrep} />
          <Text accessibilityRole="header" style={recipeStyles.sectionTitle}>Ingrédients</Text>
          {ingredients.map((item, index) => <View key={index} style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
              <View style={{ flex: 1, minWidth: 0 }}><Text style={recipeStyles.label}>Ingrédient</Text>
                <Pressable accessibilityRole="button" accessibilityLabel={`Choisir l’ingrédient ${index + 1}`} onPress={() => setPickerIndex(index)}
                  style={[recipeStyles.input, { borderWidth: 1, justifyContent: 'center' }]}>
                  <Text numberOfLines={2} style={[recipeStyles.body, { color: recipeColors.ink }]}>{catalog.find(i => i.id === item.ingredient_id)?.name ?? 'Choisir…'}</Text>
                </Pressable>
              </View>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' }}>
              <RecipeField containerStyle={{ flexGrow: 1, flexBasis: 90 }} label="Quantité" accessibilityLabel={`Quantité de l’ingrédient ${index + 1}`} placeholder="Ex. : 300" keyboardType="decimal-pad"
                value={item.quantity} onChangeText={quantity => change(index, { quantity })} />
              <View style={{ flexGrow: 1, flexBasis: 190 }}>
                <Text style={recipeStyles.label}>Unité</Text>
                <RecipeUnitPicker value={item.unit} onChange={unit => change(index, { unit })} disabled={busy || picking}
                  ingredientLabel={catalog.find(i => i.id === item.ingredient_id)?.name ?? `Ingrédient ${index + 1}`} />
              </View>
            </View>
            {item.preparation !== null && <RecipeField label="Précision (facultatif)" value={item.preparation} onChangeText={preparation => change(index, { preparation })} />}
            <View style={[recipeStyles.row, { justifyContent: 'space-between' }]}>
              {item.preparation === null && <Pressable accessibilityRole="button" onPress={() => change(index, { preparation: '' })}><Text style={recipeStyles.remove}>Ajouter une précision</Text></Pressable>}
              <Pressable accessibilityRole="button" accessibilityLabel={`Retirer l’ingrédient ${index + 1}`} onPress={() => setIngredients(ingredients.filter((_, p) => p !== index))}><Text style={recipeStyles.remove}>Retirer</Text></Pressable>
            </View>
          </View>)}
          <RecipeButton title="+ Ajouter un ingrédient" variant="neutral" onPress={() => setIngredients([...ingredients, emptyIngredient()])} />
          <Text style={recipeStyles.note}>Pour une demi-tasse ou une demi-cuillère, saisis 0,5.</Text>
          <Text accessibilityRole="header" style={recipeStyles.sectionTitle}>Préparation</Text>
          {steps.map((text, index) => <View key={index} style={{ gap: 6 }}>
            <RecipeField label={`Étape ${index + 1}`} placeholder="Décrivez cette étape…" value={text} multiline onChangeText={value => setSteps(steps.map((step, p) => p === index ? value : step))} />
            <View style={[recipeStyles.row, { justifyContent: 'space-between' }]}>
              {index > 0 && <Pressable accessibilityRole="button" onPress={() => { const next = [...steps]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; setSteps(next); }}><Text style={recipeStyles.remove}>Monter</Text></Pressable>}
              <Pressable accessibilityRole="button" accessibilityLabel={`Retirer l’étape ${index + 1}`} onPress={() => setSteps(steps.filter((_, p) => p !== index))}><Text style={recipeStyles.remove}>Retirer</Text></Pressable>
            </View>
          </View>)}
          <RecipeButton title="+ Ajouter une étape" variant="neutral" onPress={() => setSteps([...steps, ''])} />
          <RecipeField label="Étiquettes (facultatif)" placeholder="Rapide, économique…" value={tags} onChangeText={setTags} />
          <RecipeButton title={extra ? 'Masquer les autres informations' : 'Autres informations (facultatif)'} variant="neutral" onPress={() => setExtra(!extra)} />
          {extra && <>
            <RecipeField label="Description (facultatif)" multiline value={description} onChangeText={setDescription} />
            <RecipeField label="Cuisson (minutes)" keyboardType="number-pad" value={cook} onChangeText={setCook} />
          </>}
          {Number(cook) > 0 && <Text style={recipeStyles.note}>Durée totale : {Number(prep) + Number(cook)} min, dont {cook} min de cuisson.</Text>}
          <View style={recipeStyles.notice}>
            <View style={[recipeStyles.row, { justifyContent: 'space-between' }]}>
              <Text style={[recipeStyles.sectionTitle, { flex: 1 }]}>Partager avec la communauté</Text>
              {initialVisibility !== 'public' && <Switch accessibilityLabel="Partager avec la communauté" value={visibility === 'public'} disabled={busy || picking}
                trackColor={{ true: recipeColors.green }} onValueChange={enabled => setVisibility(enabled ? 'public' : 'private')} />}
            </View>
            <Text style={recipeStyles.body}>{visibility === 'public' ? 'Publique — publication définitive. La recette restera dans Découvrir et les calendriers.' : 'Privée — la recette est accessible uniquement dans ton compte.'}</Text>
            {initialVisibility !== 'public' && visibility === 'public' && <Text style={recipeStyles.note}>Après publication, tu ne pourras plus rendre cette recette privée ni la supprimer. Elle restera accessible même après la suppression de ton compte.</Text>}
          </View>
          {id && <Text style={recipeStyles.note}>Changer les ingrédients, les étapes, les portions ou les durées ouvre une nouvelle version : les anciennes évaluations seront conservées, mais ne compteront plus dans la note actuelle.</Text>}
          {(!name.trim() || (!id && !(localImage?.trim() || image?.trim()))) &&
            <View style={recipeStyles.requiredNotice} accessible accessibilityLiveRegion="polite">
              <Text style={recipeStyles.requiredTitle}>ⓘ À compléter avant d’enregistrer</Text>
              {!name.trim() && <Text style={recipeStyles.requiredItem}>• Ajoute un nom à ta recette.</Text>}
              {!id && !(localImage?.trim() || image?.trim()) && <Text style={recipeStyles.requiredItem}>• Ajoute une photo de ton plat.</Text>}
            </View>}
          <RecipeButton title={busy ? 'Enregistrement…' : 'Enregistrer la recette'} disabled={busy || picking || !name.trim() || (!id && !(localImage?.trim() || image?.trim()))} onPress={() => void save()} />
        </View>}
      <IngredientPicker visible={pickerIndex !== null} ingredients={catalog.filter(i => !ingredients.some((item, p) => p !== pickerIndex && item.ingredient_id === i.id))}
        onClose={() => setPickerIndex(null)} onSelect={ingredient_id => { if (pickerIndex !== null) change(pickerIndex, { ingredient_id }); setPickerIndex(null); }} />
    </RecipeScreen>
  </KeyboardAvoidingView>;
}
