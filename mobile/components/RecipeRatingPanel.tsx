import { useEffect, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { api, ApiError } from '../services/api';
import { Detail, Recipe, RecipeRatingWrite } from '../types/api';
import { Message } from './ui';
import { RecipeButton, recipeColors, recipeStyles } from './recipes';

type ScoreField = Exclude<keyof RecipeRatingWrite, 'recipe_version'>;
type Draft = Record<ScoreField, number | null>;
const emptyDraft = (): Draft => ({ taste_score: null, reliability_score: null, ease_score: null });
const criteria: { field: ScoreField; label: string; question: string }[] = [
  { field: 'taste_score', label: 'Goût', question: 'As-tu apprécié le résultat ?' },
  { field: 'reliability_score', label: 'Fiabilité',
    question: 'Les ingrédients et les étapes étaient-ils suffisamment complets pour obtenir le résultat annoncé ?' },
  { field: 'ease_score', label: 'Facilité', question: 'La préparation était-elle facile à réaliser ?' },
];

function formatted(value: string | null) {
  return value === null ? 'Non évaluée' : Number(value).toLocaleString('fr-CA', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '/5';
}

export default function RecipeRatingPanel({ recipe, disabled, onChange, onUnavailable, onBusyChange }: {
  recipe: Recipe; disabled: boolean; onChange: (recipe: Recipe) => void; onUnavailable: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const { session, requestSignIn } = useAuth();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [versionConflict, setVersionConflict] = useState(false);
  const locked = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; if (locked.current) onBusyChange(false); };
  }, [onBusyChange]);

  const canRate = recipe.visibility === 'public' && !recipe.is_owned;
  const previousVersion = !!recipe.my_rating && recipe.my_rating.recipe_version !== recipe.content_version;
  const actionTitle = previousVersion ? 'Réévaluer la recette' : recipe.my_rating ? 'Modifier mon évaluation' : 'Noter cette recette';
  const blocked = busy || disabled;
  const complete = criteria.every(({ field }) => Number.isInteger(draft[field]) && draft[field]! >= 1 && draft[field]! <= 5);

  function start() {
    if (!alive.current || locked.current || disabled || !canRate || needsRefresh) return;
    if (!session) { requestSignIn('Connecte-toi pour noter cette recette après l’avoir préparée.'); return; }
    const previous = previousVersion ? null : recipe.my_rating;
    setDraft(previous ? { taste_score: previous.taste_score, reliability_score: previous.reliability_score, ease_score: previous.ease_score } : emptyDraft());
    setMessage(''); setOpen(true);
  }

  function cancel() {
    if (locked.current) return;
    setOpen(false); setDraft(emptyDraft()); setMessage('');
  }

  function handleAccessError(error: unknown): boolean {
    if (error instanceof ApiError && error.status === 404) {
      setOpen(false); onUnavailable(); return true;
    }
    if (error instanceof ApiError && error.status === 401) {
      setOpen(false); setDraft(emptyDraft());
      requestSignIn('Ta session a expiré. Reconnecte-toi pour gérer ton évaluation.'); return true;
    }
    return false;
  }

  async function save() {
    if (!alive.current || locked.current || disabled || !canRate || !complete || !session || needsRefresh) return;
    locked.current = true; setBusy(true); onBusyChange(true); setMessage('');
    const body: RecipeRatingWrite = { recipe_version: recipe.content_version,
      taste_score: draft.taste_score!, reliability_score: draft.reliability_score!, ease_score: draft.ease_score! };
    try {
      const result = await api<Detail<Recipe>>('/api/v1/recipes/' + recipe.id + '/rating', { method: 'PUT', body: JSON.stringify(body) });
      if (!alive.current) return;
      onChange(result.item); setOpen(false); setDraft(emptyDraft()); setMessage('Ton évaluation est enregistrée.');
    } catch (error) {
      if (!alive.current || handleAccessError(error)) return;
      if (error instanceof ApiError && error.status === 409) {
        setOpen(false); setDraft(emptyDraft()); setNeedsRefresh(true); setVersionConflict(true);
        setMessage('La recette a changé. Actualise-la et relis-la avant de la noter.'); return;
      }
      setMessage('L’enregistrement n’a pas pu être confirmé. Ta saisie est conservée. ' + (error as Error).message);
    } finally {
      locked.current = false;
      if (alive.current) { setBusy(false); onBusyChange(false); }
    }
  }

  async function remove() {
    if (!alive.current || locked.current || disabled || !recipe.my_rating || !session) return;
    locked.current = true; setBusy(true); onBusyChange(true); setMessage('');
    let deleted = false;
    try {
      await api<void>('/api/v1/recipes/' + recipe.id + '/rating', { method: 'DELETE' });
      if (!alive.current) return;
      deleted = true;
      onChange({ ...recipe, my_rating: null }); setOpen(false); setDraft(emptyDraft()); setNeedsRefresh(true);
      const result = await api<Detail<Recipe>>('/api/v1/recipes/' + recipe.id);
      if (!alive.current) return;
      onChange(result.item); setNeedsRefresh(false); setMessage('Ton évaluation est supprimée.');
    } catch (error) {
      if (!alive.current || handleAccessError(error)) return;
      setMessage(deleted ? 'Ton évaluation est supprimée. Les moyennes n’ont pas pu être actualisées. Réessaie.' :
        'La suppression n’a pas pu être confirmée. Tu peux réessayer. ' + (error as Error).message);
    } finally {
      locked.current = false;
      if (alive.current) { setBusy(false); onBusyChange(false); }
    }
  }

  function confirmRemoval() {
    if (locked.current || disabled || !recipe.my_rating) return;
    Alert.alert('Supprimer tes évaluations ?', 'Toutes tes évaluations de cette recette, y compris celles des anciennes versions, seront supprimées.', [
      { text: 'Annuler', style: 'cancel' }, { text: 'Supprimer', style: 'destructive', onPress: () => void remove() },
    ]);
  }

  async function refresh() {
    if (!alive.current || locked.current || disabled) return;
    locked.current = true; setBusy(true); onBusyChange(true); setMessage('');
    try {
      const result = await api<Detail<Recipe>>('/api/v1/recipes/' + recipe.id);
      if (!alive.current) return;
      onChange(result.item); setNeedsRefresh(false); setVersionConflict(false);
      setMessage(versionConflict ? 'La recette est actualisée. Relis-la avant de la noter.' : 'Les moyennes sont actualisées.');
    } catch (error) {
      if (!alive.current || handleAccessError(error)) return;
      setMessage(versionConflict ? 'Impossible d’actualiser la recette. Réessaie.' : 'Impossible d’actualiser les moyennes. Réessaie.');
    } finally {
      locked.current = false;
      if (alive.current) { setBusy(false); onBusyChange(false); }
    }
  }

  return <View style={{ gap: 12 }}>
    <Text accessibilityRole="header" style={recipeStyles.sectionTitle}>Évaluations</Text>
    {needsRefresh ? <Text style={recipeStyles.body}>{versionConflict ? 'Recette à actualiser' : 'Moyennes à actualiser'}</Text> : <>
      <Text style={recipeStyles.sectionTitle}>{recipe.rating.count === 0 ? 'Pas encore évaluée' :
        `★ ${formatted(recipe.rating.average)} · ${recipe.rating.count} évaluation${recipe.rating.count > 1 ? 's' : ''}`}</Text>
      {recipe.rating.count > 0 && <View style={recipeStyles.notice}>
        <Text style={recipeStyles.body}>Goût : {formatted(recipe.rating.criteria.taste)}</Text>
        <Text style={recipeStyles.body}>Fiabilité : {formatted(recipe.rating.criteria.reliability)}</Text>
        <Text style={recipeStyles.body}>Facilité : {formatted(recipe.rating.criteria.ease)}</Text>
      </View>}
    </>}
    {!open && <Text accessibilityLiveRegion="polite" style={recipeStyles.body}>{message}</Text>}
    {previousVersion && <View style={recipeStyles.notice}>
      <Text style={recipeStyles.body}>Ton évaluation porte sur une ancienne version et ne compte plus dans la note actuelle. Prépare la nouvelle recette avant de la réévaluer.</Text>
      <Text style={recipeStyles.note}>Tes anciennes notes : goût {recipe.my_rating!.taste_score}/5, fiabilité {recipe.my_rating!.reliability_score}/5, facilité {recipe.my_rating!.ease_score}/5.</Text>
    </View>}
    {needsRefresh ? <RecipeButton title={busy ? 'Actualisation…' : versionConflict ? 'Actualiser la recette' : 'Actualiser les moyennes'} disabled={blocked} onPress={() => void refresh()} /> :
      canRate && <RecipeButton title={actionTitle} disabled={blocked} onPress={start} />}
    {recipe.is_owned && <Text style={recipeStyles.note}>Tu ne peux pas noter ta propre recette.</Text>}
    <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={cancel}>
      <SafeAreaView style={{ flex: 1, backgroundColor: recipeColors.background }}>
        <ScrollView contentContainerStyle={[recipeStyles.screen, { gap: 20 }]}>
          <Text accessibilityRole="header" style={recipeStyles.title}>{actionTitle}</Text>
          <Text style={recipeStyles.sectionTitle}>{recipe.name}</Text>
          <Text style={recipeStyles.body}>Après avoir préparé cette recette, partage ton expérience. Donne une note de 1 à 5 pour chaque critère : 1 est la note la plus basse, 5 la plus haute.</Text>
          {criteria.map(criterion => <View key={criterion.field} style={{ gap: 8 }}>
            <Text accessibilityRole="header" style={recipeStyles.sectionTitle}>{criterion.label}</Text>
            <Text style={[recipeStyles.body, { color: recipeColors.ink }]}>{criterion.question}</Text>
            <View accessibilityRole="radiogroup" accessibilityLabel={criterion.label} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {[1, 2, 3, 4, 5].map(score => <Pressable key={score} accessibilityRole="radio"
                accessibilityLabel={`${criterion.label} : ${score} sur 5`} accessibilityState={{ checked: draft[criterion.field] === score, disabled: blocked }}
                disabled={blocked} onPress={() => { if (!locked.current && !disabled) setDraft(previous => ({ ...previous, [criterion.field]: score })); }}
                style={{ flexGrow: 1, minWidth: 44, minHeight: 52, borderRadius: 10, padding: 6, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: draft[criterion.field] === score ? recipeColors.green : recipeColors.light }}>
                <Text style={{ fontSize: 22, color: draft[criterion.field] === score ? 'white' : recipeColors.green }}>{(draft[criterion.field] ?? 0) >= score ? '★' : '☆'}</Text>
                <Text style={{ color: draft[criterion.field] === score ? 'white' : recipeColors.ink }}>{score}</Text>
              </Pressable>)}
            </View>
          </View>)}
          <Message text={message} />
          {!complete && <Text style={recipeStyles.note}>Choisis une note pour chacun des trois critères.</Text>}
          <RecipeButton title={busy ? 'Enregistrement…' : 'Enregistrer mon évaluation'} disabled={blocked || !complete || needsRefresh} onPress={() => void save()} />
          <RecipeButton title="Annuler" variant="neutral" disabled={blocked} onPress={cancel} />
          {!!recipe.my_rating && <RecipeButton title="Supprimer mon évaluation" variant="neutral" disabled={blocked} onPress={confirmRemoval} />}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  </View>;
}
