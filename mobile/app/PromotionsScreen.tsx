import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Message } from '../components/ui';
import {
  RecipeButton, RecipeChip, RecipeField, RecipeScreen, RecipeTitle, recipeColors, recipeStyles, showRecipeComingSoon,
} from '../components/recipes';
import { api } from '../services/api';
import type { Offer, Page, Retailer } from '../types/api';

// Pour tester avec des promos passées, mettre une date ici (ex. '2026-10-05').
// Laisser undefined pour utiliser la date du jour.
const ON_DATE: string | undefined = undefined;


const RETAILERS: { id: Retailer; name: string }[] = [
  { id: 'maxi', name: 'Maxi' }, { id: 'metro', name: 'Metro' }, { id: 'superc', name: 'Super C' },
];
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function money(amount: string | null | undefined) {
  return amount == null ? '—' : `${Number(amount).toFixed(2).replace('.', ',')} $`;
}
// '2026-10-07' → '7 octobre' (sans passer par Date, pour éviter un décalage de fuseau horaire)
function longDate(value: string | null | undefined) {
  if (!value) return null;
  const [, month, day] = value.split('-').map(Number);
  return `${day} ${MONTHS[month - 1]}`;
}
function discount(offer: Offer) {
  const regular = Number(offer.price.amount);
  const promo = Number(offer.promo_price?.amount);
  if (!regular || !promo || promo >= regular) return null;
  return Math.round((1 - promo / regular) * 100);
}
// Recherche sans accents ni majuscules : « oeuf » trouve « Œufs ».
function normalize(text: string) {
  return text.toLowerCase().replace(/œ/g, 'oe').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export default function PromotionsScreen() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [evaluatedOn, setEvaluatedOn] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState('');
  const [retailer, setRetailer] = useState<Retailer | null>(null);

  // Recharge à chaque ouverture de l'onglet (même principe que RecipeListScreen).
  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true); setError('');
    const params = new URLSearchParams({ promotion_only: 'true', limit: '100' });
    if (ON_DATE) params.set('on_date', ON_DATE);
    api<Page<Offer>>('/api/v1/offers?' + params).then(page => {
      if (!active) return;
      setOffers(page.items);
      setEvaluatedOn(page.items[0]?.promotion.evaluated_on ?? ON_DATE ?? null);
    }).catch(e => {
      if (active) setError(e instanceof Error ? e.message : 'Impossible de charger les promos.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]));

  // Recherche et filtre appliqués dans l'app : une seule requête, résultat instantané.
  const visible = useMemo(() => {
    const words = normalize(query.trim());
    return offers
      .filter(o => (!retailer || o.retailer === retailer) && (!words || normalize(o.product_name).includes(words)))
      .sort((a, b) => (discount(b) ?? 0) - (discount(a) ?? 0));
  }, [offers, retailer, query]);

  return <RecipeScreen>
    <RecipeTitle>Promos</RecipeTitle>

    <View style={recipeStyles.chips}>
      <RecipeChip label="Promotions" selected />
      <RecipeChip label="Circulaires" onPress={() => showRecipeComingSoon('Circulaires')} />
    </View>

    <RecipeField label="Rechercher un produit" placeholder="Poulet, lait, légumes…" value={query} onChangeText={setQuery} />

    <View style={recipeStyles.chips}>
      <RecipeChip label="Tous" selected={!retailer} onPress={() => setRetailer(null)} />
      {RETAILERS.map(r => <RecipeChip key={r.id} label={r.name} selected={retailer === r.id}
        onPress={() => setRetailer(retailer === r.id ? null : r.id)} />)}
    </View>

    <View style={{ gap: 4 }}>
      <Text style={recipeStyles.sectionTitle}>Cette semaine</Text>
      <Text style={recipeStyles.body}>
        {evaluatedOn ? `Promos en cours le ${longDate(evaluatedOn)}` : 'Promos en cours'}
        {!loading && !error ? ` · ${visible.length} promo${visible.length > 1 ? 's' : ''}` : ''}
      </Text>
    </View>

    {loading ? <ActivityIndicator color={recipeColors.green} style={{ marginTop: 24 }} />
      : error ? <View style={recipeStyles.notice}>
        <Message text={error} />
        <RecipeButton title="Réessayer" onPress={() => setRetry(retry + 1)} />
      </View>
      : visible.length === 0 ? <View style={recipeStyles.notice}>
        <Text style={recipeStyles.sectionTitle}>Aucune promo trouvée</Text>
        <Text style={recipeStyles.body}>
          {offers.length ? 'Essaie une autre recherche ou un autre magasin.' : 'Reviens après la prochaine mise à jour des circulaires.'}
        </Text>
      </View>
      : <>
        {visible.map(o => <PromoCard key={o.id} offer={o} />)}
        <RecipeButton title="Cuisiner avec les promos" variant="neutral" style={styles.cookButton}
          textStyle={{ color: recipeColors.green }} onPress={() => showRecipeComingSoon('Cuisiner avec les promos')} />
        <Text style={recipeStyles.note}>Prix relevés en ligne : ils peuvent varier en magasin.</Text>
      </>}
  </RecipeScreen>;
}

function PromoCard({ offer }: { offer: Offer }) {
  const store = RETAILERS.find(r => r.id === offer.retailer)?.name ?? offer.retailer;
  const percent = discount(offer);
  const format = offer.format.quantity && offer.format.unit_raw ? `${offer.format.quantity} ${offer.format.unit_raw}` : null;
  const end = longDate(offer.promotion.valid_to);
  const details = [format, end && `jusqu’au ${end}`].filter(Boolean).join(' · ');
  return <View style={styles.card}>
    <View style={styles.info}>
      <View style={styles.storeRow}>
        <Text style={styles.store}>{store.toUpperCase()}</Text>
        {percent != null && <View style={styles.badge}><Text style={styles.badgeText}>−{percent} %</Text></View>}
      </View>
      <Text style={styles.name} numberOfLines={2}>{offer.product_name}</Text>
      {!!details && <Text style={recipeStyles.body}>{details}</Text>}
    </View>
    <Text style={styles.price}>{money(offer.promo_price?.amount ?? offer.price.amount)}</Text>
  </View>;
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'white', borderRadius: 16, padding: 16 },
  info: { flex: 1, gap: 4 },
  storeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 28 },
  store: { fontFamily: 'DMSans_700Bold', fontSize: 12, lineHeight: 16, color: recipeColors.green, letterSpacing: 0.5 },
  badge: { backgroundColor: recipeColors.light, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  badgeText: { fontFamily: 'DMSans_500Medium', fontSize: 12, lineHeight: 16, color: recipeColors.green },
  name: { fontFamily: 'DMSans_700Bold', fontSize: 17, lineHeight: 23, color: recipeColors.ink },
  price: { fontFamily: 'DMSans_700Bold', fontSize: 22, lineHeight: 28, color: recipeColors.green },
  cookButton: { backgroundColor: recipeColors.light, borderWidth: 0 },
});