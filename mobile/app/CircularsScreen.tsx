import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Message } from '../components/ui';
import { RecipeButton, RecipeChip, RecipeScreen, RecipeTitle, recipeColors, recipeStyles } from '../components/recipes';
import { CIRCULAR_STYLE, RETAILERS, dateRange, fetchPromos } from '../components/promos';
import type { Offer } from '../types/api';
import { PromoStackParams } from '../types/navigation';

// Une « circulaire » = les promos de la semaine d'un magasin, regroupées à partir de /api/v1/offers.
export default function CircularsScreen({ navigation }: NativeStackScreenProps<PromoStackParams, 'Circulars'>) {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true); setError('');
    fetchPromos().then(items => { if (active) setOffers(items); })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Impossible de charger les circulaires.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]));

  return <RecipeScreen>
    <RecipeTitle onBack={() => navigation.goBack()}>Circulaires</RecipeTitle>
    <Text style={recipeStyles.intro}>Les promos de la semaine, magasin par magasin.</Text>

    <View style={recipeStyles.chips}>
      <RecipeChip label="Promotions" onPress={() => navigation.goBack()} />
      <RecipeChip label="Circulaires" selected />
    </View>

    {loading ? <ActivityIndicator color={recipeColors.green} style={{ marginTop: 24 }} />
      : error ? <View style={recipeStyles.notice}>
        <Message text={error} />
        <RecipeButton title="Réessayer" onPress={() => setRetry(retry + 1)} />
      </View>
      : RETAILERS.map(r => {
        const storeOffers = offers.filter(o => o.retailer === r.id);
        const { color, slogan } = CIRCULAR_STYLE[r.id];
        const content = <>
          <View style={[styles.cover, { backgroundColor: color }]}>
            <Text style={styles.coverName}>{r.name.toUpperCase()}</Text>
            <Text style={styles.slogan}>{slogan}</Text>
          </View>
          <View style={styles.info}>
            <Text style={styles.name}>{r.name.toUpperCase()}</Text>
            {storeOffers.length > 0 ? <>
              <Text style={recipeStyles.body}>{dateRange(storeOffers)}</Text>
              <Text style={recipeStyles.body}>{storeOffers.length} promo{storeOffers.length > 1 ? 's' : ''}</Text>
              <Text style={styles.open}>Ouvrir la circulaire →</Text>
            </> : <Text style={recipeStyles.body}>Aucune promo en cours</Text>}
          </View>
        </>;
        return storeOffers.length > 0
          ? <Pressable key={r.id} accessibilityRole="button" style={styles.card}
            onPress={() => navigation.navigate('Circular', { retailer: r.id })}>{content}</Pressable>
          : <View key={r.id} style={[styles.card, { opacity: 0.6 }]}>{content}</View>;
      })}
  </RecipeScreen>;
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: 16, backgroundColor: 'white', borderRadius: 16, padding: 16 },
  cover: { width: 130, borderRadius: 12, padding: 14, gap: 8 },
  coverName: { fontFamily: 'DMSans_700Bold', fontSize: 22, lineHeight: 28, color: recipeColors.green },
  slogan: { fontFamily: 'DMSans_700Bold', fontSize: 13, lineHeight: 18, color: recipeColors.ink },
  info: { flex: 1, gap: 6, paddingTop: 4 },
  name: { fontFamily: 'DMSans_700Bold', fontSize: 18, lineHeight: 24, color: recipeColors.ink },
  open: { fontFamily: 'DMSans_700Bold', fontSize: 14, lineHeight: 19, color: recipeColors.green, marginTop: 4 },
});