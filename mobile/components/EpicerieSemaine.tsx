import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useAuth } from '../context/AuthContext';
import { fetchLists, localDate, previewCalendar, previewCreationPrices, quantityLabel } from '../services/shoppingLists';
import type {
  ShoppingCalendarPreviewRead, ShoppingComparedNeed, ShoppingDraftPricingRead, ShoppingItemRead,
  ShoppingListRead, ShoppingPeriod, ShoppingScenarioName,
} from '../types/shoppingLists';
import { storeName } from './promos';
import { recipeColors as c } from './recipes';

// =====================================================================
// Épicerie de la semaine (onglet Épicerie du Calendrier)
//   - les ingrédients des repas planifiés, calculés en direct (calendar-preview)
//   - les prix par scénario : Le moins cher, Maxi, Metro, Super C (creation-prices)
//   - rien n'est enregistré : « Enregistrer ma liste » ouvre la création de liste
//     avec la période déjà remplie. Mêmes calculs que la création, donc mêmes totaux.
// =====================================================================

const SCENARIOS: { id: ShoppingScenarioName; label: string }[] = [
  { id: 'cheapest', label: 'Le moins cher' },
  { id: 'maxi', label: 'Maxi' },
  { id: 'metro', label: 'Metro' },
  { id: 'superc', label: 'Super C' },
];

const VERT_PALE = '#CFE3D5';
const enDollars = (n: number) => `${n.toFixed(2).replace('.', ',')} $`;
const majuscule = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

// Regroupe les articles par rayon (catégorie), dans l'ordre alphabétique des rayons
function parRayon(articles: ShoppingItemRead[]) {
  const groupes = new Map<string, ShoppingItemRead[]>();
  for (const a of articles) {
    const rayon = a.category?.trim() || 'Autres';
    groupes.set(rayon, [...(groupes.get(rayon) ?? []), a]);
  }
  return [...groupes.entries()].sort(([x], [y]) => x.localeCompare(y, 'fr'));
}

