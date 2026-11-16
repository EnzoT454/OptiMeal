import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RecipeButton, RecipeField, RecipeScreen, RecipeTitle, recipeColors, recipeStyles as s } from '../components/recipes';
import { Message } from '../components/ui';
import { ListDateField } from '../components/lists/ListDateField';
import { useListCommand } from '../components/lists/useListCommand';
import { currentWeek, dateLabel, listCommand, listsPath, localDate, previewCalendar, quantityLabel } from '../services/shoppingLists';
import type { ShoppingCalendarPreviewRead } from '../types/shoppingLists';
import type { ListStackParams } from '../types/navigation';

export default function CreateListScreen({ navigation }: NativeStackScreenProps<ListStackParams, 'CreateList'>) {
  const [mode, setMode] = useState<'manual' | 'calendar'>('manual');
  const [name, setName] = useState('');
  const [period, setPeriod] = useState(currentWeek);
  const [purchaseDate, setPurchaseDate] = useState(localDate);
  const [preview, setPreview] = useState<ShoppingCalendarPreviewRead | null>(null);
  const [empty, setEmpty] = useState(false);
  const [partial, setPartial] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const previewLock = useRef(false);
  const command = useListCommand('create');
  const locked = command.locked || loading;
  function resetPreview() { setPreview(null); setPartial(false); setEmpty(false); setError(''); }
  async function generate() {
    if (previewLock.current || locked) return;
    if (period.end_date < period.start_date) { setError('La fin de la période doit suivre son début.'); return; }
    previewLock.current = true; setLoading(true); setError('');
    try { setPreview(await previewCalendar({ ...period, purchase_date: purchaseDate })); setPartial(false); }
    catch (e) { setError(e instanceof Error ? e.message : 'Aperçu indisponible.'); }
    finally { previewLock.current = false; setLoading(false); }
  }
  async function create() {
    if (!command.pending && !name.trim()) { setError('Donne un nom à ta liste.'); return; }
    const body = mode === 'manual' ? { name: name.trim(), purchase_date: purchaseDate } : {
      name: name.trim(), ...period, purchase_date: purchaseDate,
      preview_fingerprint: preview?.preview_fingerprint, accept_partial: partial, accept_empty: empty,
    };
    const result = await command.run(command.pending ?? listCommand(
      mode === 'manual' ? listsPath : `${listsPath}/from-calendar`, body));
    if (result) navigation.replace('ShoppingDetail', { id: result.id });
  }
  return <RecipeScreen>
    <RecipeTitle>Créer une liste</RecipeTitle>
    <Text style={s.body}>Ton brouillon sera conservé dans ton compte. Tu pourras le compléter à ton rythme.</Text>
    {command.pending ? <View style={s.notice}>
      <Text style={s.sectionTitle}>Enregistrement à vérifier</Text>
      <Text style={s.body}>La réponse n’a pas été confirmée. Reprends la même demande pour retrouver la liste sans la créer deux fois.</Text>
      <RecipeButton title="Reprendre l’enregistrement" disabled={command.busy} onPress={() => void create()} />
    </View> : <>
      <Text style={s.sectionTitle}>Comment commencer ?</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="Origine de la liste" style={{ gap: 10 }}>
        {([{ value: 'manual', title: 'Manuellement', description: 'Une liste vide, à compléter avec tes articles.' },
          { value: 'calendar', title: 'Depuis mon calendrier', description: 'Les besoins de tes repas, sur la période de ton choix.' }] as const).map(choice =>
          <Pressable key={choice.value} accessibilityRole="radio" accessibilityState={{ checked: mode === choice.value, disabled: locked }}
            disabled={locked} onPress={() => { setMode(choice.value); resetPreview(); }}
            style={[s.choice, { borderWidth: 2, borderColor: mode === choice.value ? recipeColors.green : recipeColors.border, minHeight: 72 }]}>
            <Text style={s.sectionTitle}>{mode === choice.value ? '✓ ' : ''}{choice.title}</Text>
            <Text style={s.body}>{choice.description}</Text>
          </Pressable>)}
      </View>
      <RecipeField label="Nom de la liste" value={name} onChangeText={setName} editable={!locked} maxLength={120} placeholder="Ex. Épicerie de la semaine" />
      <ListDateField label="Date prévue des courses" value={purchaseDate} disabled={locked}
        onChange={value => { setPurchaseDate(value); resetPreview(); }} />
      {mode === 'calendar' && <>
        <ListDateField label="Premier jour inclus" value={period.start_date} disabled={locked}
          onChange={value => { setPeriod(p => ({ ...p, start_date: value })); resetPreview(); }} />
        <ListDateField label="Dernier jour inclus" value={period.end_date} disabled={locked}
          onChange={value => { setPeriod(p => ({ ...p, end_date: value })); resetPreview(); }} />
        <RecipeButton title={preview ? 'Actualiser l’aperçu' : 'Voir l’aperçu'} variant="neutral" disabled={locked} onPress={() => void generate()} />
        {preview && <>
          <Text style={s.sectionTitle}>Aperçu · {preview.items.length} articles</Text>
          <Text style={s.body}>Du {dateLabel(preview.period.start_date)} au {dateLabel(preview.period.end_date)} · {preview.included_meal_count} repas inclus.</Text>
          <Text style={s.note}>{preview.skipped_note_count} notes et {preview.skipped_leftover_count} restes ignorés.</Text>
          <Text style={s.body}>Cette copie restera indépendante du calendrier. Tes repas et recettes ne seront pas modifiés.</Text>
          {preview.warnings.map((w, i) => <Text key={i} style={s.requiredItem}>{w.message}</Text>)}
          {preview.items.map(item => <View key={item.id} style={s.choice}>
            <Text style={s.sectionTitle}>{item.name}</Text><Text style={s.body}>{quantityLabel(item.required)}</Text>
            <Text style={s.note}>{item.contributions.map(c => `${c.recipe_name} · ${c.meal_date ? dateLabel(c.meal_date) : ''} · ${c.servings} portions`).join('\n')}</Text>
          </View>)}
          {preview.excluded_ingredient_ids.length > 0 && <Text style={s.note}>{preview.excluded_ingredient_ids.length} ingrédient(s) non suggéré(s) selon tes préférences. Tu peux les rétablir dans Paramètres.</Text>}
          {!preview.items.length && preview.excluded_ingredient_ids.length > 0 && <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: empty, disabled: locked }} disabled={locked} onPress={() => setEmpty(!empty)} style={s.notice}>
            <Text style={s.body}>{empty ? '☑' : '☐'} Je confirme la création d’une liste vide après exclusions.</Text>
          </Pressable>}
          {!!preview.excluded_meals.length && <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: partial, disabled: locked }}
            disabled={locked} onPress={() => setPartial(!partial)} style={[s.notice, { minHeight: 52 }]}>
            <Text style={s.body}>{partial ? '☑' : '☐'} Je confirme la création sans les {preview.excluded_meals.length} repas indisponibles.</Text>
          </Pressable>}
        </>}
      </>}
      <RecipeButton title="Créer le brouillon" disabled={locked || !name.trim() || (mode === 'calendar' && (!preview || (!!preview.excluded_meals.length && !partial) || (!preview.items.length && !!preview.excluded_ingredient_ids.length && !empty)))} onPress={() => void create()} />
    </>}
    {(loading || command.busy) && <ActivityIndicator accessibilityLabel="Enregistrement en cours" color={recipeColors.green} />}
    <Message text={error || command.error} />
    {!command.ready && !command.error && <Text style={s.note}>Lecture de la sauvegarde locale…</Text>}
  </RecipeScreen>;
}
