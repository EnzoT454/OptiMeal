import { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { RecipeButton, recipeStyles as s } from '../recipes';
import { useListCommand } from './useListCommand';
import { listCommand } from '../../services/shoppingLists';
import { exclusionsPath } from '../../services/shoppingReuse';
import type { ShoppingExclusionRead } from '../../types/shoppingLists';

export default function ListExclusionAction({ ingredientId, name, disabled }: {
  ingredientId: string; name: string; disabled: boolean;
}) {
  const command = useListCommand<ShoppingExclusionRead>(`exclusion:${ingredientId}`);
  const [saved, setSaved] = useState(false);
  async function exclude() {
    const result = await command.run(command.pending ?? listCommand(`${exclusionsPath}/${ingredientId}`, { excluded: true }, 'PUT'));
    if (result) setSaved(true);
  }
  return <View style={{ gap: 10 }}>
    <RecipeButton title="Ne plus suggérer" variant="neutral" disabled={disabled || command.locked} onPress={() => Alert.alert(
      `Ne plus suggérer ${name} ?`, 'Cet ingrédient sera exclu des prochaines listes générées depuis ton calendrier. Cette liste et tes modèles restent inchangés. Tu pourras l’ajouter manuellement et annuler ce choix dans Paramètres.',
      [{ text: 'Annuler', style: 'cancel' }, { text: 'Ne plus suggérer', onPress: () => void exclude() }])} />
    {command.pending && <RecipeButton title="Reprendre la préférence" variant="neutral" disabled={command.busy} onPress={() => void exclude()} />}
    {!!command.error && <Text accessibilityRole="alert" style={s.requiredItem}>{command.error}</Text>}
    {saved && <Text style={s.note}>Préférence enregistrée pour les prochaines générations. Cet article reste dans ta liste.</Text>}
  </View>;
}
