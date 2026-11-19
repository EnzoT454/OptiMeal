import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { recipeColors } from './recipes';

// Les 8 catégories communes aux trois magasins (mêmes numéros que data/catalog/baseCommune/categories.json).
export const CATEGORIES = [
  { id: 1, name: 'Légumes', icon: 'carrot' },
  { id: 2, name: 'Fruits', icon: 'food-apple' },
  { id: 3, name: 'Viandes', icon: 'food-drumstick' },
  { id: 4, name: 'Poissons', icon: 'fish' },
  { id: 5, name: 'Produits laitiers', icon: 'cheese' },
  { id: 6, name: 'Œufs', icon: 'egg' },
  { id: 7, name: 'Épicerie', icon: 'basket' },
  { id: 8, name: 'Boulangerie', icon: 'bread-slice' },
] as const;

type IconName = (typeof CATEGORIES)[number]['icon'];

const MARGE = 20;          // marge de l'écran (la rangée déborde jusqu'au bord)
const ESPACE = 6;          // espace entre deux catégories
const VISIBLES = 4.5;      // 4 catégories entières + la moitié de la 5e : on voit qu'on peut défiler

// Rangée d'icônes rondes qui défile horizontalement. Toucher une catégorie la sélectionne, retoucher l'enlève.
// counts : nombre de promos par catégorie ; une catégorie vide est grisée.
export function CategoryRow({ selected, counts, onChange }: {
  selected: number | null; counts: Record<number, number>; onChange: (id: number | null) => void;
}) {
  const { width } = useWindowDimensions();
  // Largeur d'une catégorie calculée selon l'écran, pour que la coupure tombe au milieu d'un cercle
  const largeur = Math.floor((width - MARGE - ESPACE * Math.floor(VISIBLES)) / VISIBLES);

  return <ScrollView horizontal showsHorizontalScrollIndicator={false}
    style={styles.scroll} contentContainerStyle={styles.row}>
    {CATEGORIES.map(c => {
      const active = selected === c.id;
      const empty = !counts[c.id];
      return <Pressable key={c.id} accessibilityRole="button" accessibilityState={{ selected: active }}
        accessibilityLabel={`${c.name}, ${counts[c.id] ?? 0} promo${(counts[c.id] ?? 0) > 1 ? 's' : ''}`}
        onPress={() => onChange(active ? null : c.id)} style={[styles.item, { width: largeur }, empty && !active && styles.empty]}>
        <View style={[styles.circle, active && styles.circleActive]}>
          <MaterialCommunityIcons name={c.icon as IconName} size={28} color={active ? 'white' : recipeColors.green} />
        </View>
        <Text style={[styles.label, active && styles.labelActive]} numberOfLines={2} maxFontSizeMultiplier={1.3}>
          {c.name}
        </Text>
      </Pressable>;
    })}
  </ScrollView>;
}

const styles = StyleSheet.create({
  // Déborde jusqu'aux bords de l'écran pour bien montrer qu'on peut faire défiler.
  scroll: { marginHorizontal: -MARGE },
  row: { paddingHorizontal: MARGE, gap: ESPACE },
  item: { alignItems: 'center', gap: 6 },
  empty: { opacity: 0.4 },
  circle: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: recipeColors.light },
  circleActive: { backgroundColor: recipeColors.green },
  label: { fontFamily: 'DMSans_500Medium', fontSize: 12, lineHeight: 15, color: recipeColors.ink, textAlign: 'center' },
  labelActive: { fontFamily: 'DMSans_700Bold', color: recipeColors.green },
});