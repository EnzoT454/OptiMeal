import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Message } from '../components/ui';
import { RecipeButton, RecipeChip, RecipeScreen, RecipeTitle, recipeColors, recipeStyles } from '../components/recipes';
import { ON_DATE, RETAILERS, discount } from '../components/promos';
import { fetchAllOffers, fetchKeywords, isOnPromo, searchScore, searchWords } from '../components/search';
import { PromoList, PromoView, ViewToggle, sectionStyle } from '../components/PromoCard';
import { followedOnPromo, followsOffer } from '../components/follows';
import { useFollows } from '../components/useFollows';
import { OngletsPromos } from '../components/OngletsPromos';
import { CATEGORIES, CategoryRow } from '../components/categories';
import type { Offer, Retailer } from '../types/api';
import { PromoStackParams } from '../types/navigation';

export default function PromotionsScreen({ navigation }: NativeStackScreenProps<PromoStackParams, 'List'>) {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [, setEvaluatedOn] = useState<string | null>(null);                    // date des promos (plus affichée)
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState('');
  const [retailer, setRetailer] = useState<Retailer | null>(null);
  const [category, setCategory] = useState<number | null>(null);
  const [keywords, setKeywords] = useState<Record<string, string>>({});       // alias de chaque ingrédient
  const { follows, recharger: reloadFollows, toggle: toggleFollow, error: followError } = useFollows();
  const [view, setView] = useState<PromoView>('grid');                          // présentation : grille ou liste
  const [suggere, setSuggere] = useState(false);                                // afficher les suggestions sous le champ

  // L'app se souvient de la dernière présentation choisie.
  useEffect(() => { AsyncStorage.getItem(VIEW_KEY).then(v => { if (v === 'list' || v === 'grid') setView(v); }).catch(() => {}); }, []);
  const changeView = (v: PromoView) => { setView(v); AsyncStorage.setItem(VIEW_KEY, v).catch(() => {}); };

  // Recharge à chaque ouverture de l'onglet (même principe que RecipeListScreen).
  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true); setError('');
    void reloadFollows();
    Promise.all([fetchAllOffers(), fetchKeywords()]).then(async ([items, aliases]) => {
      if (!active) return;
      await reloadFollows(items);
      if (!active) return;
      setOffers(items);
      setKeywords(aliases);
      setEvaluatedOn(items[0]?.promotion.evaluated_on ?? ON_DATE ?? null);
    }).catch(e => {
      if (active) setError(e instanceof Error ? e.message : 'Impossible de charger les promos.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry, reloadFollows]));

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
    .filter(({ o }) => searching || !category || o.category_id === category)   // pendant une recherche : toutes les catégories
    .sort((a, b) => b.score - a.score || (discount(b.o) ?? 0) - (discount(a.o) ?? 0)
      || a.o.product_name.localeCompare(b.o.product_name, 'fr'))
    .map(({ o }) => o), [found, category, searching]);
  const promos = visible.filter(isOnPromo);
  const regular = visible.filter(o => !isOnPromo(o));

  // Nombre de produits par catégorie, pour griser les catégories vides.
  const counts = useMemo(() => {
    const result: Record<number, number> = {};
    found.forEach(({ o }) => { if (o.category_id != null) result[o.category_id] = (result[o.category_id] ?? 0) + 1; });
    return result;
  }, [found]);
  // Nombre de produits suivis en promo cette semaine (pastille rouge de l'onglet « Suivis »).
  const alerts = useMemo(() => followedOnPromo(follows, offers), [follows, offers]);
  const list = (items: Offer[]) => <PromoList offers={items} view={view}
    onOpen={o => navigation.navigate('Detail', { offer: o })}
    isFollowed={o => follows.some(f => followsOffer(f, o))} onToggleFollow={toggleFollow} />;
  const categoryName = CATEGORIES.find(c => c.id === category)?.name;

  // Suggestions pendant la frappe (dès 2 lettres) : 5 noms au plus, les promos d'abord
  const suggestions = useMemo(() => {
    if (query.trim().length < 2) return [];
    const vus = new Set<string>();
    return found
      .slice()
      .sort((a, b) => b.score - a.score || Number(isOnPromo(b.o)) - Number(isOnPromo(a.o)) || (discount(b.o) ?? 0) - (discount(a.o) ?? 0))
      .map(({ o }) => o)
      .filter(o => {
        const cle = o.product_name.toLowerCase();
        if (vus.has(cle)) return false;
        vus.add(cle);
        return true;
      })
      .slice(0, 5);
  }, [found, query]);
  const choisirSuggestion = (o: Offer) => { setQuery(o.product_name); setSuggere(false); Keyboard.dismiss(); };

  return <RecipeScreen>
    {/* En-tête : le titre et l'accès aux circulaires */}
    <View style={styles.entete}>
      <View style={{ flex: 1 }}><RecipeTitle>Promos</RecipeTitle></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Voir les circulaires" hitSlop={8}
        onPress={() => navigation.navigate('Circulars')}
        style={({ pressed }) => [styles.boutonCirculaires, pressed && { opacity: 0.7 }]}>
        <MaterialCommunityIcons name="newspaper-variant-outline" size={18} color={recipeColors.green} accessible={false} />
        <Text style={styles.texteCirculaires} maxFontSizeMultiplier={1.2}>Circulaires</Text>
      </Pressable>
    </View>
    {!!followError && <Message text={followError} />}

    <OngletsPromos actif="promos" nbSuivis={alerts} />

    {/* Recherche compacte : loupe, champ, et ✕ pour effacer */}
    <View style={styles.recherche}>
      <MaterialCommunityIcons name="magnify" size={22} color={recipeColors.muted} accessible={false} />
      <TextInput
        value={query}
        onChangeText={t => { setQuery(t); setSuggere(true); }}
        onFocus={() => setSuggere(true)}
        onSubmitEditing={() => setSuggere(false)}
        placeholder="Poulet, lait, légumes…"
        placeholderTextColor={recipeColors.muted}
        style={styles.champ}
        accessibilityLabel="Rechercher un produit"
        returnKeyType="search"
        autoCorrect={false}
      />
      {query.length > 0 && (
        <Pressable accessibilityRole="button" accessibilityLabel="Effacer la recherche" onPress={() => { setQuery(''); setSuggere(false); }} hitSlop={10}>
          <MaterialCommunityIcons name="close-circle" size={20} color={recipeColors.muted} />
        </Pressable>
      )}
    </View>

    {/* Suggestions sous le champ : un appui lance la recherche et ferme le clavier */}
    {suggere && suggestions.length > 0 && (
      <View style={styles.suggestions} accessibilityRole="list">
        {suggestions.map((o, index) => {
          const pct = isOnPromo(o) ? discount(o) : null;
          return (
            <Pressable key={o.id} accessibilityRole="button" accessibilityLabel={`Chercher ${o.product_name}`}
              onPress={() => choisirSuggestion(o)}
              style={({ pressed }) => [styles.suggestion, index > 0 && styles.separateur, pressed && { backgroundColor: recipeColors.light }]}>
              <MaterialCommunityIcons name="magnify" size={18} color={recipeColors.muted} accessible={false} />
              <Text style={styles.texteSuggestion} numberOfLines={1}>{o.product_name}</Text>
              {pct != null && <View style={styles.pastille}><Text style={styles.textePastille}>−{pct} %</Text></View>}
            </Pressable>
          );
        })}
      </View>
    )}

    {/* Catégories : cachées pendant une recherche pour que les résultats arrivent sous le champ */}
    {!searching && <CategoryRow selected={category} counts={counts} onChange={setCategory} />}

    {/* Magasins : toute la ligne pour eux */}
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.magasins}>
      <RecipeChip label="Tous" selected={!retailer} onPress={() => setRetailer(null)} />
      {RETAILERS.map(r => <RecipeChip key={r.id} label={r.name} selected={retailer === r.id}
        onPress={() => setRetailer(retailer === r.id ? null : r.id)} />)}
    </ScrollView>

    {/* Titre de section + présentation (grille ou liste) : caché pendant une recherche */}
    {!searching && (
      <View style={styles.ligneTitre}>
        <Text style={[recipeStyles.sectionTitle, { flex: 1 }]} numberOfLines={1}>{categoryName ?? 'Cette semaine'}</Text>
        <ViewToggle value={view} onChange={changeView} />
      </View>
    )}

    {loading ? <ActivityIndicator color={recipeColors.green} style={{ marginTop: 24 }} />
      : error ? <View style={recipeStyles.notice}>
        <Message text={error} />
        <RecipeButton title="Réessayer" onPress={() => setRetry(retry + 1)} />
      </View>
      : visible.length === 0 ? <View style={recipeStyles.notice}>
        <Text style={recipeStyles.sectionTitle}>{searching ? 'Aucun produit trouvé' : 'Aucune promo trouvée'}</Text>
        <Text style={recipeStyles.body}>
          {!offers.length ? 'Reviens après la prochaine mise à jour des circulaires.'
            : !searching && category ? 'Rien dans cette catégorie. Essaie une autre catégorie ou un autre magasin.'
            : 'Essaie une autre recherche ou un autre magasin.'}
        </Text>
      </View>
      : <>
        {/* Section 1 : les promos (cartes colorées). Sans recherche, c'est la seule section. */}
        {searching && promos.length > 0 && <Text style={sectionStyle}>EN PROMO · {promos.length}</Text>}
        {list(promos)}
        {/* Section 2 (seulement avec une recherche) : les produits au prix régulier (cartes sobres). */}
        {regular.length > 0 && <>
          <Text style={sectionStyle}>PRIX RÉGULIER · {regular.length}</Text>
          {!promos.length && <Text style={recipeStyles.body}>Pas en promo cette semaine.</Text>}
          {list(regular)}
        </>}
     </>}
  </RecipeScreen>;
}

