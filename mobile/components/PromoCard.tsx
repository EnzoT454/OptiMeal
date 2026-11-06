import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { recipeColors, recipeStyles } from './recipes';
import { currentPrice, discount, formatText, longDate, money, storeName } from './promos';
import { deal, perWeight, saving } from './deal';
import type { Offer } from '../types/api';

// Affichage des produits, partagé par la page Promos et l'onglet Suivis.
// Deux présentations proposées par le prof, pour comparer :
//   « liste »  : PromoCard, une carte par ligne (photo à gauche avec le badge, infos et prix à droite)
//   « grille » : PromoTile, 2 colonnes (image en haut, titre et prix dessous)
// En promo : badge coloré « −30 % ». Hors promo : étiquette grise « Prix régulier ».

export type PromoView = 'list' | 'grid';

// Cloche de suivi : suivre CE produit dans CE magasin (vide grise = pas suivi, pleine verte = suivi).
export interface FollowProps { isFollowed?: (offer: Offer) => boolean; onToggleFollow?: (offer: Offer) => void }

// Liste de produits dans la présentation choisie.
export function PromoList({ offers, view, onOpen, isFollowed, onToggleFollow }: FollowProps & {
  offers: Offer[]; view: PromoView; onOpen: (offer: Offer) => void;
}) {
  const props = (o: Offer) => ({ offer: o, onPress: () => onOpen(o),
    followed: isFollowed?.(o), onToggleFollow: onToggleFollow && (() => onToggleFollow(o)) });
  if (view === 'grid') return <View style={styles.grid}>
    {offers.map(o => <PromoTile key={o.id} {...props(o)} />)}
  </View>;
  return <>{offers.map(o => <PromoCard key={o.id} {...props(o)} />)}</>;
}

type CardProps = { offer: Offer; onPress: () => void; followed?: boolean; onToggleFollow?: () => void };

// Version 1 (liste) : photo à gauche avec le badge « −30 % » dessus ; à droite, de haut en bas :
// magasin + cloche, titre, format, prix + ancien prix barré, « Économisez … », date de fin (petite, grise).
export function PromoCard({ offer, onPress, followed, onToggleFollow }: CardProps) {
  const percent = discount(offer);
  const level = deal(percent);
  const saved = saving(offer);
  const end = offer.promo_price ? longDate(offer.promotion.valid_to) : null; // pas de date de fin hors promo
  const format = formatText(offer);
  return <Pressable accessibilityRole="button" accessibilityHint="Affiche le détail du produit" onPress={onPress} style={styles.card}>
    <View style={styles.cardPhoto}>
      <Photo uri={offer.image_url} fill />
      {level && <PercentBadge percent={percent} level={level} />}
    </View>
    <View style={styles.cardInfo}>
      <View style={styles.topRow}>
        <Text style={styles.store}>{storeName(offer.retailer).toUpperCase()}</Text>
        {onToggleFollow && <Bell offer={offer} followed={!!followed} onPress={onToggleFollow} />}
      </View>
      <Text style={styles.name} numberOfLines={3}>{offer.product_name}</Text>
      {!!format && <Text style={recipeStyles.body}>{format}</Text>}
      <PriceLine offer={offer} />
      {saved != null && <Text style={[styles.dealLine, { color: level?.text ?? recipeColors.muted }]}>
        Économisez {money(saved)}{perWeight(offer)}
      </Text>}
      {!level && <RegularTag small />}
      {!!end && <Text style={styles.endDate}>Jusqu’au {end}</Text>}
    </View>
  </Pressable>;
}

