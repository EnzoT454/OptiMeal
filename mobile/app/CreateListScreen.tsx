import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RecipeButton, RecipeField, RecipeScreen, RecipeTitle, recipeColors, recipeStyles as s } from '../components/recipes';
import InstantListCreation from '../components/lists/InstantListCreation';
import { useListCommand } from '../components/lists/useListCommand';
import { positiveAmount } from '../components/lists/courseQuantities';
import { useAuth } from '../context/AuthContext';
import { dateLabel, listCommand, listsPath, localDate, previewCalendar } from '../services/shoppingLists';
import type { ShoppingListKind, ShoppingBaseQuantity, ShoppingCalendarPreviewRead } from '../types/shoppingLists';
import type { ListStackParams } from '../types/navigation';

export default function CreateListScreen(props: NativeStackScreenProps<ListStackParams, 'CreateList'>) {
  const [kind, setKind] = useState<ShoppingListKind | null>(props.route.params?.kind ?? null);
  if (!props.route.params?.period) {
    if (kind) return <InstantListCreation kind={kind} onCreated={id => props.navigation.replace('ShoppingDetail', { id })} />;
    return <RecipeScreen>
      <RecipeTitle>Quelle liste souhaites-tu créer ?</RecipeTitle>
      <View style={s.notice}><RecipeButton title="Liste d’articles" onPress={() => setKind('articles')} />
        <Text style={s.body}>Note tes besoins librement et coche tes achats, sans prix ni magasin.</Text></View>
      <View style={s.notice}><RecipeButton title="Liste de produits" onPress={() => setKind('products')} />
        <Text style={s.body}>Choisis des produits en magasin pour suivre leur prix et le total estimé.</Text></View>
    </RecipeScreen>;
  }
  return <CalendarListCreation {...props} />;
}

