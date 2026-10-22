import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Message } from '../components/ui';
import { RecipeButton, RecipeChip, RecipeField, RecipeScreen, RecipeTitle, recipeColors, recipeStyles } from '../components/recipes';
import IngredientPicker from '../components/IngredientPicker';
import RecipeImage from '../components/RecipeImage';
import { api } from '../services/api';
import { chooseRecipeImage, uploadRecipeImage } from '../services/recipeImages';
import { difficultyLabels, parseQuantityUnit } from '../services/recipeForm';
import { Detail, Ingredient, Page, Recipe, RecipeDifficulty, RecipeWrite } from '../types/api';
import { RecipeStackParams } from '../types/navigation';

type IngredientDraft = { ingredient_id: string; amount: string; preparation: string | null };
const emptyIngredient = (): IngredientDraft => ({ ingredient_id: '', amount: '', preparation: null });

export default function RecipeEditorScreen({ route, navigation }: NativeStackScreenProps<RecipeStackParams, 'Editor'>) {
  const id = route.params?.id;
  const [catalog, setCatalog] = useState<Ingredient[]>([]);
  const [name, setName] = useState(''); const [description, setDescription] = useState('');
  const [servings, setServings] = useState('2'); const [prep, setPrep] = useState('25'); const [cook, setCook] = useState('0');
  const [difficulty, setDifficulty] = useState<RecipeDifficulty | null>(null); const [tags, setTags] = useState('');
  const [image, setImage] = useState<string | null>(null); const [localImage, setLocalImage] = useState<string | null>(null);
  const [ingredients, setIngredients] = useState<IngredientDraft[]>([emptyIngredient()]);
  const [steps, setSteps] = useState(['']); const [extra, setExtra] = useState(false);
  const [pickerIndex, setPickerIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false); const [picking, setPicking] = useState(false);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [retry, setRetry] = useState(0);
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
          setDifficulty(r.difficulty ?? null); setTags((r.tags ?? []).join(', '));
          setIngredients(r.ingredients.map(i => ({ ingredient_id: i.ingredient_id, amount: `${i.quantity} ${i.unit}`, preparation: i.preparation })));
          setSteps(r.instructions.map(step => step.text));
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
  async function save() {
    if (busy || picking) return;
    let body: RecipeWrite;
    try {
      const integer = (value: string) => /^\d+$/.test(value) && Number.isSafeInteger(Number(value));
      if (!name.trim() || !integer(servings) || Number(servings) < 1 || !integer(prep) || !integer(cook) ||
          !ingredients.length || ingredients.some(i => !i.ingredient_id) || !steps.length || steps.some(step => !step.trim())) {
        throw new Error('Complète le nom, les portions, les durées, au moins un ingrédient et les étapes.');
      }
      const labels = tags.split(',').map(tag => tag.trim()).filter(Boolean);
      if (labels.length > 10 || labels.some(tag => tag.length > 40)) throw new Error('Ajoute au maximum 10 étiquettes de 40 caractères chacune.');
      body = { name: name.trim(), description: description.trim() || name.trim(), servings: Number(servings),
        prep_time_minutes: Number(prep), cook_time_minutes: Number(cook), total_time_minutes: Number(prep) + Number(cook),
        image_url: image, difficulty, tags: labels,
        ingredients: ingredients.map(i => ({ ingredient_id: i.ingredient_id, ...parseQuantityUnit(i.amount), preparation: i.preparation?.trim() || null })),
        instructions: steps.map((text, index) => ({ position: index + 1, text: text.trim() })) };
    } catch (e) { setError((e as Error).message); Alert.alert('Vérifie la recette', (e as Error).message); return; }
    setBusy(true); setError('');
    try {
      if (localImage) {
        const url = await uploadRecipeImage(localImage);
        body.image_url = url;
        setImage(url); setLocalImage(null);
      }
      const result = await api<Detail<Recipe>>(id ? '/api/v1/recipes/' + id : '/api/v1/recipes', { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) });
      navigation.reset({ index: 1, routes: [{ name: 'List' }, { name: 'Detail', params: { id: result.item.id } }] });
    } catch (e) { setError((e as Error).message); Alert.alert('Enregistrement impossible', (e as Error).message); } finally { setBusy(false); }
  }
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <RecipeScreen>
      <RecipeTitle onBack={busy || picking ? undefined : () => navigation.goBack()}>{id ? 'Modifier la recette' : 'Nouvelle recette'}</RecipeTitle>
      <Message text={error} />
      {loading ? <Text>Chargement…</Text> : catalog.length === 0 ? <RecipeButton title="Réessayer" onPress={() => setRetry(retry + 1)} /> :
        <View style={{ gap: 20 }} pointerEvents={busy || picking ? 'none' : 'auto'}>
          <RecipeField label="Nom de la recette" placeholder="Ex. : Salade de riz maison" value={name} onChangeText={setName} />
          {(localImage || image) && <RecipeImage recipe={{ id: id ?? '', name: name || 'Photo de la recette', image_url: localImage ?? image }} />}
          <View style={{ gap: 8 }}>
            <Pressable accessibilityRole="button" onPress={() => void pickImage()} disabled={busy || picking} style={recipeStyles.notice}>
              <Text style={[recipeStyles.sectionTitle, { fontSize: 16, lineHeight: 22, color: recipeColors.green }]}>{picking ? 'Préparation de la photo…' : localImage || image ? 'Changer la photo' : '+ Ajouter une photo'}</Text>
              <Text style={recipeStyles.note}>Facultatif</Text>
            </Pressable>
            {(localImage || image) && <Pressable accessibilityRole="button" onPress={() => { setLocalImage(null); setImage(null); }}><Text style={recipeStyles.remove}>Retirer la photo</Text></Pressable>}
            <Text style={recipeStyles.note}>Les photos sont publiques dans ce prototype.</Text>
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
              <RecipeField containerStyle={{ width: '34%' }} label="Qté et unité" placeholder="300 g" value={item.amount} onChangeText={amount => change(index, { amount })} />
            </View>
            {item.preparation !== null && <RecipeField label="Précision (facultatif)" value={item.preparation} onChangeText={preparation => change(index, { preparation })} />}
            <View style={[recipeStyles.row, { justifyContent: 'space-between' }]}>
              {item.preparation === null && <Pressable accessibilityRole="button" onPress={() => change(index, { preparation: '' })}><Text style={recipeStyles.remove}>Ajouter une précision</Text></Pressable>}
              <Pressable accessibilityRole="button" accessibilityLabel={`Retirer l’ingrédient ${index + 1}`} onPress={() => setIngredients(ingredients.filter((_, p) => p !== index))}><Text style={recipeStyles.remove}>Retirer</Text></Pressable>
            </View>
          </View>)}
          <RecipeButton title="+ Ajouter un ingrédient" variant="neutral" onPress={() => setIngredients([...ingredients, emptyIngredient()])} />
          <Text style={recipeStyles.note}>Unités : g, ml ou unit. Exemple : 300 g, 150 ml, 2 unit.</Text>
          <Text accessibilityRole="header" style={recipeStyles.sectionTitle}>Préparation</Text>
          {steps.map((text, index) => <View key={index} style={{ gap: 6 }}>
            <RecipeField label={`Étape ${index + 1}`} placeholder="Décrivez cette étape…" value={text} multiline onChangeText={value => setSteps(steps.map((step, p) => p === index ? value : step))} />
            <View style={[recipeStyles.row, { justifyContent: 'space-between' }]}>
              {index > 0 && <Pressable accessibilityRole="button" onPress={() => { const next = [...steps]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; setSteps(next); }}><Text style={recipeStyles.remove}>Monter</Text></Pressable>}
              <Pressable accessibilityRole="button" accessibilityLabel={`Retirer l’étape ${index + 1}`} onPress={() => setSteps(steps.filter((_, p) => p !== index))}><Text style={recipeStyles.remove}>Retirer</Text></Pressable>
            </View>
          </View>)}
          <RecipeButton title="+ Ajouter une étape" variant="neutral" onPress={() => setSteps([...steps, ''])} />
          <View style={{ gap: 7 }}><Text style={recipeStyles.label}>Difficulté (facultatif)</Text><View style={recipeStyles.chips}>
            <RecipeChip label="Non précisée" selected={difficulty === null} onPress={() => setDifficulty(null)} />
            {(Object.keys(difficultyLabels) as RecipeDifficulty[]).map(value => <RecipeChip key={value} label={difficultyLabels[value]} selected={difficulty === value} onPress={() => setDifficulty(value)} />)}
          </View></View>
          <RecipeField label="Étiquettes (facultatif)" placeholder="Rapide, économique…" value={tags} onChangeText={setTags} />
          <Text style={recipeStyles.note}>Sépare les étiquettes par une virgule. Rapide s’affiche automatiquement jusqu’à 30 minutes, cuisson comprise. Économique est une étiquette personnelle.</Text>
          <RecipeButton title={extra ? 'Masquer les autres informations' : 'Autres informations (facultatif)'} variant="neutral" onPress={() => setExtra(!extra)} />
          {extra && <>
            <RecipeField label="Description (facultatif)" multiline value={description} onChangeText={setDescription} />
            <RecipeField label="Cuisson (minutes)" keyboardType="number-pad" value={cook} onChangeText={setCook} />
          </>}
          {Number(cook) > 0 && <Text style={recipeStyles.note}>Durée totale : {Number(prep) + Number(cook)} min, dont {cook} min de cuisson.</Text>}
          <RecipeButton title={busy ? 'Enregistrement…' : 'Enregistrer la recette'} disabled={busy || picking} onPress={() => void save()} />
        </View>}
      <IngredientPicker visible={pickerIndex !== null} ingredients={catalog.filter(i => !ingredients.some((item, p) => p !== pickerIndex && item.ingredient_id === i.id))}
        onClose={() => setPickerIndex(null)} onSelect={ingredient_id => { if (pickerIndex !== null) change(pickerIndex, { ingredient_id }); setPickerIndex(null); }} />
    </RecipeScreen>
  </KeyboardAvoidingView>;
}
