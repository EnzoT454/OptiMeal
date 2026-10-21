import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Field, Heading, Message, Screen, styles } from '../components/ui';
import { api } from '../services/api';
import { Detail, Ingredient, Page, Recipe, RecipeIngredient, RecipeUnit, RecipeWrite } from '../types/api';
import { RecipeStackParams } from '../types/navigation';

export default function RecipeEditorScreen({ route, navigation }: NativeStackScreenProps<RecipeStackParams, 'Editor'>) {
  const id = route.params?.id;
  const [catalog, setCatalog] = useState<Ingredient[]>([]);
  const [name, setName] = useState(''); const [description, setDescription] = useState('');
  const [servings, setServings] = useState('2'); const [prep, setPrep] = useState('10'); const [cook, setCook] = useState('10');
  const [image, setImage] = useState<string | null>(null); const [ingredients, setIngredients] = useState<RecipeIngredient[]>([]);
  const [steps, setSteps] = useState(['']); const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    Promise.all([api<Page<Ingredient>>('/api/v1/ingredients?limit=100'), id ? api<Detail<Recipe>>('/api/v1/recipes/' + id) : Promise.resolve(null)])
      .then(([data, detail]) => {
        if (!active) return;
        setCatalog(data.items);
        if (detail) {
          const r = detail.item;
          if (!r.is_owned) throw new Error('Cette recette partagée ne peut pas être modifiée.');
          setName(r.name); setDescription(r.description); setServings(String(r.servings));
          setPrep(String(r.prep_time_minutes)); setCook(String(r.cook_time_minutes)); setImage(r.image_url);
          setIngredients(r.ingredients); setSteps(r.instructions.map(step => step.text));
        }
      }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, retry]);
  function change(index: number, fields: Partial<RecipeIngredient>) {
    setIngredients(ingredients.map((item, position) => position === index ? { ...item, ...fields } : item));
  }
  async function save() {
    if (busy) return;
    const integer = (value: string) => /^\d+$/.test(value) && Number.isSafeInteger(Number(value));
    if (!name.trim() || !description.trim() || !integer(servings) || Number(servings) < 1 || !integer(prep) || !integer(cook) ||
        !ingredients.length || !steps.length || steps.some(step => !step.trim())) {
      setError('Complète le nom, la description, les portions, les durées, au moins un ingrédient et les étapes.'); return;
    }
    if (ingredients.some(i => !/^(0|[1-9]\d*)(\.\d+)?$/.test(i.quantity) || !/[1-9]/.test(i.quantity) ||
        (i.unit === 'unit' && !/^[1-9]\d*$/.test(i.quantity)))) {
      setError('Les quantités doivent être positives, avec un point décimal. Les pièces sont entières.'); return;
    }
    const body: RecipeWrite = { name: name.trim(), description: description.trim(), servings: Number(servings),
      prep_time_minutes: Number(prep), cook_time_minutes: Number(cook), total_time_minutes: Number(prep) + Number(cook),
      image_url: image, ingredients, instructions: steps.map((text, index) => ({ position: index + 1, text: text.trim() })) };
    setBusy(true); setError('');
    try {
      const result = await api<Detail<Recipe>>(id ? '/api/v1/recipes/' + id : '/api/v1/recipes', { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) });
      navigation.replace('Detail', { id: result.item.id });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <Screen><Heading>{id ? 'Modifier la recette' : 'Nouvelle recette'}</Heading><Message text={error} />
    {loading ? <Text>Chargement…</Text> : catalog.length === 0 ? <Button title="Réessayer" onPress={() => setRetry(retry + 1)} /> : <>
      <Field label="Nom" value={name} onChangeText={setName} />
      <Field label="Description" multiline value={description} onChangeText={setDescription} />
      <Field label="Portions" keyboardType="number-pad" value={servings} onChangeText={setServings} />
      <Field label="Préparation (minutes)" keyboardType="number-pad" value={prep} onChangeText={setPrep} />
      <Field label="Cuisson (minutes)" keyboardType="number-pad" value={cook} onChangeText={setCook} />
      <Heading>Ingrédients</Heading>
      {ingredients.map((item, index) => <View key={item.ingredient_id} style={styles.card}>
        <Text>{catalog.find(i => i.id === item.ingredient_id)?.name ?? item.ingredient_id}</Text>
        <Field label="Quantité" keyboardType="decimal-pad" value={item.quantity} onChangeText={quantity => change(index, { quantity })} />
        <View style={{ flexDirection: 'row', gap: 8 }}>{(['g', 'ml', 'unit'] as RecipeUnit[]).map(unit =>
          <Button key={unit} title={(unit === item.unit ? '✓ ' : '') + unit} onPress={() => change(index, { unit })} />)}</View>
        <Field label="Préparation de l’ingrédient (facultatif)" value={item.preparation ?? ''} onChangeText={preparation => change(index, { preparation: preparation || null })} />
        <Button title="Retirer cet ingrédient" onPress={() => setIngredients(ingredients.filter((_, position) => position !== index))} />
      </View>)}
      <Field label="Chercher un ingrédient à ajouter" value={search} onChangeText={setSearch} />
      {catalog.filter(i => !ingredients.some(item => item.ingredient_id === i.id) &&
        i.name.toLocaleLowerCase('fr').includes(search.toLocaleLowerCase('fr'))).map(i =>
        <Button key={i.id} title={'+ ' + i.name} onPress={() => setIngredients([...ingredients, { ingredient_id: i.id, quantity: '1', unit: 'g', preparation: null }])} />)}
      <Heading>Étapes</Heading>
      {steps.map((text, index) => <View key={index} style={styles.card}>
        <Field label={'Étape ' + (index + 1)} value={text} multiline onChangeText={value => setSteps(steps.map((step, p) => p === index ? value : step))} />
        <Button title="Monter" disabled={index === 0} onPress={() => { const next = [...steps]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; setSteps(next); }} />
        <Button title="Retirer cette étape" onPress={() => setSteps(steps.filter((_, p) => p !== index))} />
      </View>)}
      <Button title="Ajouter une étape" onPress={() => setSteps([...steps, ''])} />
      <Button title={busy ? 'Enregistrement…' : 'Enregistrer la recette'} disabled={busy} onPress={() => void save()} />
    </>}
  </Screen>;
}