function CalendarListCreation({ navigation, route }: NativeStackScreenProps<ListStackParams, 'CreateList'>) {
  const period = route.params!.period!;
  const { session } = useAuth();
  const identity = `${session?.user.id}:${period.start_date}:${period.end_date}`;
  const current = useRef(identity); current.current = identity;
  const [name, setName] = useState('Courses de la semaine'), [date] = useState(localDate);
  const [preview, setPreview] = useState<ShoppingCalendarPreviewRead | null>(null);
  const [edits, setEdits] = useState<Record<string, ShoppingBaseQuantity[]>>({});
  const [excluded, setExcluded] = useState<string[]>([]), [partial, setPartial] = useState(false);
  const [loading, setLoading] = useState(false), [error, setError] = useState('');
  const request = useRef(0), fetching = useRef(false), started = useRef(false);
  const command = useListCommand(`create.${period.start_date}.${period.end_date}`);
  const locked = command.locked || loading;
  useEffect(() => () => { request.current++; }, []);
  async function load(day = date) {
    if (fetching.current || command.locked) return;
    const version = ++request.current; fetching.current = true; setLoading(true); setError('');
    try {
      const value = await previewCalendar({ ...period, purchase_date: day });
      if (current.current === identity && request.current === version) {
        setPreview(value); setEdits({}); setExcluded([]); setPartial(false);
      }
    } catch (failure) {
      if (current.current === identity && request.current === version) setError(failure instanceof Error ? failure.message : 'Aperçu indisponible.');
    } finally {
      fetching.current = false;
      if (current.current === identity && request.current === version) setLoading(false);
    }
  }
  useEffect(() => {
    if (command.ready && !command.pending && !started.current) { started.current = true; void load(); }
  }, [command.ready]);
  const selected = preview?.items.filter(item => !excluded.includes(item.id)) ?? [];
  const valid = !!name.trim() && selected.length > 0 && selected.length <= 500 && !!preview && (!preview.excluded_meals.length || partial);
  async function save() {
    if (!command.pending && (!valid || !preview)) return;
    const adjusted = [];
    for (const item of selected) if (edits[item.id]) {
      const required = edits[item.id].filter(q => q.amount.trim()).map(q => ({ ...q, amount: positiveAmount(q.amount) }));
      if (required.some(q => q.amount === null)) { setError(`Vérifie les quantités de ${item.name}.`); return; }
      adjusted.push({ item_id: item.id, required });
    }
    const result = await command.run(command.pending ?? listCommand(`${listsPath}/from-calendar`, {
      name: name.trim(), kind: 'articles', ...period, purchase_date: date, activate: true,
      preview_fingerprint: preview!.preview_fingerprint, accept_partial: partial,
      excluded_item_ids: excluded, adjusted_items: adjusted,
    }));
    if (result && current.current === identity) navigation.replace('ShoppingDetail', { id: result.id });
  }
  return <RecipeScreen>
    <RecipeTitle>Créer la liste de cette semaine</RecipeTitle>
    <Text style={s.body}>Repas du {dateLabel(period.start_date)} au {dateLabel(period.end_date)}. Les ingrédients seront enregistrés sans choisir de magasin ni de produit.</Text>
    {!!(error || command.error) && <Text accessibilityRole="alert" style={s.requiredItem}>{error || command.error}</Text>}
    {command.pending ? <>
      <Text style={s.body}>La création reste à confirmer. Reprends la même demande sans créer de doublon.</Text>
      <RecipeButton title="Reprendre la création" disabled={command.busy} onPress={() => void save()} />
    </> : <>
      <RecipeField label="Nom de la liste" value={name} maxLength={120} editable={!locked} onChangeText={setName} />
      {loading && <ActivityIndicator color={recipeColors.green} accessibilityLabel="Calcul des ingrédients" />}
      <RecipeButton title={preview ? 'Actualiser l’aperçu' : 'Voir l’aperçu'} variant="neutral" disabled={locked} onPress={() => void load()} />
      {preview && <>
        <Text style={s.note}>{preview.included_meal_count} repas inclus · {preview.skipped_note_count} notes et {preview.skipped_leftover_count} restes ignorés. Cette liste restera indépendante du calendrier.</Text>
        {preview.warnings.map((warning, index) => <Text key={index} style={s.requiredItem}>{warning.message}</Text>)}
        {selected.map(item => <View key={item.id} style={s.choice}>
          <Text style={s.sectionTitle}>{item.name}</Text>
          {(edits[item.id] ?? item.required).map((q, index, quantities) => <RecipeField key={q.unit}
            label={`Quantité de ${item.name} (${q.unit})`} value={q.amount} editable={!locked} keyboardType="decimal-pad"
            onChangeText={amount => setEdits(previous => ({ ...previous, [item.id]: quantities.map((value, n) => n === index ? { ...value, amount } : value) }))} />)}
          <Text style={s.note}>{item.contributions.map(c => `${c.recipe_name} · ${c.servings} portions`).join('\n')}</Text>
          <RecipeButton title={`Retirer ${item.name} de l’aperçu`} variant="neutral" disabled={locked} onPress={() => setExcluded(values => [...values, item.id])} />
        </View>)}
        {!!preview.excluded_meals.length && <RecipeButton title={partial ? '✓ Repas indisponibles exclus' : 'Confirmer les repas indisponibles exclus'}
          variant="neutral" disabled={locked} accessibilityState={{ selected: partial }} onPress={() => setPartial(!partial)} />}
        {!!preview.excluded_ingredient_ids.length && <Text style={s.note}>{preview.excluded_ingredient_ids.length} ingrédient(s) exclus selon tes préférences.</Text>}
        {!selected.length && <Text style={s.body}>Aucun ingrédient retenu. Tu peux créer une liste vide et y ajouter tes articles.</Text>}
        <RecipeButton title="Créer la liste" disabled={locked || !valid} onPress={() => void save()} />
      </>}
      <RecipeButton title="Créer plutôt une liste vide" variant="neutral" disabled={locked} onPress={() => navigation.replace('CreateList', { kind: 'articles' })} />
    </>}
  </RecipeScreen>;
}