// Version 2 (grille) : image en haut avec le badge et la cloche par-dessus, puis magasin, titre, prix.
// Taille du texte limitée (maxFontSizeMultiplier) : la carte ne fait que la moitié de l'écran.
export function PromoTile({ offer, onPress, followed, onToggleFollow }: CardProps) {
  const percent = discount(offer);
  const level = deal(percent);
  const saved = saving(offer);
  return <Pressable accessibilityRole="button" accessibilityHint="Affiche le détail du produit" onPress={onPress} style={styles.tile}>
    <View>
      <Photo uri={offer.image_url} style={styles.tilePhoto} />
      {level && <PercentBadge percent={percent} level={level} />}
      {onToggleFollow && <View style={styles.tileBell}>
        <Bell offer={offer} followed={!!followed} onPress={onToggleFollow} round />
      </View>}
    </View>
    <Text style={styles.store} maxFontSizeMultiplier={1.2}>{storeName(offer.retailer).toUpperCase()}</Text>
    <Text style={styles.tileName} numberOfLines={2} maxFontSizeMultiplier={1.2}>{offer.product_name}</Text>
    <PriceLine offer={offer} small />
    {/* Économie sur une ligne, sous le prix (comme dans l'app Maxi). */}
    {saved != null && <Text style={[styles.tileDeal, { color: level?.text ?? recipeColors.muted }]}
      numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1.2}>
      Économisez {money(saved)}{perWeight(offer)}
    </Text>}
    {!level && <RegularTag small />}
  </Pressable>;
}

// Bouton liste / grille, à côté du titre de la page.
export function ViewToggle({ value, onChange }: { value: PromoView; onChange: (view: PromoView) => void }) {
  return <View style={styles.toggle}>
    {([['list', 'list', 'Afficher en liste'], ['grid', 'grid-outline', 'Afficher en grille']] as const).map(([view, icon, label]) =>
      <Pressable key={view} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: value === view }}
        onPress={() => onChange(view)} style={[styles.toggleItem, value === view && styles.toggleOn]}>
        <Ionicons name={icon} size={20} color={value === view ? 'white' : recipeColors.muted} />
      </Pressable>)}
  </View>;
}

// Nouveau prix (grand, vert) et, en promo, l'ancien prix barré à côté (petit, gris).
function PriceLine({ offer, small }: { offer: Offer; small?: boolean }) {
  const onPromo = offer.promo_price?.amount != null;
  return <View style={styles.priceLine}>
    <Text style={[small ? styles.tilePrice : styles.price, !onPromo && styles.regularPrice]} maxFontSizeMultiplier={1.2}>
      {money(currentPrice(offer))}{perWeight(offer)}
    </Text>
    {onPromo && <Text style={styles.oldPrice} maxFontSizeMultiplier={1.2}
      accessibilityLabel={`au lieu de ${money(offer.price.amount)}`}>{money(offer.price.amount)}</Text>}
  </View>;
}

// Badge « −30 % » posé en haut à gauche de la photo (liste et grille).
function PercentBadge({ percent, level }: { percent: number | null; level: NonNullable<ReturnType<typeof deal>> }) {
  return <View style={[styles.badge, styles.photoBadge, { backgroundColor: level.background }]}>
    <Text style={[styles.badgeText, { color: level.color }]} maxFontSizeMultiplier={1.2}>−{percent} %</Text>
  </View>;
}

function Bell({ offer, followed, onPress, round }: { offer: Offer; followed: boolean; onPress: () => void; round?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: followed }}
    accessibilityLabel={followed ? `Ne plus suivre ${offer.product_name}`
      : `Me prévenir quand ${offer.product_name} est en promo chez ${storeName(offer.retailer)}`}
    onPress={onPress} hitSlop={6} style={round ? styles.bellRound : styles.bell}>
    <Ionicons name={followed ? 'notifications' : 'notifications-outline'} size={22}
      color={followed ? recipeColors.green : recipeColors.muted} />
  </Pressable>;
}

function RegularTag({ small }: { small?: boolean }) {
  return <View style={[styles.regularTag, small && { alignSelf: 'flex-start' }]}>
    <Text style={styles.regularTagText} maxFontSizeMultiplier={1.2}>Prix régulier</Text>
  </View>;
}

