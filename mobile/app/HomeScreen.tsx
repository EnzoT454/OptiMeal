import { useCallback, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { HomeStackParams } from "../types/navigation";
import { useAuth } from "../context/AuthContext";
import { RecipeScreen, recipeColors as c, recipeStyles } from "../components/recipes";
import { MEALS, MEAL_COLORS, MEAL_LABELS, dayFullName, getPlan, mealName, mondayOf, recipeUnavailable, toISODate } from "../components/planning";
import ListSummaryRow from '../components/lists/ListSummaryRow';
import { shoppingListDestination } from '../services/shoppingNavigation';
import { fetchLists } from "../services/shoppingLists";
import { storeName } from "../components/promos";
import { fetchAllOffers, isOnPromo } from "../components/search";
import { followsOffer } from "../components/follows";
import { useFollows } from "../components/useFollows";
import MenuCompte, { type SectionMenu } from "../components/MenuCompte";
import type { MealPlanEntry, MealType, Offer } from "../types/api";
import type { ShoppingListRead } from "../types/shoppingLists";

// =====================================================================
// Accueil : en-tête (avatar à droite → menu du compte) + 3 sections
//   1. Aujourd'hui / Demain → les repas du jour qui compte (appui = la recette)
//   2. Mes listes en cours  → une ligne par liste (appui = la liste)
//   3. Promos suivies       → 1 carte large, 2 cartes côte à côte, ou un carrousel (3 et plus)
// =====================================================================

const HEURE_BASCULE = 21;       // à partir de 21 h, on montre les repas de demain
const NB_LISTES_MAX = 3;
const NB_PROMOS_MAX = 8;

// Heure à partir de laquelle un repas du jour est considéré comme passé
const FIN_DU_REPAS: Record<MealType, number> = { dejeuner: 11, diner: 15, souper: 21, collation: 24 };

const ORANGE_FONCE = "#7a4106";
const ORANGE_PALE = "#fff1d6";
const PRIX_PROMO = "#b45309";

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

function estPasse(e: MealPlanEntry, maintenant: Date) {
  return e.date === toISODate(maintenant) && maintenant.getHours() >= FIN_DU_REPAS[e.meal];
}

function libelleRepas(e: MealPlanEntry, maintenant: Date) {
  if (e.date === toISODate(maintenant) && e.meal === "souper" && !estPasse(e, maintenant)) return "Ce soir";
  return MEAL_LABELS[e.meal];
}

// Les copies actives restent visibles jusqu’à leur fin explicite, sans échéance.
function listesEnCours(listes: ShoppingListRead[]) {
  return listes.filter(l => l.status === 'draft' || l.status === 'active')
    .sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''));
}

// "Aujourd'hui", "Demain", "Lun. 16 nov."
function dateCourte(iso: string, aujourdhui: string) {
  if (iso === aujourdhui) return "Aujourd'hui";
  if (iso === toISODate(plusJours(new Date(), 1))) return "Demain";
  return majuscule(dateDe(iso).toLocaleDateString("fr-CA", { weekday: "short", day: "numeric", month: "short" }));
}

