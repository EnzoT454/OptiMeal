import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Message } from '../components/ui';
import { RecipeButton, RecipeScreen, RecipeTitle, recipeColors, recipeStyles } from '../components/recipes';
import { CIRCULAR_STYLE, currentPrice, dateRange, discount, fetchPromos, formatText, money, storeName } from '../components/promos';
import type { Offer } from '../types/api';
import { PromoStackParams } from '../types/navigation';

// La circulaire d'un magasin : ses promos en cours, de la plus grosse économie à la plus petite.
export default function CircularScreen({ navigation, route }: NativeStackScreenProps<PromoStackParams, 'Circular'>) {
  const { retailer } = route.params;
  const store = storeName(retailer);
  const { color, slogan } = CIRCULAR_STYLE[retailer];
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true); setError('');
    fetchPromos().then(items => {
      if (active) setOffers(items.filter(o => o.retailer === retailer)
        .sort((a, b) => (discount(b) ?? 0) - (discount(a) ?? 0)));
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Impossible de charger la circulaire.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retailer, retry]));

  return <RecipeScreen>
    <RecipeTitle onBack={() => navigation.goBack()}>Circulaire {store}</RecipeTitle>
    {!loading && !error && <Text style={recipeStyles.body}>
      {dateRange(offers)} · {offers.length} promo{offers.length > 1 ? 's' : ''}
    </Text>}

    {loading ? <ActivityIndicator color={recipeColors.green} style={{ marginTop: 24 }} />
      : error ? <View style={recipeStyles.notice}>
        <Message text={error} />
        <RecipeButton title="Réessayer" onPress={() => setRetry(retry + 1)} />
      </View>
      : <View style={[styles.panel, { backgroundColor: color }]}>
        <Text style={styles.store}>{store.toUpperCase()}</Text>
        <Text style={styles.slogan}>{slogan}</Text>
        {offers.length === 0 && <Text style={recipeStyles.body}>Aucune promo en cours dans ce magasin.</Text>}
        {offers.map(o => <Pressable key={o.id} accessibilityRole="button" style={styles.item}
          onPress={() => navigation.navigate('Detail', { offer: o })}>
          <Text style={styles.name} numberOfLines={2}>{o.product_name}</Text>
          <View style={styles.priceRow}>
            <Text style={styles.price}>{money(currentPrice(o))}</Text>
            {discount(o) != null && <Text style={styles.badge}>−{discount(o)} %</Text>}
          </View>
          {formatText(o) && <Text style={recipeStyles.body}>{formatText(o)}</Text>}
        </Pressable>)}
      </View>}
    <Text style={recipeStyles.note}>Circulaire reconstituée à partir des prix relevés en ligne.</Text>
  </RecipeScreen>;
}

const styles = StyleSheet.create({
  panel: { borderRadius: 18, padding: 20, gap: 14 },
  store: { fontFamily: 'DMSans_700Bold', fontSize: 34, lineHeight: 42, color: recipeColors.green },
  slogan: { fontFamily: 'DMSans_700Bold', fontSize: 24, lineHeight: 31, color: recipeColors.ink, marginBottom: 6 },
  item: { backgroundColor: 'white', borderRadius: 14, padding: 18, gap: 4 },
  name: { fontFamily: 'DMSans_700Bold', fontSize: 18, lineHeight: 24, color: recipeColors.ink },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  price: { fontFamily: 'DMSans_700Bold', fontSize: 26, lineHeight: 33, color: recipeColors.green },
  badge: { fontFamily: 'DMSans_500Medium', fontSize: 12, lineHeight: 16, color: recipeColors.green,
    backgroundColor: recipeColors.light, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, overflow: 'hidden' },
});