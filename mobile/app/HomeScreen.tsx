import { useCallback, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { HomeStackParams } from "../types/navigation";
import { useAuth } from "../context/AuthContext";
import { RecipeScreen, recipeColors as c, recipeStyles } from "../components/recipes";
import { MEALS, MEAL_COLORS, MEAL_LABELS, dayFullName, getPlan, mealName, mondayOf, toISODate } from "../components/planning";
import { fetchLists, quantityLabel } from "../services/shoppingLists";
import { discount } from "../components/promos";
import { fetchAllOffers, isOnPromo } from "../components/search";
import { followsOffer } from "../components/follows";
import { useFollows } from "../components/useFollows";
import { PromoList } from "../components/PromoCard";
import MenuCompte, { type SectionMenu } from "../components/MenuCompte";
import type { MealPlanEntry, MealType, Offer } from "../types/api";
import type { ShoppingListRead } from "../types/shoppingLists";

// =====================================================================
// Accueil : avatar (menu du compte) + 3 sections
//   1. Aujourd'hui / Demain → les repas du jour qui compte maintenant
//   2. Prochaines courses   → aperçu de la liste en cours la plus proche
//   3. Promos suivies       → produits suivis en promo cette semaine
// =====================================================================

// À partir de cette heure, l'Accueil montre les repas de demain
const HEURE_BASCULE = 21;

// Heure à partir de laquelle un repas du jour est considéré comme passé
const FIN_DU_REPAS: Record<MealType, number> = { dejeuner: 11, diner: 15, souper: 21, collation: 24 };

function salutation(d: Date) {
  const h = d.getHours();
  if (h < 12) return "Bonjour";
  if (h < 18) return "Bon après-midi";
  return "Bonsoir";
}

const majuscule = (texte: string) => texte.charAt(0).toUpperCase() + texte.slice(1);

function plusJours(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

const dateDe = (iso: string) => new Date(iso + "T12:00:00");

// Le jour à afficher : aujourd'hui pendant la journée, demain le soir
function jourQuiCompte(maintenant: Date) {
  const demain = maintenant.getHours() >= HEURE_BASCULE;
  const date = demain ? plusJours(maintenant, 1) : maintenant;
  return { iso: toISODate(date), titre: demain ? "Demain" : "Aujourd'hui", estDemain: demain };
}

// Un repas d'aujourd'hui dont l'heure est passée
function estPasse(e: MealPlanEntry, maintenant: Date) {
  return e.date === toISODate(maintenant) && maintenant.getHours() >= FIN_DU_REPAS[e.meal];
}

// "Ce soir" pour le souper d'aujourd'hui, sinon le moment du repas
function libelleRepas(e: MealPlanEntry, maintenant: Date) {
  if (e.date === toISODate(maintenant) && e.meal === "souper" && !estPasse(e, maintenant)) return "Ce soir";
  return MEAL_LABELS[e.meal];
}

// Garde les listes en cours, la plus proche d'abord (à venir, puis en retard)
function trierListes(listes: ShoppingListRead[], aujourdhui: string) {
  const ouvertes = listes.filter((l) => l.status === "draft" || l.status === "active");
  const aVenir = ouvertes.filter((l) => l.purchase_date >= aujourdhui)
    .sort((a, b) => a.purchase_date.localeCompare(b.purchase_date));
  const enRetard = ouvertes.filter((l) => l.purchase_date < aujourdhui)
    .sort((a, b) => b.purchase_date.localeCompare(a.purchase_date));
  return [...aVenir, ...enRetard];
}

// "Courses aujourd'hui", "Courses demain", "Courses mercredi 18 nov.", "Courses prévues vendredi 14 nov."
function quandCourses(iso: string, aujourdhui: string) {
  const demain = toISODate(plusJours(new Date(), 1));
  if (iso === aujourdhui) return "Courses aujourd'hui";
  if (iso === demain) return "Courses demain";
  const texte = dateDe(iso).toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "short" });
  return iso < aujourdhui ? `Courses prévues ${texte}` : `Courses ${texte}`;
}

