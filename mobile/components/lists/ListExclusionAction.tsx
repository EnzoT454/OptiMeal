import { useRef, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { RecipeButton, recipeStyles as s } from '../recipes';
import { useListCommand } from './useListCommand';
import { listCommand } from '../../services/shoppingLists';
import { exclusionsPath } from '../../services/shoppingReuse';
import type { ShoppingExclusionRead } from '../../types/shoppingLists';

// onConfirmingChange : prévient la fiche quand la confirmation s'ouvre ou se ferme,
// pour qu'elle cache ses autres options pendant ce temps.
export default function ListExclusionAction({ ingredientId, name, disabled, onExcluded, itemLabel = 'produit', onConfirmingChange }: {
  ingredientId: string; name: string; disabled: boolean; onExcluded?: () => Promise<boolean>; itemLabel?: 'produit' | 'article';
  onConfirmingChange?: (confirming: boolean) => void;
}) {
  const command = useListCommand<ShoppingExclusionRead>(`exclusion:${ingredientId}`);
  const [confirming, setConfirming] = useState(false);
  const [saved, setSaved] = useState(false);
  const [removing, setRemoving] = useState(false);
  const active = useRef(false);
  function confirmer(ouvert: boolean) { setConfirming(ouvert); onConfirmingChange?.(ouvert); }
  async function exclude() {
    const result = await command.run(command.pending ?? listCommand(`${exclusionsPath}/${ingredientId}`, { excluded: true }, 'PUT'));
    if (result) { confirmer(false); setSaved(true); await removeExcluded(); }
  }
  async function removeExcluded() {
    if (!onExcluded || active.current) return;
    active.current = true; setRemoving(true);
    try { await onExcluded(); } finally { active.current = false; setRemoving(false); }
  }
  // Confirmation courte : ce qui se passe, et où l'annuler
  const confirmation = 'Il sera retiré de cette liste et ne sera plus ajouté à tes prochaines listes. Tu pourras l’annuler dans ton menu de compte.';
  return <View style={{ gap: 10 }}>
    {confirming && <View style={[s.notice, { gap: 10 }]}>
      {/* Le nom du produit est déjà en haut de la fiche : la question reste courte */}
      <Text accessibilityRole="header" style={s.sectionTitle}>Ne plus suggérer {onConfirmingChange ? `ce ${itemLabel}` : name} ?</Text>
      <Text style={s.body}>{confirmation}</Text>
      {/* Les deux boutons côte à côte : tout tient sans défiler */}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <RecipeButton title="Annuler" variant="neutral" disabled={command.busy || !!command.pending} onPress={() => confirmer(false)} />
        </View>
        <View style={{ flex: 1 }}>
          <RecipeButton title="Confirmer" disabled={disabled || command.locked} onPress={() => void exclude()} />
        </View>
      </View>
    </View>}
    {!saved && !confirming && <RecipeButton title="Ne plus suggérer" variant="neutral" disabled={disabled || command.locked} onPress={() => {
      if (onExcluded) { confirmer(true); return; }
      Alert.alert(`Ne plus suggérer ${name} ?`, 'Il ne sera plus ajouté à tes prochaines listes. Cette liste et tes modèles restent inchangés.',
        [{ text: 'Annuler', style: 'cancel' }, { text: 'Ne plus suggérer', onPress: () => void exclude() }]);
    }} />}
    {command.pending && <RecipeButton title="Reprendre la préférence" variant="neutral" disabled={command.busy} onPress={() => void exclude()} />}
    {!!command.error && <Text accessibilityRole="alert" style={s.requiredItem}>{command.error}</Text>}
    {saved && onExcluded && <RecipeButton title={`Retirer ${itemLabel === 'article' ? 'l’article' : 'le produit'} exclu de cette liste`} variant="neutral" disabled={disabled || removing} onPress={() => void removeExcluded()} />}
    {saved && <Text style={s.note}>{onExcluded ? 'Préférence enregistrée. Si le retrait a échoué, réessaie de retirer ce produit.' : 'Préférence enregistrée. Cet article reste dans ta liste.'}</Text>}
  </View>;
}