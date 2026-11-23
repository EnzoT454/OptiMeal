import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useAuth } from '../context/AuthContext';
import { listCommand, listsPath, localDate, previewCalendar, previewCreationPrices, quantityLabel } from '../services/shoppingLists';
import type {
  ShoppingCalendarPreviewRead, ShoppingComparedNeed, ShoppingDraftPricingRead, ShoppingItemRead,
  ShoppingPeriod, ShoppingScenarioName,
} from '../types/shoppingLists';
import { useListCommand } from './lists/useListCommand';
import { calendarNeed, calendarProductsName, calendarProductSelection } from '../services/shoppingCalendarProducts';
import { storeName } from './promos';
import { RecipeButton, recipeColors as c } from './recipes';

// Aperçu du calendrier et création atomique du scénario sélectionné.
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

export default function EpicerieSemaine({ period, onOpen }: {
  period: ShoppingPeriod; onOpen: (id: string) => void;
}) {
  const { session } = useAuth();
  const userId = session?.user.id;

  const [apercu, setApercu] = useState<ShoppingCalendarPreviewRead | null>(null);
  const [prix, setPrix] = useState<ShoppingDraftPricingRead | null>(null);
  const identity = `${userId}:${period.start_date}:${period.end_date}`;
  const current = useRef(identity); current.current = identity;
  const generation = useRef(0), creating = useRef(false);
  const command = useListCommand(`calendar-products:${period.start_date}:${period.end_date}`);
  const [loadedIdentity, setLoadedIdentity] = useState('');
  const [working, setWorking] = useState(false), [confirmation, setConfirmation] = useState(false);
  const [creationError, setCreationError] = useState('');
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [prixIndisponibles, setPrixIndisponibles] = useState(false);
  const [choix, setChoix] = useState<ShoppingScenarioName>('cheapest');
  const [essai, setEssai] = useState(0);

  // Recalculer à chaque changement de semaine (et à chaque retour sur l'onglet Épicerie)
  useEffect(() => {
    if (!userId) return;
    let annule = false; generation.current++; creating.current = false;
    setWorking(false); setConfirmation(false); setCreationError(''); setApercu(null);
    setChargement(true); setErreur(null); setPrix(null); setPrixIndisponibles(false);

    // Date des courses : aujourd'hui si c'est dans la semaine affichée, sinon le lundi
    const auj = localDate();
    const dateCourses = auj >= period.start_date && auj <= period.end_date ? auj : period.start_date;

    (async () => {
      try {
        const a = await previewCalendar({ ...period, purchase_date: dateCourses }, userId);
        if (annule) return;
        setApercu(a);

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
        if (!annule) { setChargement(false); setLoadedIdentity(identity); }
      }
    })();

    return () => { annule = true; generation.current++; };
  }, [period.start_date, period.end_date, userId, essai]);

  // ---- Ce qu'on affiche ----
  const articles = (apercu?.items ?? []).filter((i) => !i.removed);
  const scenario = prix?.scenarios.find((s) => s.scenario === choix) ?? null;
  const selection = scenario ? calendarProductSelection(articles, scenario) : null;
  const locked = working || command.locked || chargement || loadedIdentity !== identity;
  async function createProducts() {
    if (creating.current || !command.ready || command.busy || (!command.pending && (locked || !apercu || !prix || !scenario || !selection?.included.length))) return;
    const version = generation.current;
    const isCurrent = () => current.current === identity && generation.current === version;
    creating.current = true; setWorking(true); setCreationError('');
    try {
      let intent = command.pending;
      if (!intent && apercu && prix && scenario && selection) {
        // Le serveur revérifie le devis complet ; les besoins sans prix restent inclus.
        intent = listCommand(`${listsPath}/from-calendar`, {
          ...period, name: calendarProductsName(period), purchase_date: apercu.purchase_date,
          kind: 'products', activate: true, preview_fingerprint: apercu.preview_fingerprint,
          accept_partial: !!apercu.excluded_meals.length,
          excluded_item_ids: [],
          pricing: { fingerprint: prix.fingerprint, scenario: choix, choices: [], accept_partial: !scenario.complete },
        });
      }
      if (!intent || !isCurrent()) return;
      const result = await command.run(intent);
      if (result && isCurrent()) { setConfirmation(false); onOpen(result.id); }
    } catch (failure) {
      if (isCurrent()) setCreationError(failure instanceof Error ? failure.message : 'Création impossible. Réessaie.');
    } finally {
      if (isCurrent()) { creating.current = false; setWorking(false); }
    }
  }
  const nbExclus = apercu?.excluded_meals.length ?? 0;
  const nomScenario = SCENARIOS.find((s) => s.id === choix)?.label ?? '';

  const unknownCount = selection?.unpriced.length ?? articles.length;
  const hasKnownPrice = scenario?.needs.some(need => need.lines.length > 0);

  if (chargement || loadedIdentity !== identity) return <ActivityIndicator color={c.green} style={{ marginTop: 16 }} />;

  return (
    <View style={{ gap: 12 }}>
      {working && <ActivityIndicator accessibilityLabel="Création de la liste de produits" color={c.green} />}
      {!!(erreur || creationError || command.error) && <View style={styles.carte}>
        <Text accessibilityRole="alert" style={styles.texte}>{erreur || creationError || command.error}</Text>
        <RecipeButton title="Actualiser l’aperçu" variant="neutral" disabled={working || command.busy || !!command.pending} onPress={() => setEssai(n => n + 1)} />
      </View>}
      {command.pending && <View style={styles.carte}>
        <Text style={styles.texte}>La création reste à confirmer. Reprends la demande pour éviter une liste en double.</Text>
        <RecipeButton title="Reprendre la création" disabled={working || command.busy || !command.ready} onPress={() => void createProducts()} />
      </View>}
      {/* Aucun ingrédient : pas encore de repas avec recette */}
      {articles.length === 0 && (
        <View style={styles.carte}>
          <MaterialCommunityIcons name="basket-outline" size={28} color={c.green} accessible={false} />
          <Text style={styles.titreVide}>Ton épicerie apparaîtra ici</Text>
          <Text style={styles.texte}>Planifie des repas avec des recettes : leurs ingrédients s’ajoutent automatiquement.</Text>
        </View>
      )}

      {articles.length > 0 && (
        <>
          {/* Total estimé : une information par ligne, pour que rien ne soit écrasé */}
          <View style={styles.total}>
            <Text style={styles.surtitreTotal} numberOfLines={1}>
              {scenario && !scenario.complete ? 'Sous-total connu' : 'Total estimé'}{scenario ? ` · ${nomScenario}` : ''}
            </Text>
            <Text style={styles.montantTotal} numberOfLines={1} adjustsFontSizeToFit>
              {scenario && hasKnownPrice
                ? `${scenario.complete ? '≈ ' : ''}${enDollars(Number(scenario.known_amount))}`
                : prixIndisponibles ? 'Prix indisponibles' : '- $'}
            </Text>
            <View style={styles.compteurs}>
              <Compteur icon="basket-outline" value={articles.length} label="Articles" />
              <Compteur icon="store-outline" value={scenario?.store_count ?? 0} label="Magasins" />
              <Compteur icon="help-circle-outline" value={unknownCount} label="Sans prix" />
            </View>
          </View>

          {/* Choix du magasin */}
          {prix && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.puces}>
              {SCENARIOS.map((s) => {
                const actif = s.id === choix;
                return (
                  <Pressable key={s.id} accessibilityRole="radio" accessibilityState={{ selected: actif }}
                    disabled={locked} onPress={() => { setChoix(s.id); setConfirmation(false); setCreationError(''); }} style={[styles.puce, actif && styles.puceActive]}>
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
                  <LigneArticle key={a.id} article={a} besoin={calendarNeed(a, scenario)}
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

          {!command.pending && (confirmation ? <View style={styles.carte}>
            <Text accessibilityRole="header" style={styles.titreVide}>Créer la liste ?</Text>
            {!!nbExclus && <Text style={styles.texte}>{nbExclus} repas sans recette accessible ne seront pas inclus.</Text>}
            <RecipeButton title="Créer la liste" disabled={locked} onPress={() => void createProducts()} />
            <RecipeButton title="Annuler" variant="neutral" disabled={working} onPress={() => setConfirmation(false)} />
          </View> : <>
            <RecipeButton title="Créer une liste de produits" disabled={locked || !selection?.included.length} onPress={() => {
              if (nbExclus) setConfirmation(true); else void createProducts();
            }} />
            {!selection?.included.length && <>
              <Text style={styles.note}>Les prix ne sont pas disponibles. Actualise l’aperçu pour préparer la liste.</Text>
              {!prixIndisponibles && <RecipeButton title="Actualiser l’aperçu" variant="neutral" disabled={locked} onPress={() => setEssai(n => n + 1)} />}
            </>}
            {prixIndisponibles && <RecipeButton title="Réessayer les prix" variant="neutral" disabled={locked} onPress={() => setEssai(n => n + 1)} />}
          </>)}
        </>
      )}
    </View>
  );
}

function Compteur({ icon, value, label }: {
  icon: 'basket-outline' | 'store-outline' | 'help-circle-outline'; value: number; label: string;
}) {
  return <View accessible accessibilityLabel={`${value} ${label.toLocaleLowerCase('fr')}`} style={styles.compteur}>
    <MaterialCommunityIcons name={icon} size={22} color={VERT_PALE} accessible={false} />
    <Text style={styles.nombreTotal}>{value}</Text>
    <Text style={styles.texteTotal}>{label}</Text>
  </View>;
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
            : <Text accessibilityLabel="Prix inconnu" style={styles.prixInconnu}>- $</Text>}
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

  total: { alignSelf: 'stretch', alignItems: 'center', backgroundColor: c.green, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 16, gap: 8 },
  surtitreTotal: { fontFamily: 'DMSans_500Medium', fontSize: 13, lineHeight: 18, color: VERT_PALE, textAlign: 'center' },
  montantTotal: { fontFamily: 'DMSans_700Bold', fontSize: 30, lineHeight: 38, color: 'white' },
  texteTotal: { fontFamily: 'DMSans_500Medium', fontSize: 13, lineHeight: 18, color: VERT_PALE, textAlign: 'center' },
  compteurs: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 20 },
  compteur: { alignItems: 'center', minWidth: 64, gap: 3 },
  nombreTotal: { fontFamily: 'DMSans_700Bold', fontSize: 18, lineHeight: 24, color: 'white', textAlign: 'center' },

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