// "≈ 21 $" si tous les prix sont connus, "au moins 21 $" sinon, rien si aucun prix connu
// Prix et rabais d'une offre (montants en texte, ex. "2.49")
function prixRegulier(o: Offer): number | null {
  const n = Number(o.price.amount);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function prixPromo(o: Offer): number | null {
  const n = Number(o.promo_price?.amount);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function rabais(o: Offer): number | null {
  const base = prixRegulier(o);
  const promo = prixPromo(o);
  if (base === null || promo === null || base <= promo) return null;
  return Math.round((1 - promo / base) * 100);
}
const enDollars = (n: number) => `${n.toFixed(2).replace(".", ",")} $`;

export default function HomeScreen({ navigation }: NativeStackScreenProps<HomeStackParams, 'Home'>) {
  const { session } = useAuth();
  const maintenant = new Date();
  const [menuOuvert, setMenuOuvert] = useState(false);

  const sectionsMenu: SectionMenu[] = [
    { titre: "Mon épicerie", elements: [
      { icone: "format-list-checks", titre: "Mes listes", onPress: () => navigation.getParent()?.navigate("Liste") },
      { icone: "bell-outline", titre: "Produits suivis", onPress: () => navigation.getParent()?.navigate("Promos", { screen: "Follows" }) },
      { icone: "cancel", titre: "Ingrédients non suggérés", onPress: () => navigation.navigate("Exclusions") },
    ]},
    { titre: "Application", elements: [
      { icone: "cog-outline", titre: "Paramètres", onPress: () => navigation.navigate("Paramètres") },
    ]},
  ];

  return (
    <RecipeScreen>
      <View style={styles.header}>
        <View style={styles.greeting}>
          <Text style={styles.date}>{majuscule(dayFullName(maintenant))}</Text>
          <Text accessibilityRole="header" style={styles.salut}>{salutation(maintenant)}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mon compte"
          accessibilityHint="Ouvre le menu du compte."
          onPress={() => setMenuOuvert(true)}
          style={({ pressed }) => [styles.boutonProfil, pressed && styles.appuye]}
        >
          <MaterialCommunityIcons name="account-outline" size={24} color={c.green} accessible={false} />
        </Pressable>
      </View>

      {session ? (
        <TableauDeBord />
      ) : (
        <View style={styles.carte}>
          <Text style={styles.titreCarte}>Bienvenue dans OptiMeal</Text>
          <Text style={recipeStyles.body}>
            Découvre les recettes, les promotions et les circulaires. Connecte-toi pour planifier tes repas
            et retrouver tes listes d’épicerie ici.
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
  const [essai, setEssai] = useState(0);

  // Produits suivis (onglet Promos) : même logique que FollowsScreen
  const { follows, recharger: rechargerSuivis } = useFollows();
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

    fetchLists(0, 'current')
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
  const ouvrirRepas = (e: MealPlanEntry) => {
    if (e.recipe_id && !recipeUnavailable(e)) {
      navigation.navigate("Detail", { id: e.recipe_id }); // écran recette dans l'Accueil
    } else {
      ouvrirSemaine(); // note libre ou recette supprimée
    }
  };
  const ouvrirListes = () => navigation.navigate("Liste", { screen: "Lists" });
  const creerListe = () => {
    const start = mondayOf(new Date());
    const period = { start_date: toISODate(start), end_date: toISODate(plusJours(start, 6)) };
    navigation.navigate("Liste", { screen: "CreateList", ...(nbRepasSemaine > 0 ? { params: { period } } : {}), initial: false });
  };
  const ouvrirListe = (id: string) => (navigation.getParent?.() ?? navigation).navigate("Liste", shoppingListDestination(id));
  const ouvrirSuivis = () => navigation.navigate("Promos", { screen: "Follows", initial: false });
  const ouvrirPromos = () => navigation.navigate("Promos", { screen: "List" });
  const ouvrirOffre = (o: Offer) => navigation.navigate("Promos", { screen: "Detail", params: { offer: o }, initial: false });
  const reessayer = () => {
    setChargementRepas(true); setChargementListes(true); setChargementPromos(true);
    setEssai((n) => n + 1);
  };

  // Données affichées
  const repasDuJour = repas
    .filter((e) => e.date === jour.iso)
    .sort((a, b) => MEALS.indexOf(a.meal) - MEALS.indexOf(b.meal));

  const listesAffichees = listesEnCours(listes).slice(0, NB_LISTES_MAX);
  const chargement = chargementListes || chargementRepas;

  const suivisEnPromo = offres
    .filter((o) => follows.some((f) => followsOffer(f, o)) && isOnPromo(o))
    .sort((a, b) => (rabais(b) ?? 0) - (rabais(a) ?? 0))
    .slice(0, NB_PROMOS_MAX);

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
            style={({ pressed }) => [styles.carteLigne, pressed && styles.appuye]}>
            <View style={[styles.vignette, styles.vignetteVide]}>
              <MaterialCommunityIcons name="plus" size={24} color={c.muted} accessible={false} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.nom}>Rien de prévu</Text>
              <Text style={styles.detail}>
                {jour.estDemain ? "Planifie tes repas de demain." : "Planifie tes repas d'aujourd'hui."}
              </Text>
            </View>
            <Text style={styles.lien}>Planifier</Text>
          </Pressable>
        )}

        {!chargementRepas && !erreurRepas && repasDuJour.map((e) => {
          const passe = estPasse(e, maintenant);
          const aRecette = !!e.recipe_id && !recipeUnavailable(e);
          return (
            <Pressable key={e.id} accessibilityRole="button"
              accessibilityLabel={`${libelleRepas(e, maintenant)}, ${mealName(e)}${aRecette ? ", voir la recette" : ""}`}
              onPress={() => ouvrirRepas(e)}
              style={({ pressed }) => [styles.carteLigne, passe && styles.carteLignePassee, pressed && styles.appuye]}>
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
                <Text style={[styles.surtitre, passe && { color: c.muted }]}>
                  {e.is_leftover ? "RESTES · " : ""}{libelleRepas(e, maintenant).toUpperCase()}
                </Text>
                <Text style={styles.nom} numberOfLines={1}>{mealName(e)}</Text>
                <Text style={styles.detail}>
                  {e.servings} portion{e.servings > 1 ? "s" : ""}{aRecette ? " · voir la recette" : ""}
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={c.muted} accessible={false} />
            </Pressable>
          );
        })}
      </View>

      {/* ================= 2. Mes listes en cours ================= */}
      <View style={styles.section}>
        <TitreSection titre="Mes listes en cours" lien="Voir toutes" onLien={ouvrirListes} />

        {chargement && <View style={styles.carte}><ActivityIndicator color={c.green} /></View>}

        {!chargement && erreurListes && (
          <View style={styles.carte}>
            <Text style={recipeStyles.body}>Impossible de charger tes listes. Vérifie ta connexion.</Text>
            <Pressable accessibilityRole="button" onPress={reessayer}><Text style={styles.lien}>Réessayer</Text></Pressable>
          </View>
        )}

        {!chargement && !erreurListes && listesAffichees.length === 0 && (
          <View style={styles.carte}>
            <View style={styles.ligneIcone}>
              <View style={styles.tuileIcone}>
                <MaterialCommunityIcons name={nbRepasSemaine > 0 ? "calendar-check" : "basket-outline"} size={22} color={c.green} accessible={false} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.nom}>{nbRepasSemaine > 0 ? "Ta semaine est planifiée" : "Aucune liste en cours"}</Text>
                <Text style={styles.detail}>
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

        {!chargement && !erreurListes && listesAffichees.length > 0 && (
          <View style={[styles.carte, { paddingVertical: 4, gap: 0 }]}>
            {listesAffichees.map(list => <ListSummaryRow key={list.id} list={list} onPress={() => ouvrirListe(list.id)} />)}
          </View>
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
            style={({ pressed }) => [styles.carteLigne, pressed && styles.appuye]}>
            <View style={[styles.tuileIcone, { backgroundColor: ORANGE_PALE }]}>
              <MaterialCommunityIcons name="bell-outline" size={20} color={ORANGE_FONCE} accessible={false} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.nom}>Suis tes produits préférés</Text>
              <Text style={styles.detail}>Tu verras ici quand ils sont en promo.</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={c.muted} accessible={false} />
          </Pressable>
        )}

        {!chargementPromos && !erreurPromos && follows.length > 0 && suivisEnPromo.length === 0 && (
          <View style={styles.carteLigne}>
            <View style={styles.tuileIcone}>
              <MaterialCommunityIcons name="bell-sleep-outline" size={20} color={c.green} accessible={false} />
            </View>
            <Text style={[styles.texteDoux, { flex: 1 }]}>
              Aucun de tes {follows.length} produits suivis n’est en promo cette semaine.
            </Text>
          </View>
        )}

        {/* 1 produit : une carte pleine largeur */}
        {!chargementPromos && !erreurPromos && suivisEnPromo.length === 1 && (
          <CartePromoLarge offre={suivisEnPromo[0]} onPress={() => ouvrirOffre(suivisEnPromo[0])} />
        )}

        {/* 2 produits : deux cartes côte à côte */}
        {!chargementPromos && !erreurPromos && suivisEnPromo.length === 2 && (
          <View style={styles.deuxColonnes}>
            {suivisEnPromo.map((o) => (
              <CartePromo key={o.id} offre={o} pleineLargeur onPress={() => ouvrirOffre(o)} />
            ))}
          </View>
        )}

        {/* 3 produits ou plus : le carrousel */}
        {!chargementPromos && !erreurPromos && suivisEnPromo.length >= 3 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carrousel}>
            {suivisEnPromo.map((o) => <CartePromo key={o.id} offre={o} onPress={() => ouvrirOffre(o)} />)}
          </ScrollView>
        )}
      </View>
    </>
  );
}