// "Repas du 16 au 22 nov."
function periodeRepas(debut: string, fin: string) {
  const d = dateDe(debut);
  const f = dateDe(fin);
  const mois = f.toLocaleDateString("fr-CA", { month: "short" });
  return `Repas du ${d.getDate()} au ${f.getDate()} ${mois}`;
}

export default function HomeScreen({ navigation }: NativeStackScreenProps<HomeStackParams, 'Home'>) {
  const { session } = useAuth();
  const maintenant = new Date();
  const [menuOuvert, setMenuOuvert] = useState(false);

  const ouvrirParametres = () => navigation.navigate("Paramètres");

  const sectionsMenu: SectionMenu[] = [
    { titre: "Mon épicerie", elements: [
      { icone: "format-list-checks", titre: "Mes listes", onPress: () => navigation.getParent()?.navigate("Liste") },
      { icone: "heart-outline", titre: "Produits suivis", onPress: () => navigation.getParent()?.navigate("Promos", { screen: "Follows" }) },
      { icone: "storefront-outline", titre: "Magasins préférés", onPress: ouvrirParametres },
      { icone: "wallet-outline", titre: "Budget de la semaine", onPress: ouvrirParametres },
      { icone: "leaf", titre: "Préférences alimentaires", onPress: ouvrirParametres },
    ]},
    { titre: "Application", elements: [
      { icone: "cog-outline", titre: "Paramètres", onPress: ouvrirParametres },
    ]},
  ];

  return (
    <RecipeScreen>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mon compte"
          accessibilityHint="Ouvre le menu du compte."
          onPress={() => setMenuOuvert(true)}
          style={({ pressed }) => [styles.boutonProfil, pressed && styles.appuye]}
        >
          <MaterialCommunityIcons name="account-outline" size={24} color={c.green} accessible={false} />
        </Pressable>
        <View style={styles.greeting}>
          <Text style={styles.date}>{majuscule(dayFullName(maintenant))}</Text>
          <Text accessibilityRole="header" style={styles.salut}>{salutation(maintenant)}</Text>
        </View>
      </View>

      {session ? (
        <TableauDeBord />
      ) : (
        <View style={styles.carte}>
          <Text style={styles.titreCarte}>Bienvenue dans OptiMeal</Text>
          <Text style={recipeStyles.body}>
            Découvre les recettes, les promotions et les circulaires. Connecte-toi pour planifier tes repas
            et retrouver tes listes d'épicerie ici.
          </Text>
        </View>
      )}

      <MenuCompte visible={menuOuvert} onFermer={() => setMenuOuvert(false)} sections={sectionsMenu} />
    </RecipeScreen>
  );
}