function plural(count: number, word: string) {
  return `${count} ${word}${count > 1 ? 's' : ''}`;
}

const VIEW_KEY = 'optimeal.promosView';

const styles = StyleSheet.create({
  entete: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  boutonCirculaires: {
    flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 12,
    borderRadius: 18, backgroundColor: recipeColors.light,
  },
  texteCirculaires: { fontFamily: 'DMSans_700Bold', fontSize: 14, lineHeight: 19, color: recipeColors.green },

  recherche: {
    flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: 12,
    backgroundColor: 'white', borderRadius: 14, borderWidth: 1, borderColor: recipeColors.border,
  },
  champ: { flex: 1, fontFamily: 'DMSans_400Regular', fontSize: 16, color: recipeColors.ink, paddingVertical: 10 },

  suggestions: { backgroundColor: 'white', borderRadius: 14, borderWidth: 1, borderColor: recipeColors.border, marginTop: -6, overflow: 'hidden' },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 46, paddingHorizontal: 12 },
  separateur: { borderTopWidth: 1, borderTopColor: recipeColors.border },
  texteSuggestion: { flex: 1, fontFamily: 'DMSans_500Medium', fontSize: 15, lineHeight: 20, color: recipeColors.ink },
  pastille: { backgroundColor: '#fff1d6', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  textePastille: { fontFamily: 'DMSans_700Bold', fontSize: 12, lineHeight: 16, color: '#7a4106' },

  magasins: { gap: 8, alignItems: 'center' },
  ligneTitre: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});