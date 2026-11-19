import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Message } from '../components/ui';
import { RecipeButton, RecipeScreen, RecipeTitle, recipeColors as c, recipeStyles } from '../components/recipes';
import { currentPrice, discount, fetchPromos, storeName } from '../components/promos';
import { api, ApiError } from '../services/api';
import type { Detail, Offer, Page, Recipe, RecipeSummary } from '../types/api';
import { PromoStackParams } from '../types/navigation';

// Une recette, les promos qui correspondent à ses ingrédients, et l'économie totale.
type Match = { recipe: Recipe; offers: Offer[]; economie: number };
type Tri = 'economie' | 'promos';

const RABAIS_MINIMUM = 5; // en %, en dessous ce n'est pas une vraie promo
const ORANGE_FONCE = '#7a4106';
const ORANGE_PALE = '#fff1d6';
const PRIX_PROMO = '#b45309';

const TRIS: { id: Tri; label: string }[] = [
  { id: 'economie', label: 'Économie' },
  { id: 'promos', label: 'Ingrédients en promo' },
];

const enDollars = (n: number) => `${n.toFixed(2).replace('.', ',')} $`;

// Toutes les recettes visibles par l'utilisateur, page par page (20 à la fois, comme l'écran Recettes).
async function fetchAllRecipes() {
  const summaries: RecipeSummary[] = [];
  let total = 1;
  while (summaries.length < total) {
    const page = await api<Page<RecipeSummary>>(`/api/v1/recipes?limit=20&offset=${summaries.length}`);
    summaries.push(...page.items);
    total = page.total;
    if (page.items.length === 0) break;
  }
  // La liste ne contient pas les ingrédients : on lit le détail de chaque recette.
  const recipes = await Promise.all(summaries.map(async summary => {
    try { return (await api<Detail<Recipe>>('/api/v1/recipes/' + summary.id)).item; }
    catch (error) {
      // Une recette peut avoir été supprimée ou rendue privée depuis la liste.
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  }));
  return recipes.filter((recipe): recipe is Recipe => recipe !== null);
}

// Prix régulier et prix promo d'une offre (null si inconnus)
function prixRegulier(o: Offer): number | null {
  const n = Number(o.price.amount);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function prixPromo(o: Offer): number | null {
  const n = Number(o.promo_price?.amount);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Économie d'une offre : prix régulier − prix promo (0 si on ne peut pas la calculer)
function economieDe(o: Offer): number {
  const base = prixRegulier(o);
  const promo = prixPromo(o);
  if (base === null || promo === null || base <= promo) return 0;
  return base - promo;
}

// Une vraie promo : au moins 5 % de rabais, ou au moins 1 $ économisé.
// Si le rabais est inconnu, on ne rejette pas la promo.
function vraiePromo(o: Offer): boolean {
  const pct = discount(o);
  if (pct == null) return true;
  return pct >= RABAIS_MINIMUM || economieDe(o) >= 1;
}

// "★ 4,5/5 · 3 évaluations" ou "Pas encore évaluée" (jamais de fausse note 0)
function texteNote(r: Recipe): string {
  if (!r.rating || r.rating.count === 0 || r.rating.average == null) return 'Pas encore évaluée';
  const moyenne = Number(r.rating.average).toLocaleString('fr-CA', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `★ ${moyenne}/5 · ${r.rating.count} évaluation${r.rating.count > 1 ? 's' : ''}`;
}

// Pour chaque ingrédient, la vraie promo la moins chère (tous magasins confondus).
function bestOfferByIngredient(offers: Offer[]) {
  const best = new Map<string, Offer>();
  for (const offer of offers.filter(vraiePromo)) {
    const current = best.get(offer.ingredient_id);
    if (!current || Number(currentPrice(offer)) < Number(currentPrice(current))) best.set(offer.ingredient_id, offer);
  }
  return best;
}

function trier(matches: Match[], tri: Tri): Match[] {
  const copie = [...matches];
  if (tri === 'economie') copie.sort((a, b) => b.economie - a.economie || b.offers.length - a.offers.length);
  if (tri === 'promos') copie.sort((a, b) => b.offers.length - a.offers.length || b.economie - a.economie);
  return copie;
}

export default function CookWithPromosScreen({ navigation }: NativeStackScreenProps<PromoStackParams, 'Cook'>) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [tri, setTri] = useState<Tri>('economie');
  const [ouverte, setOuverte] = useState<string | null>(null); // la carte dépliée

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true); setError('');
    Promise.all([fetchPromos(), fetchAllRecipes()]).then(([offers, recipes]) => {
      if (!active) return;
      const best = bestOfferByIngredient(offers);
      const found = recipes
        .map(recipe => {
          const ids = [...new Set(recipe.ingredients.map(i => i.ingredient_id))];
          const recipeOffers = ids.map(id => best.get(id)).filter((o): o is Offer => !!o)
            .sort((a, b) => economieDe(b) - economieDe(a));
          const economie = recipeOffers.reduce((total, o) => total + economieDe(o), 0);
          return { recipe, offers: recipeOffers, economie };
        })
        .filter(m => m.offers.length > 0);
      setMatches(found);
    }).catch(e => {
      if (active) setError(e instanceof Error ? e.message : 'Impossible de charger les recettes.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]));

  // La recette s'ouvre dans l'onglet Promos : la flèche retour revient ici
  const openRecipe = (id: string) => navigation.navigate('Recette', { id });

  const affichees = trier(matches, tri);
  const meilleure = matches.reduce((max, m) => Math.max(max, m.economie), 0);

  return <RecipeScreen>
    <RecipeTitle onBack={() => navigation.goBack()}>Cuisiner avec les promos</RecipeTitle>

    {loading ? <ActivityIndicator color={c.green} style={{ marginTop: 24 }} />
      : error ? <View style={recipeStyles.notice}>
        <Message text={error} />
        <RecipeButton title="Réessayer" onPress={() => setRetry(retry + 1)} />
      </View>
      : matches.length === 0 ? <View style={recipeStyles.notice}>
        <Text style={recipeStyles.sectionTitle}>Aucune recette pour l’instant</Text>
        <Text style={recipeStyles.body}>Aucun ingrédient de tes recettes n’est en promo cette semaine.</Text>
      </View>
      : <>
        {/* Résumé : un appui remet le tri par économies */}
        <Pressable accessibilityRole="button" accessibilityHint="Trie les recettes par économies"
          onPress={() => setTri('economie')} style={({ pressed }) => [styles.resume, pressed && { opacity: 0.85 }]}>
          <Text style={styles.resumeSurtitre}>Cette semaine</Text>
          <Text style={styles.resumeTitre}>
            {meilleure >= 1 ? `Jusqu'à ${Math.round(meilleure)} $ d'économies sur une recette` : 'Des recettes en promo'}
          </Text>
          <Text style={styles.resumeTexte}>
            {matches.length} recette{matches.length > 1 ? 's' : ''} avec des ingrédients en promo
          </Text>
        </Pressable>

        {/* Tri : 2 choix, sans défilement */}
        <Text style={[styles.detail, { marginBottom: -4 }]}>Trier par</Text>
        <View style={styles.puces}>
          {TRIS.map(t => {
            const actif = t.id === tri;
            return <Pressable key={t.id} accessibilityRole="radio" accessibilityState={{ selected: actif }}
              onPress={() => setTri(t.id)} style={[styles.puce, actif && styles.puceActive]}>
              <Text style={[styles.textePuce, actif && styles.textePuceActive]}>{t.label}</Text>
            </Pressable>;
          })}
        </View>

        {affichees.map(m => (
          <CarteRecette
            key={m.recipe.id}
            match={m}
            ouverte={ouverte === m.recipe.id}
            onBasculer={() => setOuverte(ouverte === m.recipe.id ? null : m.recipe.id)}
            onVoirRecette={() => openRecipe(m.recipe.id)}
          />
        ))}
      </>}
  </RecipeScreen>;
}

// Carte d'une recette : un appui la déplie pour montrer quoi acheter, où, et à quel prix
function CarteRecette({ match, ouverte, onBasculer, onVoirRecette }: {
  match: Match; ouverte: boolean; onBasculer: () => void; onVoirRecette: () => void;
}) {
  const { recipe, offers, economie } = match;
  const nbIngredients = new Set(recipe.ingredients.map(i => i.ingredient_id)).size;
  const magasins = [...new Set(offers.map(o => storeName(o.retailer)))].join(', ');

  return <View style={styles.carte}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: ouverte }}
      accessibilityHint={ouverte ? 'Cache les produits en promo' : 'Montre les produits en promo'}
      onPress={onBasculer} style={({ pressed }) => [styles.entete, pressed && { opacity: 0.75 }]}>
      {recipe.image_url ? (
        <Image source={{ uri: recipe.image_url }} style={styles.photo} accessible={false} />
      ) : (
        <View style={[styles.photo, styles.photoVide]}>
          <MaterialCommunityIcons name="silverware-fork-knife" size={26} color={c.green} accessible={false} />
        </View>
      )}

      <View style={styles.infos}>
        <Text style={styles.nom} numberOfLines={2}>{recipe.name}</Text>
        <Text style={styles.detail}>
          {recipe.total_time_minutes} min · {offers.length} ingr. en promo sur {nbIngredients}
        </Text>
        <Text style={styles.detail}>{texteNote(recipe)}</Text>
        {!ouverte && <Text style={styles.detail} numberOfLines={1}>Chez {magasins}</Text>}
        {economie > 0 && (
          <View style={styles.economie}>
            <Text style={styles.texteEconomie}>Tu économises ≈ {enDollars(economie)}</Text>
          </View>
        )}
      </View>

      <MaterialCommunityIcons name={ouverte ? 'chevron-up' : 'chevron-down'} size={24} color={c.muted} accessible={false} />
    </Pressable>

    {ouverte && (
      <View style={styles.depliee}>
        <Text style={styles.titreProduits}>À acheter en promo</Text>
        {offers.map(o => {
          const promo = prixPromo(o);
          const base = prixRegulier(o);
          const pct = discount(o);
          return <View key={o.id} style={styles.produit}>
            <View style={{ flex: 1, gap: 1 }}>
              <Text style={styles.magasin}>{storeName(o.retailer).toUpperCase()}</Text>
              <Text style={styles.nomProduit} numberOfLines={2}>{o.product_name}</Text>
            </View>
            <View style={styles.prix}>
              {promo !== null && <Text style={styles.prixPromo}>{enDollars(promo)}</Text>}
              <View style={styles.ligneRabais}>
                {base !== null && <Text style={styles.prixBarre}>{enDollars(base)}</Text>}
                {pct != null && <View style={styles.pastille}><Text style={styles.textePastille}>−{pct} %</Text></View>}
              </View>
            </View>
          </View>;
        })}

        <Pressable accessibilityRole="button" accessibilityHint="Ouvre la recette" onPress={onVoirRecette}
          style={({ pressed }) => [styles.boutonRecette, pressed && { opacity: 0.8 }]}>
          <Text style={styles.texteBoutonRecette}>Voir la recette</Text>
          <MaterialCommunityIcons name="arrow-right" size={18} color="white" accessible={false} />
        </Pressable>
      </View>
    )}
  </View>;
}

const OMBRE = {
  shadowColor: '#1a2e22',
  shadowOpacity: 0.06,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
};

const styles = StyleSheet.create({
  resume: { backgroundColor: c.light, borderRadius: 20, padding: 18, gap: 2 },
  resumeSurtitre: { fontFamily: 'DMSans_500Medium', fontSize: 13, lineHeight: 18, color: c.green },
  resumeTitre: { fontFamily: 'DMSans_700Bold', fontSize: 22, lineHeight: 29, color: c.green },
  resumeTexte: { fontFamily: 'DMSans_500Medium', fontSize: 13, lineHeight: 18, color: c.green },

  puces: { flexDirection: 'row', gap: 8 },
  puce: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, borderWidth: 1, borderColor: c.border, backgroundColor: 'white', paddingHorizontal: 8 },
  puceActive: { backgroundColor: c.green, borderColor: c.green },
  textePuce: { fontFamily: 'DMSans_500Medium', fontSize: 14, color: c.ink, textAlign: 'center' },
  textePuceActive: { color: 'white' },

  carte: { backgroundColor: 'white', borderRadius: 20, overflow: 'hidden', ...OMBRE },
  entete: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12 },
  photo: { width: 88, height: 88, borderRadius: 16, backgroundColor: c.light },
  photoVide: { alignItems: 'center', justifyContent: 'center' },
  infos: { flex: 1, gap: 3 },
  nom: { fontFamily: 'DMSans_700Bold', fontSize: 16, lineHeight: 21, color: c.ink },
  detail: { fontFamily: 'DMSans_500Medium', fontSize: 13, lineHeight: 18, color: c.muted },
  economie: { alignSelf: 'flex-start', backgroundColor: ORANGE_PALE, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginTop: 4 },
  texteEconomie: { fontFamily: 'DMSans_700Bold', fontSize: 13, lineHeight: 18, color: ORANGE_FONCE },

  depliee: { borderTopWidth: 1, borderTopColor: c.border, padding: 14, gap: 10 },
  titreProduits: { fontFamily: 'DMSans_700Bold', fontSize: 12, lineHeight: 16, color: c.muted, letterSpacing: 0.5, textTransform: 'uppercase' },
  produit: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#faf8f3', borderRadius: 12, padding: 10 },
  magasin: { fontFamily: 'DMSans_700Bold', fontSize: 11, lineHeight: 14, color: c.green, letterSpacing: 0.5 },
  nomProduit: { fontFamily: 'DMSans_500Medium', fontSize: 14, lineHeight: 19, color: c.ink },
  prix: { alignItems: 'flex-end', gap: 2 },
  prixPromo: { fontFamily: 'DMSans_700Bold', fontSize: 16, lineHeight: 21, color: PRIX_PROMO },
  ligneRabais: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  prixBarre: { fontFamily: 'DMSans_500Medium', fontSize: 12, lineHeight: 16, color: c.muted, textDecorationLine: 'line-through' },
  pastille: { backgroundColor: ORANGE_PALE, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  textePastille: { fontFamily: 'DMSans_700Bold', fontSize: 11, lineHeight: 15, color: ORANGE_FONCE },

  boutonRecette: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: c.green, borderRadius: 12, minHeight: 46, marginTop: 2 },
  texteBoutonRecette: { fontFamily: 'DMSans_700Bold', fontSize: 15, lineHeight: 20, color: 'white' },
});