function TableauDeBord() {
  const navigation = useNavigation<any>();
  const maintenant = new Date();
  const aujourdhui = toISODate(maintenant);
  const jour = jourQuiCompte(maintenant);

  // Repas : cette semaine + la suivante (demain peut tomber la semaine prochaine)
  const [repas, setRepas] = useState<MealPlanEntry[]>([]);
  const [nbRepasSemaine, setNbRepasSemaine] = useState(0);
  const [chargementRepas, setChargementRepas] = useState(true);
  const [erreurRepas, setErreurRepas] = useState(false);

  // Listes d'achats (onglet Liste)
  const [listes, setListes] = useState<ShoppingListRead[]>([]);
  const [chargementListes, setChargementListes] = useState(true);
  const [erreurListes, setErreurListes] = useState(false);
  const [essai, setEssai] = useState(0); // augmente pour relancer le chargement

  // Produits suivis (onglet Promos) : même logique que FollowsScreen
  const { follows, recharger: rechargerSuivis, toggle: basculerSuivi } = useFollows();
  const [offres, setOffres] = useState<Offer[]>([]);
  const [chargementPromos, setChargementPromos] = useState(true);
  const [erreurPromos, setErreurPromos] = useState(false);

  // Recharger chaque fois qu'on revient sur l'Accueil
  useFocusEffect(useCallback(() => {
    let annule = false;
    setErreurRepas(false);
    setErreurListes(false);
    setErreurPromos(false);

    const lundi = mondayOf(new Date());
    Promise.all([getPlan(toISODate(lundi)), getPlan(toISODate(plusJours(lundi, 7)))])
      .then(([cetteSemaine, semaineProchaine]) => {
        if (annule) return;
        setRepas([...cetteSemaine.entries, ...semaineProchaine.entries]);
        setNbRepasSemaine(cetteSemaine.entries.filter((e) => !e.is_leftover).length);
      })
      .catch(() => { if (!annule) setErreurRepas(true); })
      .finally(() => { if (!annule) setChargementRepas(false); });

    fetchLists(0)
      .then((page) => { if (!annule) setListes(page.items); })
      .catch(() => { if (!annule) setErreurListes(true); })
      .finally(() => { if (!annule) setChargementListes(false); });

    Promise.all([rechargerSuivis(), fetchAllOffers()])
      .then(async ([, items]) => {
        if (annule) return;
        await rechargerSuivis(items);
        if (!annule) setOffres(items);
      })
      .catch(() => { if (!annule) setErreurPromos(true); })
      .finally(() => { if (!annule) setChargementPromos(false); });

    return () => { annule = true; };
  }, [essai, rechargerSuivis]));

  // Navigation
  const ouvrirSemaine = () => navigation.navigate("Calendrier", { vue: "repas" });
  const ouvrirListes = () => navigation.navigate("Liste", { screen: "Lists" });
  const creerListe = () => navigation.navigate("Liste", { screen: "CreateList", initial: false });
  const ouvrirListe = (id: string) => navigation.navigate("Liste", { screen: "ShoppingDetail", params: { id }, initial: false });
  const ouvrirSuivis = () => navigation.navigate("Promos", { screen: "Follows", initial: false });
  const ouvrirPromos = () => navigation.navigate("Promos", { screen: "List" });
  const ouvrirOffre = (offre: Offer) => navigation.navigate("Promos", { screen: "Detail", params: { offer: offre }, initial: false });
  const reessayer = () => {
    setChargementRepas(true); setChargementListes(true); setChargementPromos(true);
    setEssai((n) => n + 1);
  };

  // Les repas du jour qui compte
  const repasDuJour = repas
    .filter((e) => e.date === jour.iso)
    .sort((a, b) => MEALS.indexOf(a.meal) - MEALS.indexOf(b.meal));

  // Prochaines courses
  const listesEnCours = trierListes(listes, aujourdhui);
  const prochaine = listesEnCours[0];
  const chargement = chargementListes || chargementRepas;

  // Promos suivies : les 2 meilleurs rabais parmi les produits suivis
  const estSuivi = (o: Offer) => follows.some((f) => followsOffer(f, o));
  const suivisEnPromo = offres.filter(estSuivi).filter(isOnPromo)
    .sort((a, b) => (discount(b) ?? 0) - (discount(a) ?? 0));
  const promosAffichees = suivisEnPromo.slice(0, 2);

  return (
    <>
      {/* ================= 1. Aujourd'hui / Demain ================= */}
      <View style={styles.section}>
        <TitreSection titre={jour.titre} lien="Ma semaine" onLien={ouvrirSemaine} />

        {chargementRepas && <View style={styles.carte}><ActivityIndicator color={c.green} /></View>}

        {!chargementRepas && erreurRepas && (
          <View style={styles.carte}>
            <Text style={recipeStyles.body}>Impossible de charger tes repas. Vérifie ta connexion.</Text>
            <Pressable accessibilityRole="button" onPress={reessayer}><Text style={styles.lien}>Réessayer</Text></Pressable>
          </View>
        )}

        {!chargementRepas && !erreurRepas && repasDuJour.length === 0 && (
          <Pressable accessibilityRole="button" onPress={ouvrirSemaine}
            style={({ pressed }) => [styles.carteRepas, pressed && styles.appuye]}>
            <View style={[styles.vignette, styles.vignetteVide]}>
              <MaterialCommunityIcons name="plus" size={24} color={c.muted} accessible={false} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.repasNom}>Rien de prévu</Text>
              <Text style={styles.repasDetail}>
                {jour.estDemain ? "Planifie tes repas de demain." : "Planifie tes repas d'aujourd'hui."}
              </Text>
            </View>
            <Text style={styles.lien}>Planifier</Text>
          </Pressable>
        )}

        {!chargementRepas && !erreurRepas && repasDuJour.map((e) => {
          const passe = estPasse(e, maintenant);
          return (
            <Pressable key={e.id} accessibilityRole="button"
              accessibilityLabel={`${libelleRepas(e, maintenant)}, ${mealName(e)}, ouvrir ma semaine`}
              onPress={ouvrirSemaine}
              style={({ pressed }) => [styles.carteRepas, passe && styles.carteRepasPassee, pressed && styles.appuye]}>
              <View style={passe && styles.contenuPasse}>
                {e.recipe_image_url ? (
                  <Image source={{ uri: e.recipe_image_url }} style={styles.vignette} accessible={false} />
                ) : (
                  <View style={[styles.vignette, { backgroundColor: MEAL_COLORS[e.meal].dot }]}>
                    <MaterialCommunityIcons name="silverware-fork-knife" size={22} color="white" accessible={false} />
                  </View>
                )}
              </View>
              <View style={[{ flex: 1 }, passe && styles.contenuPasse]}>
                <Text style={[styles.quand, passe && styles.quandPasse]}>
                  {e.is_leftover ? "RESTES · " : ""}{libelleRepas(e, maintenant).toUpperCase()}
                </Text>
                <Text style={styles.repasNom} numberOfLines={1}>{mealName(e)}</Text>
                <Text style={styles.repasDetail}>{e.servings} portion{e.servings > 1 ? "s" : ""}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={c.muted} accessible={false} />
            </Pressable>
          );
        })}
      </View>

      {/* ================= 2. Prochaines courses ================= */}
      <View style={styles.section}>
        <TitreSection titre="Prochaines courses"
          lien={listesEnCours.length > 1 ? `Mes ${listesEnCours.length} listes` : "Mes listes"} onLien={ouvrirListes} />

        {chargement && <View style={styles.carte}><ActivityIndicator color={c.green} /></View>}

        {!chargement && erreurListes && (
          <View style={styles.carte}>
            <Text style={recipeStyles.body}>Impossible de charger tes listes. Vérifie ta connexion.</Text>
            <Pressable accessibilityRole="button" onPress={reessayer}><Text style={styles.lien}>Réessayer</Text></Pressable>
          </View>
        )}

        {!chargement && !erreurListes && !prochaine && (
          <View style={styles.carte}>
            <View style={styles.enTeteListe}>
              <View style={styles.tuileIcone}>
                <MaterialCommunityIcons name={nbRepasSemaine > 0 ? "calendar-check" : "basket-outline"} size={22} color={c.green} accessible={false} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.titreCarte}>
                  {nbRepasSemaine > 0 ? "Ta semaine est planifiée" : "Aucune liste en cours"}
                </Text>
                <Text style={styles.repasDetail}>
                  {nbRepasSemaine > 0
                    ? `${nbRepasSemaine} repas planifié${nbRepasSemaine > 1 ? "s" : ""}, pas encore de liste.`
                    : "Planifie tes repas ou crée une liste à la main."}
                </Text>
              </View>
            </View>
            <Pressable accessibilityRole="button" onPress={creerListe}
              style={({ pressed }) => [styles.boutonVert, pressed && styles.appuye]}>
              <MaterialCommunityIcons name="plus" size={18} color="white" accessible={false} />
              <Text style={styles.texteBoutonVert}>
                {nbRepasSemaine > 0 ? "Créer la liste de la semaine" : "Créer une liste"}
              </Text>
            </Pressable>
          </View>
        )}

        {!chargement && !erreurListes && prochaine && (
          <ApercuListe liste={prochaine} aujourdhui={aujourdhui} onOuvrir={() => ouvrirListe(prochaine.id)} />
        )}
      </View>

      {/* ================= 3. Promos suivies ================= */}
      <View style={styles.section}>
        <TitreSection titre="Promos suivies" lien={follows.length > 0 ? "Tout voir" : undefined} onLien={ouvrirSuivis} />

        {chargementPromos && <View style={styles.carte}><ActivityIndicator color={c.green} /></View>}

        {!chargementPromos && erreurPromos && (
          <View style={styles.carte}>
            <Text style={recipeStyles.body}>Impossible de charger les promos. Vérifie ta connexion.</Text>
            <Pressable accessibilityRole="button" onPress={reessayer}><Text style={styles.lien}>Réessayer</Text></Pressable>
          </View>
        )}

        {!chargementPromos && !erreurPromos && follows.length === 0 && (
          <Pressable accessibilityRole="button" onPress={ouvrirPromos}
            style={({ pressed }) => [styles.carteRepas, pressed && styles.appuye]}>
            <View style={[styles.tuileIcone, { backgroundColor: "#fff1d6" }]}>
              <MaterialCommunityIcons name="bell-outline" size={20} color="#7a4106" accessible={false} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.repasNom}>Suis tes produits préférés</Text>
              <Text style={styles.repasDetail}>Tu verras ici quand ils sont en promo.</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={c.muted} accessible={false} />
          </Pressable>
        )}

        {!chargementPromos && !erreurPromos && follows.length > 0 && suivisEnPromo.length === 0 && (
          <View style={styles.carteRepas}>
            <View style={styles.tuileIcone}>
              <MaterialCommunityIcons name="bell-sleep-outline" size={20} color={c.green} accessible={false} />
            </View>
            <Text style={[styles.texteDoux, { flex: 1 }]}>
              Aucun de tes {follows.length} produits suivis n'est en promo cette semaine.
            </Text>
          </View>
        )}

        {!chargementPromos && !erreurPromos && promosAffichees.length > 0 && (
          <PromoList offers={promosAffichees} view="grid" onOpen={ouvrirOffre}
            isFollowed={estSuivi} onToggleFollow={basculerSuivi} />
        )}
      </View>
    </>
  );
}

