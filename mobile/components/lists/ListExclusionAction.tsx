import { useRef, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { RecipeButton, recipeStyles as s } from '../recipes';
import { useListCommand } from './useListCommand';
import { listCommand } from '../../services/shoppingLists';
import { exclusionsPath } from '../../services/shoppingReuse';
import type { ShoppingExclusionRead } from '../../types/shoppingLists';

export default function ListExclusionAction({ ingredientId, name, disabled, onExcluded, itemLabel = 'produit' }: {
  ingredientId: string; name: string; disabled: boolean; onExcluded?: () => Promise<boolean>; itemLabel?: 'produit' | 'article';
}) {
  const command = useListCommand<ShoppingExclusionRead>(`exclusion:${ingredientId}`);
  const [confirming, setConfirming] = useState(false);
  const [saved, setSaved] = useState(false);
  const [removing, setRemoving] = useState(false);
  const active = useRef(false);
  async function exclude() {
    const result = await command.run(command.pending ?? listCommand(`${exclusionsPath}/${ingredientId}`, { excluded: true }, 'PUT'));
    if (result) { setConfirming(false); setSaved(true); await removeExcluded(); }
  }
  async function removeExcluded() {
    if (!onExcluded || active.current) return;
    active.current = true; setRemoving(true);
    try { await onExcluded(); } finally { active.current = false; setRemoving(false); }
  }
  const confirmation = `Cet ${itemLabel === 'article' ? 'article' : 'élément'} ne sera plus suggéré dans les prochaines listes générées depuis le calendrier et sera retiré de cette liste. Vous pourrez annuler cette préférence depuis les paramètres de votre compte. Cette préférence concerne son ingrédient dans tous les magasins.`;
  return <View style={{ gap: 10 }}>
    {confirming && <View style={s.notice}>
      <Text accessibilityRole="header" style={s.sectionTitle}>Ne plus suggérer {name} ?</Text>
      <Text style={s.body}>{confirmation}</Text>
      <RecipeButton title="Confirmer la préférence" disabled={disabled || command.locked} onPress={() => void exclude()} />
      <RecipeButton title="Annuler" variant="neutral" disabled={command.busy || !!command.pending} onPress={() => setConfirming(false)} />
    </View>}
    {!saved && !confirming && <RecipeButton title="Ne plus suggérer" variant="neutral" disabled={disabled || command.locked} onPress={() => {
      if (onExcluded) { setConfirming(true); return; }
      Alert.alert(`Ne plus suggérer ${name} ?`, 'Cet ingrédient sera exclu des prochaines listes générées depuis ton calendrier. Cette liste et tes modèles restent inchangés. Tu pourras l’ajouter manuellement et annuler ce choix dans les paramètres de ton compte.',
        [{ text: 'Annuler', style: 'cancel' }, { text: 'Ne plus suggérer', onPress: () => void exclude() }]);
    }} />}
    {command.pending && <RecipeButton title="Reprendre la préférence" variant="neutral" disabled={command.busy} onPress={() => void exclude()} />}
    {!!command.error && <Text accessibilityRole="alert" style={s.requiredItem}>{command.error}</Text>}
    {saved && onExcluded && <RecipeButton title={`Retirer ${itemLabel === 'article' ? 'l’article' : 'le produit'} exclu de cette liste`} variant="neutral" disabled={disabled || removing} onPress={() => void removeExcluded()} />}
    {saved && <Text style={s.note}>{onExcluded ? 'Préférence enregistrée. Si le retrait a échoué, réessayez de retirer ce produit.' : 'Préférence enregistrée pour les prochaines générations. Cet article reste dans ta liste.'}</Text>}
  </View>;
}
