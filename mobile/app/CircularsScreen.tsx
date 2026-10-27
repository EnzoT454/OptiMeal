import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Message } from '../components/ui';
import { RecipeButton, RecipeChip, RecipeScreen, RecipeTitle, recipeColors, recipeStyles } from '../components/recipes';
import { CIRCULAR_STYLE, RETAILERS, fetchCirculars, longDate, todayText } from '../components/promos';
import type { Circular } from '../types/api';
import { PromoStackParams } from '../types/navigation';

// Les vraies circulaires de la semaine (PDF du magasin découpé en images, servi par /api/v1/circulars).
export default function CircularsScreen({ navigation }: NativeStackScreenProps<PromoStackParams, 'Circulars'>) {
  const [circulars, setCirculars] = useState<Circular[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true); setError('');
    fetchCirculars().then(items => { if (active) setCirculars(items); })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Impossible de charger les circulaires.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]));

  const today = todayText();

  return <RecipeScreen>
    <RecipeTitle onBack={() => navigation.goBack()}>Circulaires</RecipeTitle>
    <Text style={recipeStyles.intro}>Les circulaires de la semaine, magasin par magasin.</Text>

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
        const circular = circulars.find(c => c.retailer === r.id);
        const { color, slogan } = CIRCULAR_STYLE[r.id];
        const expired = !!circular && circular.valid_to < today;
        const content = <>
          {circular
            // Couverture : la 1re page de la vraie circulaire.
            ? <Image source={{ uri: circular.pages[0] }} style={styles.cover} resizeMode="cover"
              accessibilityLabel={`Première page de la circulaire ${r.name}`} />
            : <View style={[styles.cover, styles.placeholder, { backgroundColor: color }]}>
              <Text style={styles.coverName}>{r.name.toUpperCase()}</Text>
              <Text style={styles.slogan}>{slogan}</Text>
            </View>}
          <View style={styles.info}>
            <Text style={styles.name}>{r.name.toUpperCase()}</Text>
            {circular ? <>
              <Text style={recipeStyles.body}>Du {longDate(circular.valid_from)} au {longDate(circular.valid_to)}</Text>
              <Text style={recipeStyles.body}>{circular.page_count} page{circular.page_count > 1 ? 's' : ''}</Text>
              {expired && <Text style={styles.expired}>Circulaire terminée</Text>}
              <Text style={styles.open}>Ouvrir la circulaire →</Text>
            </> : <Text style={recipeStyles.body}>Pas encore de circulaire cette semaine</Text>}
          </View>
        </>;
        return circular
          ? <Pressable key={r.id} accessibilityRole="button" style={styles.card}
            onPress={() => navigation.navigate('Circular', { circular })}>{content}</Pressable>
          : <View key={r.id} style={[styles.card, { opacity: 0.6 }]}>{content}</View>;
      })}
  </RecipeScreen>;
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: 16, backgroundColor: 'white', borderRadius: 16, padding: 16 },
  cover: { width: 110, height: 150, borderRadius: 12, backgroundColor: recipeColors.light },
  placeholder: { padding: 12, gap: 6 },
  coverName: { fontFamily: 'DMSans_700Bold', fontSize: 18, lineHeight: 24, color: recipeColors.green },
  slogan: { fontFamily: 'DMSans_700Bold', fontSize: 12, lineHeight: 16, color: recipeColors.ink },
  info: { flex: 1, gap: 6, paddingTop: 4 },
  name: { fontFamily: 'DMSans_700Bold', fontSize: 18, lineHeight: 24, color: recipeColors.ink },
  expired: { fontFamily: 'DMSans_500Medium', fontSize: 13, lineHeight: 18, color: '#a5442b' },
  open: { fontFamily: 'DMSans_700Bold', fontSize: 14, lineHeight: 19, color: recipeColors.green, marginTop: 4 },
});