export default function EpicerieSemaine({ period, onCreate, onOpen }: {
  period: ShoppingPeriod; onCreate: () => void; onOpen: (id: string) => void;
}) {
  const { session } = useAuth();
  const userId = session?.user.id;

  const [apercu, setApercu] = useState<ShoppingCalendarPreviewRead | null>(null);
  const [prix, setPrix] = useState<ShoppingDraftPricingRead | null>(null);
  const [listes, setListes] = useState<ShoppingListRead[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [prixIndisponibles, setPrixIndisponibles] = useState(false);
  const [choix, setChoix] = useState<ShoppingScenarioName>('cheapest');
  const [essai, setEssai] = useState(0);

  // Recalculer à chaque changement de semaine (et à chaque retour sur l'onglet Épicerie)
  useEffect(() => {
    if (!userId) return;
    let annule = false;
    setChargement(true); setErreur(null); setPrix(null); setPrixIndisponibles(false);

    // Date des courses : aujourd'hui si c'est dans la semaine affichée, sinon le lundi
    const auj = localDate();
    const dateCourses = auj >= period.start_date && auj <= period.end_date ? auj : period.start_date;

    (async () => {
      try {
        const [a, page] = await Promise.all([
          previewCalendar({ ...period, purchase_date: dateCourses }),
          fetchLists(0, 'current', period, userId).catch(() => null), // une liste déjà enregistrée ?
        ]);
        if (annule) return;
        setApercu(a);
        setListes(page?.items ?? []);

        const articles = a.items.filter((i) => !i.removed);
        if (articles.length === 0) return;

        // Les prix : si ça échoue, on garde quand même les articles
        try {
          const p = await previewCreationPrices({
            items: articles.map((i) => ({ name: i.name, ingredient_id: i.ingredient_id, required: i.required })),
            purchase_date: dateCourses,
            choices: [],
          }, userId);
          if (!annule) setPrix(p);
        } catch {
          if (!annule) setPrixIndisponibles(true);
        }
      } catch {
        if (!annule) setErreur("Impossible de préparer l'épicerie de cette semaine.");
      } finally {
        if (!annule) setChargement(false);
      }
    })();

    return () => { annule = true; };
  }, [period.start_date, period.end_date, userId, essai]);

  // ---- Ce qu'on affiche ----
  const articles = (apercu?.items ?? []).filter((i) => !i.removed);
  const scenario = prix?.scenarios.find((s) => s.scenario === choix) ?? null;
  const besoinParArticle = new Map<string, ShoppingComparedNeed>();
  scenario?.needs.forEach((n) => n.item_ids.forEach((id) => besoinParArticle.set(id, n)));
  const listeSemaine = listes[0];
  const nbExclus = apercu?.excluded_meals.length ?? 0;
  const nomScenario = SCENARIOS.find((s) => s.id === choix)?.label ?? '';

  // « 19 articles · 3 magasins » (+ « certains prix inconnus » si le total est partiel)
  let detailTotal = `${articles.length} article${articles.length > 1 ? 's' : ''}`;
  if (scenario) {
    detailTotal += ` · ${scenario.store_count} magasin${scenario.store_count > 1 ? 's' : ''}`;
    if (!scenario.complete) detailTotal += ' · certains prix inconnus';
  }

  if (chargement) return <ActivityIndicator color={c.green} style={{ marginTop: 16 }} />;

  if (erreur) return (
    <View style={styles.carte}>
      <Text style={styles.texte}>{erreur}</Text>
      <Pressable accessibilityRole="button" onPress={() => setEssai((n) => n + 1)}>
        <Text style={styles.lien}>Réessayer</Text>
      </Pressable>
    </View>
  );

  return (
    <View style={{ gap: 12 }}>
      {/* Aucun ingrédient : pas encore de repas avec recette */}
      {articles.length === 0 && (
        <View style={styles.carte}>
          <MaterialCommunityIcons name="basket-outline" size={28} color={c.green} accessible={false} />
          <Text style={styles.titreVide}>Ton épicerie apparaîtra ici</Text>
          <Text style={styles.texte}>Planifie des repas avec des recettes : leurs ingrédients s'ajoutent automatiquement.</Text>
        </View>
      )}

      {articles.length > 0 && (
        <>
          {/* Total estimé : une information par ligne, pour que rien ne soit écrasé */}
          <View style={styles.total}>
            <Text style={styles.surtitreTotal} numberOfLines={1}>
              Total estimé{scenario ? ` · ${nomScenario}` : ''}
            </Text>
            <Text style={styles.montantTotal} numberOfLines={1} adjustsFontSizeToFit>
              {scenario
                ? `${scenario.complete ? '≈ ' : ''}${enDollars(Number(scenario.known_amount))}`
                : prixIndisponibles ? 'Prix indisponibles' : '—'}
            </Text>
            <Text style={styles.texteTotal}>{detailTotal}</Text>
          </View>

          {/* Choix du magasin */}
          {prix && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.puces}>
              {SCENARIOS.map((s) => {
                const actif = s.id === choix;
                return (
                  <Pressable key={s.id} accessibilityRole="radio" accessibilityState={{ selected: actif }}
                    onPress={() => setChoix(s.id)} style={[styles.puce, actif && styles.puceActive]}>
                    <Text style={[styles.textePuce, actif && styles.textePuceActive]}>{s.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          {/* Les articles, par rayon */}
          {parRayon(articles).map(([rayon, items]) => (
            <View key={rayon} style={{ gap: 6 }}>
              <Text style={styles.rayon}>{rayon.toUpperCase()}</Text>
              <View style={styles.groupe}>
                {items.map((a, index) => (
                  <LigneArticle key={a.id} article={a} besoin={besoinParArticle.get(a.id)}
                    avecPrix={!!scenario} derniere={index === items.length - 1} />
                ))}
              </View>
            </View>
          ))}

          {nbExclus > 0 && (
            <Text style={styles.note}>
              {nbExclus} repas sans recette accessible {nbExclus > 1 ? 'ne sont' : "n'est"} pas inclus.
            </Text>
          )}

                    {/* Liste déjà enregistrée → l'ouvrir ; sinon → l'enregistrer */}
          {listeSemaine ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`Ouvrir la liste ${listeSemaine.name}`}
              onPress={() => onOpen(listeSemaine.id)}
              style={({ pressed }) => [styles.bouton, pressed && { opacity: 0.8 }]}>
              <MaterialCommunityIcons name="format-list-checks" size={20} color="white" accessible={false} />
              <Text style={styles.texteBouton}>Ouvrir ma liste</Text>
            </Pressable>
          ) : (
            <>
              <Pressable accessibilityRole="button" onPress={onCreate}
                style={({ pressed }) => [styles.bouton, pressed && { opacity: 0.8 }]}>
                <MaterialCommunityIcons name="content-save-outline" size={20} color="white" accessible={false} />
                <Text style={styles.texteBouton}>Enregistrer ma liste</Text>
              </Pressable>
              <Text style={[styles.note, { textAlign: 'center' }]}>Tu pourras ensuite cocher tes articles en magasin.</Text>
            </>
          )}
        </>
      )}
    </View>
  );
}

// Une ligne : nom · quantité, recettes d'origine, prix et magasin
function LigneArticle({ article, besoin, avecPrix, derniere }: {
  article: ShoppingItemRead; besoin?: ShoppingComparedNeed; avecPrix: boolean; derniere: boolean;
}) {
  const recettes = [...new Set(article.contributions.map((x) => x.recipe_name).filter((n): n is string => !!n))].join(', ');
  const montant = besoin?.amount != null ? Number(besoin.amount) : null;
  const magasin = besoin?.lines[0]?.sale.raw_source.retailer;

  return (
    <View style={[styles.ligne, !derniere && styles.separateur]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.nomArticle} numberOfLines={2}>
          {majuscule(article.name)}
          {article.required.length > 0 && <Text style={styles.quantite}> · {quantityLabel(article.required)}</Text>}
        </Text>
        {!!recettes && <Text style={styles.recettes} numberOfLines={1}>{recettes}</Text>}
      </View>
      {avecPrix && (
        <View style={{ alignItems: 'flex-end' }}>
          {montant !== null && Number.isFinite(montant)
            ? <Text style={styles.prix}>{enDollars(montant)}</Text>
            : <Text style={styles.prixInconnu}>prix inconnu</Text>}
          {magasin && <Text style={styles.magasin}>{storeName(magasin)}</Text>}
        </View>
      )}
    </View>
  );
}

const OMBRE = {
  shadowColor: '#1a2e22',
  shadowOpacity: 0.06,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
};

const styles = StyleSheet.create({
  carte: { backgroundColor: 'white', borderRadius: 20, padding: 18, gap: 8, alignItems: 'flex-start', ...OMBRE },
  titreVide: { fontFamily: 'DMSans_700Bold', fontSize: 17, lineHeight: 23, color: c.ink },
  texte: { fontFamily: 'DMSans_500Medium', fontSize: 14, lineHeight: 20, color: c.muted },
  lien: { fontFamily: 'DMSans_700Bold', fontSize: 14, lineHeight: 19, color: c.green },
  note: { fontFamily: 'DMSans_500Medium', fontSize: 12, lineHeight: 17, color: c.muted },

  bandeau: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.light, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12 },
  titreBandeau: { fontFamily: 'DMSans_700Bold', fontSize: 14, lineHeight: 19, color: c.green },
  texteBandeau: { fontFamily: 'DMSans_500Medium', fontSize: 13, lineHeight: 18, color: c.green },

  total: { backgroundColor: c.green, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 16, gap: 2 },
  surtitreTotal: { fontFamily: 'DMSans_500Medium', fontSize: 13, lineHeight: 18, color: VERT_PALE },
  montantTotal: { fontFamily: 'DMSans_700Bold', fontSize: 30, lineHeight: 38, color: 'white' },
  texteTotal: { fontFamily: 'DMSans_500Medium', fontSize: 13, lineHeight: 18, color: VERT_PALE },

  puces: { gap: 8, paddingVertical: 2 },
  puce: { paddingHorizontal: 16, minHeight: 40, justifyContent: 'center', borderRadius: 20, backgroundColor: c.light },
  puceActive: { backgroundColor: c.green },
  textePuce: { fontFamily: 'DMSans_500Medium', fontSize: 14, color: c.green },
  textePuceActive: { fontFamily: 'DMSans_700Bold', color: 'white' },

  rayon: { fontFamily: 'DMSans_700Bold', fontSize: 12, lineHeight: 16, color: c.muted, letterSpacing: 0.6, marginLeft: 4 },
  groupe: { backgroundColor: 'white', borderRadius: 16, paddingHorizontal: 14, ...OMBRE },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  separateur: { borderBottomWidth: 1, borderBottomColor: c.border },
  nomArticle: { fontFamily: 'DMSans_700Bold', fontSize: 15, lineHeight: 20, color: c.ink },
  quantite: { fontFamily: 'DMSans_500Medium', color: c.muted },
  recettes: { fontFamily: 'DMSans_500Medium', fontSize: 12, lineHeight: 16, color: c.muted },
  prix: { fontFamily: 'DMSans_700Bold', fontSize: 15, lineHeight: 20, color: c.ink },
  prixInconnu: { fontFamily: 'DMSans_500Medium', fontSize: 12, lineHeight: 16, color: c.muted },
  magasin: { fontFamily: 'DMSans_500Medium', fontSize: 12, lineHeight: 16, color: c.muted },

  bouton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: c.green, borderRadius: 14, minHeight: 50, marginTop: 4 },
  texteBouton: { fontFamily: 'DMSans_700Bold', fontSize: 16, lineHeight: 21, color: 'white' },
});