import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RecipeButton, RecipeScreen, RecipeTitle, recipeColors, recipeStyles, showRecipeComingSoon } from '../components/recipes';
import { currentPrice, discount, formatText, longDate, money, storeName, unitPrice } from '../components/promos';
import { ProductImage } from '../components/ProductImage';
import { PromoStackParams } from '../types/navigation';

export default function PromoDetailScreen({ navigation, route }: NativeStackScreenProps<PromoStackParams, 'Detail'>) {
  const { offer } = route.params;
  const store = storeName(offer.retailer);
  const percent = discount(offer);
  const perUnit = unitPrice(offer);
  const { valid_from, valid_to } = offer.promotion;
  const validity = valid_from && valid_to ? `Valide du ${longDate(valid_from)} au ${longDate(valid_to)}`
    : valid_to ? `Valide jusqu’au ${longDate(valid_to)}` : 'Dates de validité non indiquées';
  const url = offer.source.url;

  return <RecipeScreen>
    <RecipeTitle onBack={() => navigation.goBack()}>La bonne affaire</RecipeTitle>

    <ProductImage uri={offer.image_url} size={220} style={styles.photo} />

    <View style={recipeStyles.chips}>
      <View style={styles.storeChip}><Text style={styles.storeChipText}>{store.toUpperCase()}</Text></View>
      {percent != null && <View style={styles.badge}><Text style={styles.badgeText}>−{percent} %</Text></View>}
    </View>

    <View style={{ gap: 6 }}>
      <Text style={styles.name}>{offer.product_name}</Text>
      {formatText(offer) && <Text style={recipeStyles.intro}>Format : {formatText(offer)}</Text>}
    </View>

    <View style={styles.priceBox}>
      <Text style={styles.price}>{money(currentPrice(offer))}</Text>
      {perUnit && <Text style={styles.unitPrice}>{perUnit}</Text>}
      {offer.promo_price && <Text style={recipeStyles.body}>Prix régulier : {money(offer.price.amount)}</Text>}
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
  badgeText: { fontFamily: 'DMSans_500Medium', fontSize: 13, lineHeight: 18, color: recipeColors.green },
  name: { fontFamily: 'DMSans_700Bold', fontSize: 28, lineHeight: 36, color: recipeColors.ink },
  priceBox: { backgroundColor: recipeColors.light, borderRadius: 16, padding: 22, gap: 6 },
  price: { fontFamily: 'DMSans_700Bold', fontSize: 40, lineHeight: 48, color: recipeColors.green },
  unitPrice: { fontFamily: 'DMSans_500Medium', fontSize: 16, lineHeight: 22, color: recipeColors.green },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  rowTitle: { fontFamily: 'DMSans_500Medium', fontSize: 16, lineHeight: 22, color: recipeColors.ink },
});