import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Message } from '../components/ui';
import {
  RecipeButton, RecipeChip, RecipeField, RecipeScreen, RecipeTitle, recipeColors, recipeStyles,
} from '../components/recipes';
import { ON_DATE, RETAILERS, discount, longDate } from '../components/promos';
import { fetchAllOffers, fetchKeywords, isOnPromo, searchScore, searchWords } from '../components/search';
import { PromoCard, sectionStyle } from '../components/PromoCard';
import { Follow, followedOnPromo, getFollows, toggleFollow } from '../components/follows';
import { FollowsChip } from '../components/FollowsChip';
import { CATEGORIES, CategoryRow } from '../components/categories';
import type { Offer, Retailer } from '../types/api';
import { PromoStackParams } from '../types/navigation';

export default function PromotionsScreen({ navigation }: NativeStackScreenProps<PromoStackParams, 'List'>) {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [evaluatedOn, setEvaluatedOn] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState('');
  const [retailer, setRetailer] = useState<Retailer | null>(null);
  const [category, setCategory] = useState<number | null>(null);
  const [keywords, setKeywords] = useState<Record<string, string>>({});       // alias de chaque ingrédient
  const [follows, setFollows] = useState<Follow[]>([]);                         // ingrédients suivis

  // Recharge à chaque ouverture de l'onglet (même principe que RecipeListScreen).
  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true); setError('');
    getFollows().then(list => { if (active) setFollows(list); });
    Promise.all([fetchAllOffers(), fetchKeywords()]).then(([items, aliases]) => {
      if (!active) return;
      setOffers(items);
      setKeywords(aliases);
      setEvaluatedOn(items[0]?.promotion.evaluated_on ?? ON_DATE ?? null);
    }).catch(e => {
      if (active) setError(e instanceof Error ? e.message : 'Impossible de charger les promos.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]));

  // Recherche et filtres appliqués dans l'app : une seule requête, résultat instantané.
  // Sans recherche : seulement les promos. Avec une recherche : promos ET produits au prix régulier,
  // affichés dans deux sections séparées.
  const searched = useMemo(() => searchWords(query), [query]);
  const searching = searched.length > 0;
  const base = useMemo(() => (searching ? offers : offers.filter(isOnPromo)), [offers, searching]);
  // Produits qui correspondent à la recherche, avec le magasin choisi (sans le filtre de catégorie).
  const found = useMemo(() => base
    .map(o => ({ o, score: searchScore(searched, o, keywords) }))
    .filter(({ o, score }) => score > 0 && (!retailer || o.retailer === retailer)), [base, searched, keywords, retailer]);
  // Les plus pertinents d'abord, puis les plus gros rabais, puis l'ordre alphabétique.
  const visible = useMemo(() => found
    .filter(({ o }) => !category || o.category_id === category)
    .sort((a, b) => b.score - a.score || (discount(b.o) ?? 0) - (discount(a.o) ?? 0)
      || a.o.product_name.localeCompare(b.o.product_name, 'fr'))
    .map(({ o }) => o), [found, category]);
  const promos = visible.filter(isOnPromo);
  const regular = visible.filter(o => !isOnPromo(o));

  // Nombre de produits par catégorie, pour griser les catégories vides.
  const counts = useMemo(() => {
    const result: Record<number, number> = {};
    found.forEach(({ o }) => { if (o.category_id != null) result[o.category_id] = (result[o.category_id] ?? 0) + 1; });
    return result;
  }, [found]);
  // Nombre d'ingrédients suivis en promo cette semaine (affiché sur l'onglet « Suivis »).
  const alerts = useMemo(() => followedOnPromo(follows, offers), [follows, offers]);
  const followedIds = useMemo(() => new Set(follows.map(f => f.ingredient_id)), [follows]);
  const bell = (o: Offer) => ({
    followed: followedIds.has(o.ingredient_id),
    onToggleFollow: () => { toggleFollow(o).then(setFollows); },
  });
  const categoryName = CATEGORIES.find(c => c.id === category)?.name;

  return <RecipeScreen>
    <RecipeTitle>Promos</RecipeTitle>

    <View style={recipeStyles.chips}>
      <RecipeChip label="Promotions" selected />
      <RecipeChip label="Circulaires" onPress={() => navigation.navigate('Circulars')} />
      <FollowsChip count={alerts} onPress={() => navigation.navigate('Follows')} />
    </View>

    <RecipeField label="Rechercher un produit" placeholder="Poulet, lait, légumes…" value={query} onChangeText={setQuery} />

    <CategoryRow selected={category} counts={counts} onChange={setCategory} />

    <View style={recipeStyles.chips}>
      <RecipeChip label="Tous" selected={!retailer} onPress={() => setRetailer(null)} />
      {RETAILERS.map(r => <RecipeChip key={r.id} label={r.name} selected={retailer === r.id}
        onPress={() => setRetailer(retailer === r.id ? null : r.id)} />)}
    </View>

    <View style={{ gap: 4 }}>
      <Text style={recipeStyles.sectionTitle}>{categoryName ?? 'Cette semaine'}</Text>
      <Text style={recipeStyles.body}>
        {loading || error ? (evaluatedOn ? `Promos en cours le ${longDate(evaluatedOn)}` : 'Promos en cours')
          : searching ? `${promos.length} en promo · ${regular.length} au prix régulier`
          : `${evaluatedOn ? `Promos en cours le ${longDate(evaluatedOn)}` : 'Promos en cours'} · ${plural(promos.length, 'promo')}`}
      </Text>
    </View>

    {loading ? <ActivityIndicator color={recipeColors.green} style={{ marginTop: 24 }} />
      : error ? <View style={recipeStyles.notice}>
        <Message text={error} />
        <RecipeButton title="Réessayer" onPress={() => setRetry(retry + 1)} />
      </View>
      : visible.length === 0 ? <View style={recipeStyles.notice}>
        <Text style={recipeStyles.sectionTitle}>{searching ? 'Aucun produit trouvé' : 'Aucune promo trouvée'}</Text>
        <Text style={recipeStyles.body}>
          {!offers.length ? 'Reviens après la prochaine mise à jour des circulaires.'
            : category ? 'Rien dans cette catégorie. Essaie une autre catégorie ou un autre magasin.'
            : 'Essaie une autre recherche ou un autre magasin.'}
        </Text>
      </View>
      : <>
        {/* Section 1 : les promos (cartes colorées). Sans recherche, c'est la seule section. */}
        {searching && promos.length > 0 && <Text style={sectionStyle}>EN PROMO · {promos.length}</Text>}
        {promos.map(o => <PromoCard key={o.id} offer={o} {...bell(o)} onPress={() => navigation.navigate('Detail', { offer: o })} />)}
        {/* Section 2 (seulement avec une recherche) : les produits au prix régulier (cartes sobres). */}
        {regular.length > 0 && <>
          <Text style={sectionStyle}>PRIX RÉGULIER · {regular.length}</Text>
          {!promos.length && <Text style={recipeStyles.body}>Pas en promo cette semaine.</Text>}
          {regular.map(o => <PromoCard key={o.id} offer={o} {...bell(o)} onPress={() => navigation.navigate('Detail', { offer: o })} />)}
        </>}
        <RecipeButton title="Cuisiner avec les promos" variant="neutral" style={styles.cookButton}
          textStyle={{ color: recipeColors.green }} onPress={() => navigation.navigate('Cook')} />
        <Text style={recipeStyles.note}>Prix relevés en ligne : ils peuvent varier en magasin.</Text>
      </>}
  </RecipeScreen>;
}

function plural(count: number, word: string) {
  return `${count} ${word}${count > 1 ? 's' : ''}`;
}

const styles = StyleSheet.create({
  cookButton: { backgroundColor: recipeColors.light, borderWidth: 0 },
});