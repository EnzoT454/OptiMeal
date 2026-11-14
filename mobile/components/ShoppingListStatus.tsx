import { Pressable, Text, View } from 'react-native';
import { recipeStyles } from './recipes';
import type { ListeAchats } from './useShoppingList';

// Une lecture réussie ne vaut pas confirmation d'une écriture échouée.
export default function ShoppingListStatus({ liste }: { liste: ListeAchats }) {
  return <View style={{ gap: 8 }}>
    {liste.erreurChargement && <View accessibilityRole="alert" style={{ gap: 6 }}>
      <Text style={recipeStyles.body}>{liste.erreurChargement}</Text>
      <Pressable accessibilityRole="button" disabled={liste.chargement} onPress={liste.recharger}>
        <Text style={recipeStyles.body}>Réessayer le chargement</Text>
      </Pressable>
    </View>}
    {liste.erreurEnregistrement && <View accessibilityRole="alert" style={{ gap: 6 }}>
      <Text style={recipeStyles.body}>{liste.erreurEnregistrement}</Text>
      <Pressable accessibilityRole="button" onPress={liste.reessayerEnregistrement}>
        <Text style={recipeStyles.body}>Réessayer l’enregistrement</Text>
      </Pressable>
    </View>}
    {liste.avertissement && <Text accessibilityRole="alert" style={recipeStyles.body}>{liste.avertissement}</Text>}
  </View>;
}
