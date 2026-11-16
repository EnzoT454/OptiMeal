import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { RecipeButton, RecipeField, RecipeScreen, RecipeTitle, recipeColors, recipeStyles as s } from '../components/recipes';
import { ListDateField } from '../components/lists/ListDateField';
import { Message } from '../components/ui';
import { localDate } from '../services/shoppingLists';
import { beginRecovery, previewRecovery, readRecovery, resumeRecovery, skipRejectedRecoveryItem,
  type RecoveryLedger, type RecoveryPreview } from '../services/shoppingRecovery';
import type { ListStackParams } from '../types/navigation';

export default function ShoppingRecoveryScreen({ navigation }: NativeStackScreenProps<ListStackParams, 'RecoverLocal'>) {
  const { session, requestSignIn } = useAuth();
  const user = session?.user.id;
  const context = useRef({ user });
  if (context.current.user !== user) context.current = { user };
  const token = context.current;
  const generation = useRef(0), lock = useRef(false);
  const [state, setState] = useState<{ token: object; ledger: RecoveryLedger; preview: RecoveryPreview | null } | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [name, setName] = useState('Articles récupérés'), [date, setDate] = useState(localDate);
  const [items, setItems] = useState<string[]>([]), [exclusions, setExclusions] = useState<string[]>([]);
  const value = state?.token === token ? state : null;
  const ledger = value?.ledger, preview = value?.preview;
  const run = ledger?.run;
  const valid = (version: number) => context.current === token && generation.current === version;
  async function load() {
    if (!user || lock.current) return;
    const version = generation.current;
    lock.current = true; setBusy(true); setError('');
    try {
      const saved = await readRecovery(user);
      if (!valid(version)) return;
      setState({ token, ledger: saved, preview: null });
      if (!saved.run) {
        const next = await previewRecovery(user);
        if (valid(version)) { setState({ token, ledger: saved, preview: next }); setItems(next.items.map(i => i.token)); setExclusions([]); }
      }
    } catch (failure) { if (valid(version)) setError(failure instanceof Error ? failure.message : 'Aperçu indisponible.'); }
    finally { if (valid(version)) { lock.current = false; setBusy(false); } }
  }
  useFocusEffect(useCallback(() => {
    generation.current++; lock.current = false; setState(null); setBusy(false); setError('');
    setItems([]); setExclusions([]); setName('Articles récupérés'); setDate(localDate());
    void load();
    return () => { generation.current++; lock.current = false; };
  }, [user]));
  async function recover(skip = false) {
    if (!user || lock.current || !value) return;
    const version = generation.current;
    const isCurrent = () => valid(version);
    lock.current = true; setBusy(true); setError('');
    try {
      let saved = ledger!;
      if (skip) saved = await skipRejectedRecoveryItem(user);
      else if (!saved.run && preview) saved = await beginRecovery(user, preview, items, exclusions, name, date);
      if (!isCurrent()) return;
      setState({ token, ledger: saved, preview: null });
      const result = await resumeRecovery(user, isCurrent);
      if (!isCurrent()) return;
      setState({ token, ledger: result, preview: null });
      if (!result.run && result.lastListId) navigation.replace('ShoppingDetail', { id: result.lastListId });
    } catch (failure) {
      if (!isCurrent()) return;
      setError(failure instanceof Error ? failure.message : 'Récupération interrompue. Reprends la même demande.');
      try { const saved = await readRecovery(user); if (isCurrent()) setState({ token, ledger: saved, preview: value.preview }); }
      catch { if (isCurrent()) setError('Impossible de lire le suivi local. Rouvre cet écran avant de réessayer.'); }
    } finally { if (isCurrent()) { lock.current = false; setBusy(false); } }
  }
  function toggle(selected: string[], key: string, setter: (value: string[]) => void) {
    setter(selected.includes(key) ? selected.filter(id => id !== key) : [...selected, key]);
  }
  return <RecipeScreen>
    <RecipeTitle>Récupérer mes anciennes données</RecipeTitle>
    <Text style={s.body}>Retrouve les articles de l’ancienne Épicerie enregistrés sur cet appareil pour ton compte. Rien n’est importé sans ta confirmation.</Text>
    {!user ? <RecipeButton title="Me connecter" onPress={() => requestSignIn('Connecte-toi pour récupérer tes anciennes données personnelles.')} /> : <>
      <Text style={s.note}>Les anciennes données restent conservées. Les articles récupérés ont une quantité à préciser. Les anciennes coches, possessions hebdomadaires, choix de produits et montants ne deviennent pas des achats ou des prix actuels. Pour tes repas, crée une liste depuis le calendrier.</Text>
      <Text style={s.note}>La récupération nécessite le réseau. Une interruption peut laisser un brouillon partiel ; reprends ici pour le compléter sans doublons.</Text>
      {busy && <ActivityIndicator accessibilityLabel="Récupération en cours" color={recipeColors.green} />}
      {run ? <View style={s.notice}>
        <Text style={s.sectionTitle}>Récupération à reprendre</Text>
        <Text style={s.body}>{run.name} · {run.itemIndex}/{run.items.length} articles et {run.exclusionIndex}/{run.exclusions.length} préférences traités.</Text>
        <RecipeButton title="Reprendre la récupération" disabled={busy} onPress={() => void recover()} />
        {run.listId && <RecipeButton title="Ouvrir le brouillon récupéré" variant="neutral" disabled={busy} onPress={() => navigation.navigate('ShoppingDetail', { id: run.listId! })} />}
        {run.pending?.rejection && run.pending.kind !== 'create' && <>
          <Text accessibilityRole="alert" style={s.requiredItem}>Élément refusé : {run.pending.kind === 'item' ? run.items[run.itemIndex]?.name : run.exclusions[run.exclusionIndex]?.name}. Il restera récupérable si tu l’ignores.</Text>
          <RecipeButton title="Ignorer cet élément refusé et continuer" variant="neutral" disabled={busy} onPress={() => void recover(true)} />
        </>}
      </View> : preview ? <>
        <Text style={s.body}>{preview.recoveredCount} entrée(s) déjà récupérée(s), ignorée(s) pour éviter les doublons.</Text>
        {preview.warnings.map((warning, index) => <Text key={index} style={s.requiredItem}>{warning}</Text>)}
        {!!preview.items.length && <>
          <RecipeField label="Nom du brouillon récupéré" value={name} maxLength={120} editable={!busy} onChangeText={setName} />
          <ListDateField label="Date prévue des courses" value={date} disabled={busy} onChange={setDate} />
          <Text style={s.sectionTitle}>Articles à récupérer</Text>
          {preview.items.map(item => <Pressable key={item.token} accessibilityRole="checkbox" accessibilityLabel={item.name} disabled={busy}
            accessibilityState={{ checked: items.includes(item.token), disabled: busy }} onPress={() => toggle(items, item.token, setItems)} style={[s.choice, { minHeight: 52 }]}>
            <Text style={s.body}>{items.includes(item.token) ? '☑' : '☐'} {item.name} · quantité à préciser{item.ingredientId ? '' : ' · article libre'}</Text>
          </Pressable>)}
        </>}
        {!!preview.exclusions.length && <>
          <Text style={s.sectionTitle}>Ancien « J’en ai toujours »</Text>
          <Text style={s.body}>Facultatif : coche les ingrédients à ne plus suggérer dans tes futures listes issues du calendrier. Les listes existantes et les modèles ne changent pas. Aucune quantité disponible n’est déclarée.</Text>
          {preview.exclusions.map(item => <Pressable key={item.token} accessibilityRole="checkbox" accessibilityLabel={`Ne plus suggérer ${item.name}`} disabled={busy}
            accessibilityState={{ checked: exclusions.includes(item.token), disabled: busy }} onPress={() => toggle(exclusions, item.token, setExclusions)} style={[s.choice, { minHeight: 52 }]}>
            <Text style={s.body}>{exclusions.includes(item.token) ? '☑' : '☐'} Ne plus suggérer {item.name}</Text>
          </Pressable>)}
        </>}
        {!preview.items.length && !preview.exclusions.length ? <Text style={s.body}>Aucune ancienne donnée récupérable pour ce compte sur cet appareil.</Text>
          : <RecipeButton title="Confirmer la récupération" disabled={busy || (!items.length && !exclusions.length) || (!!items.length && !name.trim())} onPress={() => void recover()} />}
      </> : !busy && !error && <Text style={s.body}>Récupération terminée.</Text>}
      {!run && <RecipeButton title="Actualiser l’aperçu" variant="neutral" disabled={busy} onPress={() => void load()} />}
    </>}
    <Message text={error} />
  </RecipeScreen>;
}
