import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RecipeButton, RecipeField, RecipeScreen, RecipeTitle, recipeColors, recipeStyles as s } from '../components/recipes';
import { Message } from '../components/ui';
import CreationPrices from '../components/lists/CreationPrices';
import IngredientPicker from '../components/IngredientPicker';
import RecipeUnitPicker from '../components/RecipeUnitPicker';
import { positiveAmount } from '../components/lists/courseQuantities';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import type { Ingredient, Page, RecipeUnit } from '../types/api';
import { ListDateField } from '../components/lists/ListDateField';
import { useListCommand } from '../components/lists/useListCommand';
import { currentWeek, dateLabel, listCommand, listsPath, localDate, previewCalendar, previewCreationPrices, quantityLabel } from '../services/shoppingLists';
import type { ShoppingCalendarPreviewRead, ShoppingInitialItem, ShoppingInputUnit, ShoppingBaseQuantity, ShoppingDraftPricingRead, ShoppingDraftChoice, ShoppingDraftProduct, ShoppingScenarioName } from '../types/shoppingLists';
import type { ListStackParams } from '../types/navigation';

export default function CreateListScreen({ navigation, route }: NativeStackScreenProps<ListStackParams, 'CreateList'>) {
  const { session } = useAuth();
  const user = session?.user.id;
  const account = useRef(user); account.current = user;
  const [step, setStep] = useState<1 | 2>(1);
  const [quote, setQuote] = useState<ShoppingDraftPricingRead | null>(null);
  const [choices, setChoices] = useState<ShoppingDraftChoice[]>([]);
  const [selected, setSelected] = useState<ShoppingScenarioName | null>(null);
  const [calendarEdits, setCalendarEdits] = useState<Record<string, ShoppingBaseQuantity[]>>({});
  const priceRequest = useRef(0), priceLock = useRef(false);
  useEffect(() => () => { priceRequest.current++; }, []);
  const [items, setItems] = useState<(ShoppingInitialItem & { key: number })[]>([]);
  const sequence = useRef(0);
  const [editing, setEditing] = useState<number | null>(null);
  const [article, setArticle] = useState(''), [amount, setAmount] = useState('');
  const [unit, setUnit] = useState<RecipeUnit | null>(null);
  const [ingredient, setIngredient] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<Ingredient[]>([]), [picker, setPicker] = useState(false);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [mode, setMode] = useState<'manual' | 'calendar'>(route.params?.period ? 'calendar' : 'manual');
  const [name, setName] = useState('');
  const [period, setPeriod] = useState(() => route.params?.period ?? currentWeek());
  const [purchaseDate, setPurchaseDate] = useState(localDate);
  const [preview, setPreview] = useState<ShoppingCalendarPreviewRead | null>(null);
  const [empty, setEmpty] = useState(false);
  const [partial, setPartial] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const previewLock = useRef(false);
  const command = useListCommand(route.params?.period ? `create.${route.params.period.start_date}.${route.params.period.end_date}` : 'create');
  const locked = command.locked || loading;
  function resetPreview() { setPreview(null); setCalendarEdits({}); setExcluded([]); setPartial(false); setEmpty(false); setError(''); }
  async function generate() {
    if (previewLock.current || locked) return;
    if (period.end_date < period.start_date) { setError('La fin de la période doit suivre son début.'); return; }
    previewLock.current = true; setLoading(true); setError('');
    try { setPreview(await previewCalendar({ ...period, purchase_date: purchaseDate })); setCalendarEdits({}); setExcluded([]); setPartial(false); }
    catch (e) { setError(e instanceof Error ? e.message : 'Aperçu indisponible.'); }
    finally { previewLock.current = false; setLoading(false); }
  }
  const calendarItems = mode === 'calendar' ? preview?.items.filter(item => !excluded.includes(item.id)) ?? [] : [];
  const itemCount = items.length + calendarItems.length;
  const unfinished = !!article.trim() || !!amount.trim() || editing !== null;
  function clearArticle() { setArticle(''); setAmount(''); setUnit(null); setIngredient(null); setEditing(null); setError(''); }
  function stageArticle() {
    if (locked) return;
    if (!article.trim()) { setError('Indique le nom de l’article.'); return; }
    const quantity = amount.trim() ? positiveAmount(amount.trim()) : null;
    if (amount.trim() && (!quantity || !unit)) { setError('Indique une quantité positive et son unité.'); return; }
    if (editing === null && itemCount >= 500) { setError('Une liste peut contenir au maximum 500 articles.'); return; }
    const item = { key: editing ?? ++sequence.current, name: article.trim(), ingredient_id: ingredient,
      quantity: quantity && unit ? { amount: quantity, unit: unit as ShoppingInputUnit } : null };
    setItems(previous => editing === null ? [...previous, item] : previous.map(current => current.key === editing ? item : current));
    clearArticle();
  }
  async function pickIngredient() {
    if (!user || locked) return;
    setLoading(true); setError('');
    try {
      const page = await api<Page<Ingredient>>('/api/v1/ingredients?limit=100', {}, true, 15000, user);
      if (account.current === user) { setCatalog(page.items); setPicker(true); }
    } catch (failure) { if (account.current === user) setError(failure instanceof Error ? failure.message : 'Catalogue indisponible.'); }
    finally { if (account.current === user) setLoading(false); }
  }
  function adjustedCalendar() {
    return calendarItems.map(item => {
      const edits = calendarEdits[item.id];
      if (!edits) return item;
      const required = edits.filter(q => q.amount.trim()).map(q => {
        const amount = positiveAmount(q.amount.trim());
        if (!amount) throw new Error(`Vérifie la quantité de ${item.name}.`);
        return { ...q, amount };
      });
      return { ...item, required };
    });
  }
  const canContinue = !!name.trim() && itemCount > 0 && itemCount <= 500 && !unfinished &&
    (mode === 'manual' || !!preview && (!preview.excluded_meals.length || partial) &&
      (preview.items.length > 0 || !preview.excluded_ingredient_ids.length || empty));
  async function requestPrices(nextChoices: ShoppingDraftChoice[] = choices) {
    if (!user || locked || priceLock.current || !canContinue) return;
    let calendar;
    try { calendar = adjustedCalendar(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Vérifie les quantités.'); return; }
    const version = ++priceRequest.current; priceLock.current = true;
    setLoading(true); setError('');
    try {
      const value = await previewCreationPrices({ purchase_date: purchaseDate, choices: nextChoices,
        items: [...calendar.map(item => ({ name: item.name, ingredient_id: item.ingredient_id, required: item.required })),
          ...items.map(item => ({ name: item.name, ingredient_id: item.ingredient_id, required: item.quantity ? [item.quantity] : [] }))],
      }, user);
      if (priceRequest.current === version && account.current === user) { setQuote(value); setChoices(nextChoices); setStep(2); return true; }
    } catch (failure) {
      if (priceRequest.current === version && account.current === user) setError(failure instanceof Error ? failure.message : 'Prix indisponibles.');
    } finally { priceLock.current = false; if (priceRequest.current === version && account.current === user) setLoading(false); }
  }
  async function pickProduct(product: ShoppingDraftProduct) {
    const next = [...choices.filter(choice => choice.item_index !== product.item_index), { item_index: product.item_index, product_id: product.product_id }];
    const updated = await requestPrices(next);
    if (updated && account.current === user) setSelected('cheapest');
  }
  async function persist(acceptPartial = false) {
    if (!command.pending && (!canContinue || !quote || !selected)) return;
    const calendar = adjustedCalendar();
    const content = { name: name.trim(), purchase_date: purchaseDate, activate: true,
      items: items.map(({ key, ...item }) => item),
      pricing: quote && selected ? { fingerprint: quote.fingerprint, scenario: selected, choices, accept_partial: acceptPartial } : undefined };
    const body = mode === 'manual' ? content : { ...content, ...period,
      preview_fingerprint: preview?.preview_fingerprint, excluded_item_ids: excluded,
      adjusted_items: calendar.filter(item => calendarEdits[item.id]).map(item => ({ item_id: item.id, required: item.required })),
      accept_partial: partial, accept_empty: empty,
    };
    const result = await command.run(command.pending ?? listCommand(
      mode === 'manual' ? listsPath : `${listsPath}/from-calendar`, body));
    if (result) navigation.replace('ShoppingDetail', { id: result.id });
  }
  function create() {
    if (command.pending) { void persist(); return; }
    if (!quote || !selected || locked) return;
    const scenario = quote.scenarios.find(value => value.scenario === selected);
    if (!scenario?.complete) Alert.alert('Certains produits restent sans prix', 'Le montant affiché est un sous-total. Créer la liste avec ces produits à vérifier ?', [
      { text: 'Annuler', style: 'cancel' }, { text: 'Créer avec le sous-total', onPress: () => void persist(true) },
    ]); else void persist();
  }
  return <RecipeScreen>
    <RecipeTitle>Créer une liste</RecipeTitle>
    {command.pending ? <View style={s.notice}>
      <Text style={s.sectionTitle}>Enregistrement à vérifier</Text>
      <Text style={s.body}>La réponse n’a pas été confirmée. Reprends la même demande pour retrouver la liste sans la créer deux fois.</Text>
      <RecipeButton title="Reprendre l’enregistrement" disabled={command.busy} onPress={create} />
    </View> : step === 2 ? <>
      <Text accessibilityRole="header" style={s.sectionTitle}>2. Prix par magasin</Text>
      <Text style={s.note}>Produits entiers, arrondis au supérieur. Sans quantité : un produit. Prix estimés hors taxes et consignes.</Text>
      {quote && <CreationPrices quote={quote} selected={selected} disabled={locked} onSelect={setSelected} onPick={product => void pickProduct(product)} />}
      <RecipeButton title="Précédent" variant="neutral" disabled={locked} onPress={() => { setStep(1); setQuote(null); setChoices([]); setSelected(null); setError(''); }} />
      {!!(error || command.error) && <RecipeButton title="Recalculer les prix" variant="neutral" disabled={locked} onPress={() => void requestPrices()} />}
      <RecipeButton title="Créer la liste" disabled={locked || !quote || !selected} onPress={create} />
    </> : <>
      <Text accessibilityRole="header" style={s.sectionTitle}>1. Ingrédients</Text>
      <Text style={s.sectionTitle}>Comment commencer ?</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="Origine de la liste" style={{ gap: 10 }}>
        {([{ value: 'manual', title: 'Manuellement', description: 'Ajoute tes articles avant d’enregistrer la liste.' },
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
          {preview.items.filter(item => !excluded.includes(item.id)).map(item => <View key={item.id} style={s.choice}>
            <Text style={s.sectionTitle}>{item.name}</Text>
            {(calendarEdits[item.id] ?? (item.required.length ? item.required : [{ amount: '', unit: 'unit' as const }])).map((q, index, values) =>
              <RecipeField key={q.unit} label={`Quantité de ${item.name} (${q.unit})`} value={q.amount} keyboardType="decimal-pad" editable={!locked}
                onChangeText={amount => setCalendarEdits(previous => ({ ...previous, [item.id]: values.map((current, n) => n === index ? { ...current, amount } : current) }))} />)}
            <Text style={s.note}>{item.contributions.map(c => `${c.recipe_name} · ${c.meal_date ? dateLabel(c.meal_date) : ''} · ${c.servings} portions`).join('\n')}</Text>
            <RecipeButton title={`Retirer ${item.name} de l’aperçu`} variant="neutral" disabled={locked} onPress={() => setExcluded(previous => [...previous, item.id])} />
          </View>)}
          {preview.excluded_ingredient_ids.length > 0 && <Text style={s.note}>{preview.excluded_ingredient_ids.length} ingrédient(s) non suggéré(s) selon tes préférences. Tu peux les rétablir dans Paramètres.</Text>}
          {!preview.items.length && preview.excluded_ingredient_ids.length > 0 && <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: empty, disabled: locked }} disabled={locked} onPress={() => setEmpty(!empty)} style={s.notice}>
            <Text style={s.body}>{empty ? '☑' : '☐'} Je confirme l’aperçu sans besoin après exclusions.</Text>
          </Pressable>}
          {!!preview.excluded_meals.length && <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: partial, disabled: locked }}
            disabled={locked} onPress={() => setPartial(!partial)} style={[s.notice, { minHeight: 52 }]}>
            <Text style={s.body}>{partial ? '☑' : '☐'} Je confirme la création sans les {preview.excluded_meals.length} repas indisponibles.</Text>
          </Pressable>}
        </>}
      </>}
      <Text accessibilityRole="header" style={s.sectionTitle}>Articles · {itemCount}</Text>
      {itemCount > 500 && <Text accessibilityRole="alert" style={s.requiredItem}>Limite de 500 articles. Retire les articles en trop avant de créer la liste.</Text>}
      {items.map(item => <View key={item.key} style={s.choice}>
        <Text style={s.sectionTitle}>{item.name}</Text>
        {!!item.quantity && <Text style={s.body}>{quantityLabel([item.quantity])}</Text>}
        <RecipeButton title={`Modifier ${item.name}`} variant="neutral" disabled={locked} onPress={() => {
          setEditing(item.key); setArticle(item.name); setIngredient(item.ingredient_id ?? null);
          setAmount(item.quantity?.amount ?? ''); setUnit((item.quantity?.unit as RecipeUnit) ?? null); setError('');
        }} />
        <RecipeButton title={`Retirer ${item.name}`} variant="neutral" disabled={locked} onPress={() => {
          setItems(previous => previous.filter(current => current.key !== item.key)); if (editing === item.key) clearArticle();
        }} />
      </View>)}
      <RecipeField label="Article" value={article} editable={!locked} maxLength={120} onChangeText={value => { setArticle(value); setIngredient(null); }} placeholder="Ex. Pain" />
      <RecipeButton title="Choisir dans le catalogue" variant="neutral" disabled={locked} onPress={() => void pickIngredient()} />
      <RecipeField label="Quantité (facultative)" value={amount} editable={!locked} keyboardType="decimal-pad" onChangeText={setAmount} />
      <RecipeUnitPicker value={unit} onChange={setUnit} ingredientLabel={article || 'Article'} disabled={locked} />
      <RecipeButton title={editing === null ? 'Ajouter l’article' : 'Enregistrer l’article'} variant="neutral" disabled={locked || !article.trim()} onPress={stageArticle} />
      {unfinished && <RecipeButton title="Annuler la saisie" variant="neutral" disabled={locked} onPress={clearArticle} />}
      <RecipeButton title="Suivant" disabled={locked || !canContinue} onPress={() => void requestPrices()} />
    </>}
    {(loading || command.busy) && <ActivityIndicator accessibilityLabel={loading ? 'Chargement' : 'Enregistrement en cours'} color={recipeColors.green} />}
    <Message text={error || command.error} />
    <IngredientPicker visible={picker} ingredients={catalog} onClose={() => setPicker(false)} onSelect={id => {
      const item = catalog.find(value => value.id === id);
      if (item) { setArticle(item.name); setIngredient(item.id); }
      setPicker(false);
    }} />
  </RecipeScreen>;
}