// Aperçu de la liste : en-tête + 3 premiers articles + lien
function ApercuListe({ liste, aujourdhui, onOuvrir }: {
  liste: ShoppingListRead; aujourdhui: string; onOuvrir: () => void;
}) {
  const t = liste.totals;
  const montant = Math.round(Number(t.remaining_known_amount));

  const restants = (liste.items ?? []).filter((i) => !i.removed && (i.coverage_status === "remaining" || i.coverage_status === "partial"));
  const apercu = restants.slice(0, 3);
  const autres = restants.length - apercu.length;

  let detail = `${quandCourses(liste.purchase_date, aujourdhui)} · ${t.remaining_item_count} article${t.remaining_item_count > 1 ? "s" : ""}`;
  if (montant > 0) detail += t.estimate_complete ? ` · ≈ ${montant} $` : ` · ${montant} $ connus`;

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Ouvrir la liste ${liste.name}`} onPress={onOuvrir}
      style={({ pressed }) => [styles.carte, pressed && styles.appuye]}>
      <View style={styles.enTeteListe}>
        <View style={styles.tuileIcone}>
          <MaterialCommunityIcons name="basket-outline" size={22} color={c.green} accessible={false} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.titreCarte} numberOfLines={1}>{majuscule(liste.name)}</Text>
          <Text style={styles.repasDetail}>{detail}</Text>
          {liste.period && (
            <Text style={styles.repasDetail}>{periodeRepas(liste.period.start_date, liste.period.end_date)}</Text>
          )}
        </View>
      </View>

      {apercu.length === 0 ? (
        <Text style={styles.texteDoux}>Tout est acheté.</Text>
      ) : (
        <View>
          {apercu.map((i, index) => (
            <View key={i.id} style={[styles.article, index < apercu.length - 1 && styles.articleSepare]}>
              <Text style={styles.nomArticle} numberOfLines={1}>{majuscule(i.name)}</Text>
              {i.required.length > 0 && (
                <Text style={styles.quantite} numberOfLines={1}>{quantityLabel(i.required)}</Text>
              )}
            </View>
          ))}
        </View>
      )}

      <View style={styles.piedListe}>
        <Text style={styles.texteDoux}>
          {autres > 0 ? `+${autres} autre${autres > 1 ? "s" : ""} article${autres > 1 ? "s" : ""}` : ""}
        </Text>
        <View style={styles.lienFleche}>
          <Text style={styles.lien}>Voir la liste</Text>
          <MaterialCommunityIcons name="arrow-right" size={16} color={c.green} accessible={false} />
        </View>
      </View>
    </Pressable>
  );
}

function TitreSection({ titre, lien, onLien }: { titre: string; lien?: string; onLien?: () => void }) {
  return (
    <View style={styles.titreSectionLigne}>
      <Text accessibilityRole="header" style={styles.titreSection}>{titre}</Text>
      {lien && onLien && (
        <Pressable accessibilityRole="button" onPress={onLien} hitSlop={10}>
          <Text style={styles.lien}>{lien}</Text>
        </Pressable>
      )}
    </View>
  );
}

const OMBRE = {
  shadowColor: "#1a2e22",
  shadowOpacity: 0.06,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
};

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 4 },
  greeting: { flex: 1 },
  boutonProfil: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: c.light },
  date: { fontFamily: "DMSans_500Medium", fontSize: 14, lineHeight: 19, color: c.muted },
  salut: { fontFamily: "DMSans_700Bold", fontSize: 28, lineHeight: 34, color: c.ink },

  section: { gap: 10, marginTop: 8 },
  titreSectionLigne: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  titreSection: { fontFamily: "DMSans_700Bold", fontSize: 19, lineHeight: 25, color: c.ink },
  lien: { fontFamily: "DMSans_700Bold", fontSize: 14, lineHeight: 19, color: c.green },
  lienFleche: { flexDirection: "row", alignItems: "center", gap: 4 },

  carte: { backgroundColor: "white", borderRadius: 20, padding: 16, gap: 12, ...OMBRE },
  carteRepas: { backgroundColor: "white", borderRadius: 20, padding: 12, flexDirection: "row", alignItems: "center", gap: 14, ...OMBRE },
  carteRepasPassee: { backgroundColor: "#f3f3f0", shadowOpacity: 0, elevation: 0 },
  contenuPasse: { opacity: 0.55 },
  appuye: { opacity: 0.75 },
  titreCarte: { fontFamily: "DMSans_700Bold", fontSize: 16, lineHeight: 22, color: c.ink },
  texteDoux: { fontFamily: "DMSans_500Medium", fontSize: 14, lineHeight: 19, color: c.muted },

  vignette: { width: 72, height: 72, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: c.light },
  vignetteVide: { backgroundColor: "transparent", borderWidth: 1.5, borderStyle: "dashed", borderColor: c.border },
  quand: { fontFamily: "DMSans_700Bold", fontSize: 12, lineHeight: 16, color: c.green, letterSpacing: 0.4 },
  quandPasse: { color: c.muted },
  repasNom: { fontFamily: "DMSans_700Bold", fontSize: 17, lineHeight: 23, color: c.ink },
  repasDetail: { fontFamily: "DMSans_500Medium", fontSize: 13, lineHeight: 18, color: c.muted },

  enTeteListe: { flexDirection: "row", alignItems: "center", gap: 12 },
  tuileIcone: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: c.light },
  article: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  articleSepare: { borderBottomWidth: 1, borderBottomColor: c.border },
  nomArticle: { flex: 1, fontFamily: "DMSans_500Medium", fontSize: 15, lineHeight: 20, color: c.ink },
  quantite: { fontFamily: "DMSans_500Medium", fontSize: 13, lineHeight: 18, color: c.muted, maxWidth: 120 },
  piedListe: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 10, borderTopWidth: 1, borderTopColor: c.border },

  boutonVert: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: c.green, borderRadius: 12, minHeight: 46, paddingHorizontal: 16 },
  texteBoutonVert: { fontFamily: "DMSans_700Bold", fontSize: 15, lineHeight: 20, color: "white" },
});