// Petite carte : photo, rabais, nom, magasin, prix promo.
// pleineLargeur = partage la largeur avec une autre carte (cas de 2 produits)
function CartePromo({ offre, onPress, pleineLargeur = false }: { offre: Offer; onPress: () => void; pleineLargeur?: boolean }) {
  const pct = rabais(offre);
  const prix = prixPromo(offre);
  return (
    <Pressable accessibilityRole="button"
      accessibilityLabel={`${offre.product_name}, ${storeName(offre.retailer)}${prix ? `, ${enDollars(prix)}` : ""}`}
      onPress={onPress} style={({ pressed }) => [styles.cartePromo, pleineLargeur && styles.cartePromoFlexible, pressed && styles.appuye]}>
      <View style={styles.photoPromo}>
        {offre.image_url ? (
          <Image source={{ uri: offre.image_url }} style={styles.imagePromo} resizeMode="contain" accessible={false} />
        ) : (
          <MaterialCommunityIcons name="tag-outline" size={28} color={ORANGE_FONCE} accessible={false} />
        )}
        {pct !== null && (
          <View style={styles.pastille}><Text style={styles.textePastille}>−{pct} %</Text></View>
        )}
      </View>
      <View style={styles.infosPromo}>
        <Text style={styles.nomPromo} numberOfLines={2}>{offre.product_name}</Text>
        <Text style={styles.detail}>{storeName(offre.retailer)}</Text>
        {prix !== null && <Text style={styles.prixPromo}>{enDollars(prix)}</Text>}
      </View>
    </Pressable>
  );
}

