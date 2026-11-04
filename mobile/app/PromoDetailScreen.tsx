import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RecipeButton, RecipeScreen, RecipeTitle, recipeColors, recipeStyles, showRecipeComingSoon } from '../components/recipes';
import { currentPrice, discount, formatText, longDate, money, storeName, unitPrice } from '../components/promos';
import { ProductImage } from '../components/ProductImage';
import { deal, perWeight, saving } from '../components/deal';
import { getFollows, toggleFollow } from '../components/follows';
import { PromoStackParams } from '../types/navigation';

export default function PromoDetailScreen({ navigation, route }: NativeStackScreenProps<PromoStackParams, 'Detail'>) {
  const { offer } = route.params;
  const store = storeName(offer.retailer);
  const percent = discount(offer);
  const level = deal(percent);
  const saved = saving(offer);
  const perUnit = unitPrice(offer);
  const { valid_from, valid_to } = offer.promotion;
  // Produit hors promo : il est affiché à son prix régulier (promo_price = null, voir components/search.ts).
  const validity = !offer.promo_price ? 'Prix régulier : pas en promotion cette semaine'
    : valid_from && valid_to ? `Valide du ${longDate(valid_from)} au ${longDate(valid_to)}`
    : valid_to ? `Valide jusqu’au ${longDate(valid_to)}` : 'Dates de validité non indiquées';
  const url = offer.source.url;

  // Suivi de l'ingrédient de ce produit : prévenir quand un des 3 magasins le met en promo.
  const [followed, setFollowed] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    getFollows().then(list => { if (active) setFollowed(list.some(f => f.ingredient_id === offer.ingredient_id)); });
    return () => { active = false; };
  }, [offer.ingredient_id]);
  const onFollowPress = async () => {
    setBusy(true);
    try {
      const list = await toggleFollow(offer);
      setFollowed(list.some(f => f.ingredient_id === offer.ingredient_id));
    } finally {
      setBusy(false);
    }
  };

  return <RecipeScreen>
    <RecipeTitle onBack={() => navigation.goBack()}>{offer.promo_price ? 'La bonne affaire' : 'Le produit'}</RecipeTitle>

    <ProductImage uri={offer.image_url} size={220} style={styles.photo} />

    <View style={recipeStyles.chips}>
      <View style={styles.storeChip}><Text style={styles.storeChipText}>{store.toUpperCase()}</Text></View>
      {level && <View style={[styles.badge, { backgroundColor: level.background }]}>
        <Text style={[styles.badgeText, { color: level.color }]}>−{percent} %{level.label ? ` · ${level.label}` : ''}</Text>
      </View>}
    </View>

    <View style={{ gap: 6 }}>
      <Text style={styles.name}>{offer.product_name}</Text>
      {formatText(offer) && <Text style={recipeStyles.intro}>Format : {formatText(offer)}</Text>}
    </View>

    <View style={styles.priceBox}>
      <Text style={styles.price}>{money(currentPrice(offer))}{perWeight(offer)}</Text>
      {perUnit && <Text style={styles.unitPrice}>{perUnit}</Text>}
      {saved != null && <Text style={[styles.saving, { color: level?.text ?? recipeColors.green }]}>Économisez {money(saved)}{perWeight(offer)}</Text>}
      {offer.promo_price && <Text style={recipeStyles.body}>Prix régulier : {money(offer.price.amount)}{perWeight(offer)}</Text>}
    </View>

    {/* Bouton « Suivre » : contour vert si non suivi, plein vert une fois suivi. */}
    <View style={{ gap: 6 }}>
      <Pressable accessibilityRole="button" accessibilityState={{ selected: followed, busy: busy }} disabled={busy}
        onPress={onFollowPress} style={[styles.follow, followed && styles.followOn]}>
        <Ionicons name={followed ? 'checkmark' : 'notifications-outline'} size={22} color={followed ? 'white' : recipeColors.green} />
        <Text style={[styles.followText, followed && { color: 'white' }]}>
          {followed ? 'Suivi : on te prévient' : 'Me prévenir quand il est en promo'}
        </Text>
      </Pressable>
      <Text style={[recipeStyles.body, { textAlign: 'center' }]}>
        {followed ? 'Dans les 3 magasins · touche pour ne plus suivre'
          : 'On te prévient dès que Maxi, Metro ou Super C le met en promo.'}
      </Text>
    </View>

    <View style={styles.row}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.rowTitle}>{validity}</Text>
        {offer.retrieved_at && <Text style={recipeStyles.body}>Prix relevé le {longDate(offer.retrieved_at)}</Text>}
      </View>
    </View>

    {url && <Pressable accessibilityRole="link" onPress={() => Linking.openURL(url)} style={styles.row}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.rowTitle}>Voir chez {store}</Text>
        <Text style={recipeStyles.body}>Ouvre la fiche du produit sur le site du magasin</Text>
      </View>
      <Ionicons name="chevron-forward" size={22} color={recipeColors.ink} />
    </Pressable>}

    <RecipeButton title="Ajouter à la liste" onPress={() => showRecipeComingSoon('Liste d’achats')} />
    <Text style={recipeStyles.note}>
      Prix relevé en ligne : il peut varier en magasin.{offer.image_url ? ` Photo : ${store}.` : ''}
    </Text>
  </RecipeScreen>;
}

const styles = StyleSheet.create({
  photo: { alignSelf: 'center', width: '100%', borderRadius: 16 },
  storeChip: { backgroundColor: recipeColors.green, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  storeChipText: { fontFamily: 'DMSans_500Medium', fontSize: 13, lineHeight: 18, color: 'white' },
  badge: { backgroundColor: recipeColors.light, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  badgeText: { fontFamily: 'DMSans_700Bold', fontSize: 13, lineHeight: 18 },
  saving: { fontFamily: 'DMSans_700Bold', fontSize: 16, lineHeight: 22 },
  name: { fontFamily: 'DMSans_700Bold', fontSize: 28, lineHeight: 36, color: recipeColors.ink },
  priceBox: { backgroundColor: recipeColors.light, borderRadius: 16, padding: 22, gap: 6 },
  price: { fontFamily: 'DMSans_700Bold', fontSize: 40, lineHeight: 48, color: recipeColors.green },
  unitPrice: { fontFamily: 'DMSans_500Medium', fontSize: 16, lineHeight: 22, color: recipeColors.green },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  follow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 56,
    borderRadius: 16, borderWidth: 2, borderColor: recipeColors.green, backgroundColor: 'white', paddingHorizontal: 16 },
  followOn: { backgroundColor: recipeColors.green },
  followText: { fontFamily: 'DMSans_700Bold', fontSize: 16, lineHeight: 22, color: recipeColors.green, flexShrink: 1 },
  rowTitle: { fontFamily: 'DMSans_500Medium', fontSize: 16, lineHeight: 22, color: recipeColors.ink },
});