// Photo carrée du produit ; une icône si le produit n'a pas de photo ou si elle ne charge pas.
// fill : la photo remplit toute la hauteur de la carte (liste) au lieu d'être un carré (grille).
function Photo({ uri, style, fill }: { uri?: string | null; style?: object; fill?: boolean }) {
  const [failed, setFailed] = useState(false);
  return <View style={[fill ? styles.photoFill : styles.photoBox, style]}>
    {uri && !failed
      ? <Image source={{ uri }} style={styles.photoImage} resizeMode="contain" onError={() => setFailed(true)}
        accessibilityIgnoresInvertColors />
      : <Ionicons name="image-outline" size={32} color={recipeColors.muted} />}
  </View>;
}

// Titre de section (« EN PROMO · 2 », « PRIX RÉGULIER · 3 »).
export const sectionStyle = { fontFamily: 'DMSans_700Bold', fontSize: 13, lineHeight: 18, letterSpacing: 0.8,
  color: recipeColors.muted, marginTop: 8 } as const;

const styles = StyleSheet.create({
  // Version 1
  // La photo occupe tout le côté gauche, du haut en bas de la carte, collée aux bords (coins arrondis par la carte).
  card: { flexDirection: 'row', backgroundColor: 'white', borderRadius: 16, overflow: 'hidden' },
  cardPhoto: { width: '38%' },
  cardInfo: { flex: 1, gap: 4, padding: 14 },
  endDate: { fontFamily: 'DMSans_400Regular', fontSize: 13, lineHeight: 18, color: recipeColors.muted },
  // Version 2
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  tile: { width: '48.5%', backgroundColor: 'white', borderRadius: 16, padding: 10, gap: 4 },
  tilePhoto: { width: '100%', marginBottom: 4 },
  photoBadge: { position: 'absolute', top: 6, left: 6 },
  tileBell: { position: 'absolute', top: 2, right: 2 },
  tileName: { fontFamily: 'DMSans_700Bold', fontSize: 15, lineHeight: 20, color: recipeColors.ink, minHeight: 40 },
  tileDeal: { fontFamily: 'DMSans_700Bold', fontSize: 12, lineHeight: 16 },
  tilePrice: { fontFamily: 'DMSans_700Bold', fontSize: 19, lineHeight: 25, color: recipeColors.green },
  // Communs
  // Fond blanc, comme le fond des photos des magasins : la photo se fond dans la carte.
  photoBox: { aspectRatio: 1, borderRadius: 12, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center' },
  // Liste : la colonne de gauche va du haut au bas de la carte, fond blanc comme les photos ;
  // la photo y est entière (« contain »), centrée, sans être agrandie ni coupée.
  photoFill: { flex: 1, minHeight: 130, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center' },
  photoImage: { position: 'absolute', top: 6, left: 6, right: 6, bottom: 6 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 16 },
  // Zone tactile de 44 px, débordant un peu dans la marge pour ne pas pousser le texte.
  bell: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', margin: -14 },
  bellRound: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)' },
  store: { fontFamily: 'DMSans_700Bold', fontSize: 12, lineHeight: 16, color: recipeColors.green, letterSpacing: 0.5 },
  name: { fontFamily: 'DMSans_700Bold', fontSize: 18, lineHeight: 24, color: recipeColors.ink },
  price: { fontFamily: 'DMSans_700Bold', fontSize: 22, lineHeight: 28, color: recipeColors.green },
  badge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontFamily: 'DMSans_700Bold', fontSize: 13, lineHeight: 18 },
  priceLine: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 8, marginTop: 2 },
  oldPrice: { fontFamily: 'DMSans_500Medium', fontSize: 14, lineHeight: 19, color: recipeColors.muted,
    textDecorationLine: 'line-through' },
  dealLine: { fontFamily: 'DMSans_700Bold', fontSize: 13, lineHeight: 18 },
  // Produit hors promo : prix en gris foncé et petite étiquette grise, sans couleur de rabais.
  regularPrice: { color: recipeColors.ink },
  regularTag: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#eceeed' },
  regularTagText: { fontFamily: 'DMSans_500Medium', fontSize: 13, lineHeight: 18, color: '#4a524e' },
  toggle: { flexDirection: 'row', backgroundColor: recipeColors.light, borderRadius: 12, padding: 3 },
  toggleItem: { width: 40, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  toggleOn: { backgroundColor: recipeColors.green },
});