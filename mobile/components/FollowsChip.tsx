import { StyleSheet, Text, View } from 'react-native';
import { RecipeChip } from './recipes';

// Onglet « Suivis » avec une pastille rouge : nombre de produits suivis en promo cette semaine
// (comme une notification). Pas de pastille quand aucun produit suivi n'est en promo.
export function FollowsChip({ count, selected, onPress }: { count: number; selected?: boolean; onPress?: () => void }) {
  return <View>
    <RecipeChip label="Suivis" selected={selected} onPress={onPress} />
    {count > 0 && <View pointerEvents="none" style={styles.dot}
      accessibilityLabel={`${count} produit${count > 1 ? 's' : ''} suivi${count > 1 ? 's' : ''} en promo`}>
      <Text style={styles.dotText} maxFontSizeMultiplier={1.3}>{count}</Text>
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  dot: { position: 'absolute', top: -7, right: -7, minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#d1361b', borderWidth: 2, borderColor: 'white' },
  dotText: { fontFamily: 'DMSans_700Bold', fontSize: 12, lineHeight: 15, color: 'white' },
});