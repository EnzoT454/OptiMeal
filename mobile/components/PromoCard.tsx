import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { recipeColors, recipeStyles } from './recipes';
import { currentPrice, discount, formatText, longDate, money, storeName } from './promos';
import { ProductImage } from './ProductImage';
import { deal, perWeight, saving } from './deal';
import type { Offer } from '../types/api';

// Carte d'un produit, partagée par la page Promos et l'onglet Suivis.
// En promo : badge coloré « −30 % » et « Économisez … ». Hors promo : carte sobre avec « Prix régulier ».

// Carte en une seule colonne de texte : reste lisible même avec une grande taille de police sur le téléphone.
// followed / onToggleFollow : la cloche en haut à droite (vide grise = pas suivi, pleine verte = suivi).
export function PromoCard({ offer, onPress, followed, onToggleFollow }: {
  offer: Offer; onPress: () => void; followed?: boolean; onToggleFollow?: () => void;
}) {
  const percent = discount(offer);
  const level = deal(percent);
  const saved = saving(offer);
  const end = offer.promo_price ? longDate(offer.promotion.valid_to) : null; // pas de date de fin hors promo
  const details = [formatText(offer), end && `jusqu’au ${end}`].filter(Boolean).join(' · ');
  const dealLine = saved != null ? `Économisez ${money(saved)}${perWeight(offer)}` : '';
  return <Pressable accessibilityRole="button" accessibilityHint="Affiche le détail de la promo" onPress={onPress} style={styles.card}>
    <ProductImage uri={offer.image_url} size={64} style={styles.photo} />
    <View style={styles.info}>
      <View style={styles.topRow}>
        <Text style={styles.store}>{storeName(offer.retailer).toUpperCase()}</Text>
        {onToggleFollow && <Pressable accessibilityRole="button" accessibilityState={{ selected: !!followed }}
          accessibilityLabel={followed ? `Ne plus suivre ${offer.product_name}` : `Me prévenir quand ${offer.product_name} est en promo`}
          onPress={onToggleFollow} style={styles.bell}>
          <Ionicons name={followed ? 'notifications' : 'notifications-outline'} size={22}
            color={followed ? recipeColors.green : recipeColors.muted} />
        </Pressable>}
      </View>
      <Text style={styles.name} numberOfLines={2}>{offer.product_name}</Text>
      {!!details && <Text style={recipeStyles.body}>{details}</Text>}
      <View style={styles.priceRow}>
        <Text style={[styles.price, !offer.promo_price && styles.regularPrice]}>{money(currentPrice(offer))}{perWeight(offer)}</Text>
        {!offer.promo_price && <View style={styles.regularTag}><Text style={styles.regularTagText}>Prix régulier</Text></View>}
        {level && <View style={[styles.badge, { backgroundColor: level.background }]}>
          <Text style={[styles.badgeText, { color: level.color }]}>−{percent} %</Text>
        </View>}
      </View>
      {!!dealLine && <Text style={[styles.dealLine, { color: level?.text ?? recipeColors.muted }]}>{dealLine}</Text>}
    </View>
  </Pressable>;
}


// Titre de section (« EN PROMO · 2 », « PRIX RÉGULIER · 3 »).
export const sectionStyle = { fontFamily: 'DMSans_700Bold', fontSize: 13, lineHeight: 18, letterSpacing: 0.8,
  color: recipeColors.muted, marginTop: 8 } as const;

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, backgroundColor: 'white', borderRadius: 16, padding: 16 },
  photo: { backgroundColor: recipeColors.light },
  info: { flex: 1, gap: 4 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 16 },
  // Zone tactile de 44 px, débordant un peu dans la marge de la carte pour ne pas pousser le texte.
  bell: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', margin: -14 },
  store: { fontFamily: 'DMSans_700Bold', fontSize: 12, lineHeight: 16, color: recipeColors.green, letterSpacing: 0.5 },
  name: { fontFamily: 'DMSans_700Bold', fontSize: 18, lineHeight: 24, color: recipeColors.ink },
  priceRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  price: { fontFamily: 'DMSans_700Bold', fontSize: 22, lineHeight: 28, color: recipeColors.green },
  badge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontFamily: 'DMSans_700Bold', fontSize: 13, lineHeight: 18 },
  dealLine: { fontFamily: 'DMSans_700Bold', fontSize: 13, lineHeight: 18 },
  // Produit hors promo : prix en gris foncé et petite étiquette grise, sans couleur de rabais.
  regularPrice: { color: recipeColors.ink },
  regularTag: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#eceeed' },
  regularTagText: { fontFamily: 'DMSans_500Medium', fontSize: 13, lineHeight: 18, color: '#4a524e' },
});