// Grande carte pour un seul produit : photo à gauche, tout le détail à droite
function CartePromoLarge({ offre, onPress }: { offre: Offer; onPress: () => void }) {
  const pct = rabais(offre);
  const prix = prixPromo(offre);
  const base = prixRegulier(offre);
  return (
    <Pressable accessibilityRole="button"
      accessibilityLabel={`${offre.product_name}, ${storeName(offre.retailer)}${prix ? `, ${enDollars(prix)}` : ""}`}
      onPress={onPress} style={({ pressed }) => [styles.carteLarge, pressed && styles.appuye]}>
      <View style={styles.photoLarge}>
        {offre.image_url ? (
          <Image source={{ uri: offre.image_url }} style={styles.imagePromo} resizeMode="contain" accessible={false} />
        ) : (
          <MaterialCommunityIcons name="tag-outline" size={32} color={ORANGE_FONCE} accessible={false} />
        )}
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={styles.magasin}>{storeName(offre.retailer).toUpperCase()}</Text>
        <Text style={styles.nomPromo} numberOfLines={2}>{offre.product_name}</Text>
        <View style={styles.lignePrix}>
          {prix !== null && <Text style={styles.prixPromo}>{enDollars(prix)}</Text>}
          {base !== null && prix !== null && base > prix && <Text style={styles.prixBarre}>{enDollars(base)}</Text>}
          {pct !== null && (
            <View style={styles.pastilleEnLigne}><Text style={styles.textePastille}>−{pct} %</Text></View>
          )}
        </View>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={22} color={c.muted} accessible={false} />
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

  carte: { backgroundColor: "white", borderRadius: 20, padding: 16, gap: 12, ...OMBRE },
  carteLigne: { backgroundColor: "white", borderRadius: 20, padding: 12, flexDirection: "row", alignItems: "center", gap: 14, ...OMBRE },
  carteLignePassee: { backgroundColor: "#f3f3f0", shadowOpacity: 0, elevation: 0 },
  contenuPasse: { opacity: 0.55 },
  appuye: { opacity: 0.75 },
  titreCarte: { fontFamily: "DMSans_700Bold", fontSize: 16, lineHeight: 22, color: c.ink },
  texteDoux: { fontFamily: "DMSans_500Medium", fontSize: 14, lineHeight: 19, color: c.muted },

  vignette: { width: 72, height: 72, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: c.light },
  vignetteVide: { backgroundColor: "transparent", borderWidth: 1.5, borderStyle: "dashed", borderColor: c.border },
  surtitre: { fontFamily: "DMSans_700Bold", fontSize: 12, lineHeight: 16, color: c.green, letterSpacing: 0.4 },
  nom: { fontFamily: "DMSans_700Bold", fontSize: 16, lineHeight: 22, color: c.ink },
  detail: { fontFamily: "DMSans_500Medium", fontSize: 13, lineHeight: 18, color: c.muted },

  ligneIcone: { flexDirection: "row", alignItems: "center", gap: 12 },
  ligneListe: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  separateur: { borderBottomWidth: 1, borderBottomColor: c.border },
  tuileIcone: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: c.light },
  cout: { fontFamily: "DMSans_700Bold", fontSize: 14, lineHeight: 19, color: c.ink },

  boutonVert: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: c.green, borderRadius: 12, minHeight: 46, paddingHorizontal: 16 },
  texteBoutonVert: { fontFamily: "DMSans_700Bold", fontSize: 15, lineHeight: 20, color: "white" },

  // Promos : carrousel (3+), deux colonnes (2), carte large (1)
  carrousel: { gap: 12, paddingVertical: 4, paddingRight: 4 },
  deuxColonnes: { flexDirection: "row", gap: 12 },
  cartePromo: { width: 148, backgroundColor: "white", borderRadius: 18, overflow: "hidden", ...OMBRE },
  cartePromoFlexible: { width: undefined, flex: 1 },
  photoPromo: { height: 104, backgroundColor: "#faf8f3", alignItems: "center", justifyContent: "center" },
  imagePromo: { width: "84%", height: "84%" },
  pastille: { position: "absolute", top: 8, left: 8, backgroundColor: ORANGE_PALE, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  pastilleEnLigne: { backgroundColor: ORANGE_PALE, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  textePastille: { fontFamily: "DMSans_700Bold", fontSize: 12, lineHeight: 16, color: ORANGE_FONCE },
  infosPromo: { padding: 10, gap: 2 },
  nomPromo: { fontFamily: "DMSans_700Bold", fontSize: 14, lineHeight: 19, color: c.ink, minHeight: 38 },
  prixPromo: { fontFamily: "DMSans_700Bold", fontSize: 16, lineHeight: 21, color: PRIX_PROMO, marginTop: 2 },

  carteLarge: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: "white", borderRadius: 20, padding: 12, ...OMBRE },
  photoLarge: { width: 96, height: 96, borderRadius: 16, backgroundColor: "#faf8f3", alignItems: "center", justifyContent: "center" },
  magasin: { fontFamily: "DMSans_700Bold", fontSize: 11, lineHeight: 14, color: c.green, letterSpacing: 0.5 },
  lignePrix: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  prixBarre: { fontFamily: "DMSans_500Medium", fontSize: 13, lineHeight: 18, color: c.muted, textDecorationLine: "line-through" },
});
