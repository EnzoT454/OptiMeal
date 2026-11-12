import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { MealPlanEntry, MealType, RecipeSummary } from "../types/api";
import AddMealSheet from "../components/AddMealSheet";
import MealActionsSheet, { type Placement } from "../components/MealActionsSheet";
import MonthGrid, { semainesDuMois } from "../components/MonthGrid";
import { RecipeScreen, RecipeTitle, recipeColors, recipeStyles } from "../components/recipes";
import { useListeAchats } from "../components/useShoppingList";
import ShoppingListView from "../components/ShoppingListView";

// Le texte du calendrier grandit au maximum de 20 % avec la taille de police du téléphone,
// sinon les lignes deviennent énormes (on garde quand même un peu d'accessibilité).
const MAX = 1.2;
import {
  MEALS, MEAL_COLORS, MEAL_LABELS,
  addDays, addEntry, dayName, getPlan, mealName, mondayOf, recipeUnavailable, removeEntry, toISODate, updateEntry,
} from "../components/planning";

// Le jeudi décide à quel mois appartient une semaine (ex. 28 oct. → 3 nov. = novembre)
const jeudiDe = (lundi: Date) => addDays(lundi, 3);

// La semaine à afficher quand on arrive sur un mois : celle d'aujourd'hui si c'est ce mois-ci,
// sinon la première semaine du mois
function premiereSemaine(mois: Date): Date {
  const auj = new Date();
  if (auj.getFullYear() === mois.getFullYear() && auj.getMonth() === mois.getMonth()) return mondayOf(auj);
  const lundi = mondayOf(new Date(mois.getFullYear(), mois.getMonth(), 1));
  return jeudiDe(lundi).getMonth() === mois.getMonth() ? lundi : addDays(lundi, 7);
}

const MOIS_COURTS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
// « 2 – 8 nov. » ou « 26 oct. – 1 nov. » (court, pour tenir sur une ligne)
function titreSemaine(lundi: Date): string {
  const dim = addDays(lundi, 6);
  return lundi.getMonth() === dim.getMonth()
    ? `${lundi.getDate()} – ${dim.getDate()} ${MOIS_COURTS[dim.getMonth()]}`
    : `${lundi.getDate()} ${MOIS_COURTS[lundi.getMonth()]} – ${dim.getDate()} ${MOIS_COURTS[dim.getMonth()]}`;
}

// « Cette semaine », « Semaine prochaine », « Dans 3 semaines », « Il y a 2 semaines »…
function semaineRelative(lundi: Date): string {
  const ecart = Math.round((lundi.getTime() - mondayOf(new Date()).getTime()) / (7 * 24 * 3600 * 1000));
  if (ecart === 0) return "Cette semaine";
  if (ecart === 1) return "Semaine prochaine";
  if (ecart === -1) return "Semaine dernière";
  return ecart > 0 ? `Dans ${ecart} semaines` : `Il y a ${-ecart} semaines`;
}

export default function CalendarScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  // ---- Repas | Épicerie ----
  const [vue, setVue] = useState<"repas" | "epicerie">("repas");
  const liste = useListeAchats();

  // L'Accueil peut ouvrir directement l'Épicerie : navigate("Calendrier", { vue: "epicerie" })
  useEffect(() => {
    if (route.params?.vue) {
      setVue(route.params.vue);
      navigation.setParams({ vue: undefined }); // pour que ça remarche la prochaine fois
    }
  }, [route.params?.vue]);

  // ---- L'état de l'écran ----
  const [lundi, setLundi] = useState(() => mondayOf(new Date()));    // la semaine affichée
  const [mois, setMois] = useState(() => new Date());                // le mois de la grille
  const [moisOuvert, setMoisOuvert] = useState(true);                 // grille ouverte au départ
  const [entries, setEntries] = useState<MealPlanEntry[]>([]);        // tous les repas du mois
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [jourAjout, setJourAjout] = useState<Date | null>(null);        // panneau « ajouter » (null = fermé)
  const [repasOuvert, setRepasOuvert] = useState<MealPlanEntry | null>(null); // menu du repas (null = fermé)

  // ---- Charger les repas du mois : une requête par semaine de la grille (4 à 6), en même temps ----
  // (la semaine affichée est toujours dans la grille, donc une seule source pour les points ET la liste)
  // Recharger aussi au retour d'un autre onglet, après publication ou suppression d'une recette.
  useFocusEffect(useCallback(() => {
    let annule = false;
    setChargement(true);
    setErreur(null);
    setEntries([]);
    setRepasOuvert(null);
    Promise.all(semainesDuMois(mois).map((s) => getPlan(toISODate(s[0]))))
      .then((plans) => { if (!annule) setEntries(plans.flatMap((p) => p.entries)); })
      .catch(() => { if (!annule) setErreur("Impossible de charger le calendrier."); })
      .finally(() => { if (!annule) setChargement(false); });
    return () => { annule = true; };
  }, [mois.getFullYear(), mois.getMonth()]));

  // ---- Quand les repas changent (ajout, retrait, portions, déplacement), la liste suit ----
  const signature = entries.map((e) => `${e.id}:${e.date}:${e.servings}:${e.is_leftover}`).join("|");
  useEffect(() => {
    if (!chargement) liste.recharger();
  }, [signature, chargement]);

  // ---- Naviguer ----
  function allerSemaine(nouveauLundi: Date) {   // flèches de la semaine
    setLundi(nouveauLundi);
    // La grille ne change de mois que si la nouvelle semaine n'y est plus
    const visible = semainesDuMois(mois).some((s) => toISODate(s[0]) === toISODate(nouveauLundi));
    if (!visible) setMois(jeudiDe(nouveauLundi));
  }

  function changerMois(decalage: number) {      // flèches du mois
    const nouveau = new Date(mois.getFullYear(), mois.getMonth() + decalage, 1);
    setMois(nouveau);
    setLundi(premiereSemaine(nouveau));
  }

  function allerAuJour(jour: Date) {            // toucher un jour dans la grille
    setLundi(mondayOf(jour));
    if (jour.getMonth() !== mois.getMonth()) setMois(jour); // jour gris d'un autre mois
  }

  function allerAujourdhui() {
    setLundi(mondayOf(new Date()));
    setMois(new Date());                         // le vrai mois d'aujourd'hui
  }

  // ---- Modifier la liste locale (sans tout recharger) ----
  const remplacer = (nouveau: MealPlanEntry) =>
    setEntries((avant) => avant.map((e) => (e.id === nouveau.id ? nouveau : e)));
  const ajouterLocal = (nouveau: MealPlanEntry) => setEntries((avant) => [...avant, nouveau]);

  // ---- Ajouter un repas (appelé par le panneau +) ----
  async function ajouter(meal: MealType, recette: RecipeSummary | null, texte: string, portions: number) {
    if (jourAjout === null) return;
    try {
      ajouterLocal(await addEntry({
        date: toISODate(jourAjout),
        meal,
        recipe_id: recette ? recette.id : null,
        recipe_name: recette ? recette.name : null,
        free_text: recette ? null : texte,
        servings: portions,
      }));
      setJourAjout(null);
    } catch {
      setErreur("Impossible d'ajouter ce repas.");
    }
  }

  // ---- Les actions du menu d'un repas ----
  async function changerPortions(portions: number) {
    if (repasOuvert === null) return;
    try {
      const nouveau = await updateEntry(repasOuvert.id, { servings: portions });
      remplacer(nouveau);
      setRepasOuvert(nouveau); // le menu montre le nouveau nombre
    } catch {
      setErreur("Impossible de changer les portions.");
    }
  }

  async function placer(action: Placement, date: string, meal: MealType) {
    const r = repasOuvert;
    if (r === null) return;
    if (action !== "deplacer" && recipeUnavailable(r)) return;
    try {
      if (action === "deplacer") {
        remplacer(await updateEntry(r.id, { date, meal }));
      } else {
        // « restes » et « dupliquer » créent un nouveau repas avec la même recette
        ajouterLocal(await addEntry({
          date, meal,
          recipe_id: r.recipe_id,
          recipe_name: r.recipe_name,
          free_text: r.free_text,
          servings: r.servings,
          is_leftover: action === "restes" ? true : r.is_leftover,
        }));
      }
      setRepasOuvert(null);
    } catch {
      setErreur("Impossible de faire cette action.");
    }
  }

  async function retirer() {
    const r = repasOuvert;
    if (r === null) return;
    try {
      await removeEntry(r.id);
      setEntries((avant) => avant.filter((e) => e.id !== r.id));
      setRepasOuvert(null);
    } catch {
      setErreur("Impossible de retirer ce repas.");
    }
  }

  function voirRecette(recipeId: string) {
    if (!repasOuvert || recipeUnavailable(repasOuvert) || repasOuvert.recipe_id !== recipeId) return;
    setRepasOuvert(null);
    navigation.navigate("Recettes", { screen: "Detail", params: { id: recipeId }, initial: false });
  }

  // ---- Ce qu'on affiche ----
  const aujourdhui = toISODate(new Date());
  const jours = Array.from({ length: 7 }, (_, i) => addDays(lundi, i));
  const debut = toISODate(lundi);
  const fin = toISODate(addDays(lundi, 6));
  const nbRepas = entries.filter((e) => e.date >= debut && e.date <= fin).length;
  const cetteSemaine = toISODate(mondayOf(new Date())) === debut;

  // Les points de la grille : "2026-11-03" → ["dejeuner", "souper"]
  const points: Record<string, MealType[]> = {};
  for (const e of entries) points[e.date] = [...(points[e.date] ?? []), e.meal];

  return (
    <RecipeScreen compact>
      <RecipeTitle>Calendrier</RecipeTitle>

      {/* ---- [ Repas | Épicerie · 14 ] ---- */}
      <View style={styles.selecteur} accessibilityRole="tablist">
        {(["repas", "epicerie"] as const).map((v) => {
          const choisi = vue === v;
          const nb = liste.aAcheter.length;
          return (
            <Pressable key={v} onPress={() => setVue(v)} accessibilityRole="tab" accessibilityState={{ selected: choisi }}
              style={[styles.option, choisi && styles.optionChoisie]}>
              <Text style={[styles.optionTexte, choisi && styles.optionTexteChoisi]} maxFontSizeMultiplier={MAX}>
                {v === "repas" ? "Repas" : "Épicerie"}
              </Text>
              {v === "epicerie" && nb > 0 && (
                <View style={[styles.compteur, choisi && { backgroundColor: recipeColors.green }]}>
                  <Text style={[styles.compteurTexte, choisi && { color: "white" }]} maxFontSizeMultiplier={MAX}>{nb}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>

      {vue === "epicerie" && <ShoppingListView liste={liste} />}

      {vue === "repas" && (<>
      {/* ---- ‹ Novembre ⌄ › (+ la grille quand elle est ouverte) ---- */}
      <MonthGrid
        mois={mois}
        choisi={debut}
        points={points}
        ouvert={moisOuvert}
        onBasculer={() => setMoisOuvert(!moisOuvert)}
        onMois={changerMois}
        onJour={allerAuJour}
        estAujourdhui={cetteSemaine}
        onAujourdhui={allerAujourdhui}
      />

      {/* ---- ‹ Semaine du 2 au 8 nov. › ---- */}
      <View style={styles.semaine}>
        <Pressable onPress={() => allerSemaine(addDays(lundi, -7))} hitSlop={12} style={styles.fleche} accessibilityLabel="Semaine précédente">
          <Ionicons name="chevron-back" size={18} color={recipeColors.green} />
        </Pressable>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={styles.semaineTitre} numberOfLines={1} maxFontSizeMultiplier={MAX}>{titreSemaine(lundi)}</Text>
          <Text style={recipeStyles.note} maxFontSizeMultiplier={MAX}>
            {semaineRelative(lundi)} · {nbRepas === 0 ? "aucun repas" : `${nbRepas} repas`}
          </Text>
        </View>
        <Pressable onPress={() => allerSemaine(addDays(lundi, 7))} hitSlop={12} style={styles.fleche} accessibilityLabel="Semaine suivante">
          <Ionicons name="chevron-forward" size={18} color={recipeColors.green} />
        </Pressable>
      </View>

      {chargement && <ActivityIndicator color={recipeColors.green} style={{ marginTop: 12 }} />}
      {erreur !== null && (
        <View style={recipeStyles.notice}>
          <Text style={styles.erreur} maxFontSizeMultiplier={MAX}>{erreur}</Text>
        </View>
      )}

      {/* ---- Les 7 jours de la semaine, d'un bord à l'autre ---- */}
      {!chargement && (
        <View style={styles.liste}>
          {jours.map((jour, i) => {
            const iso = toISODate(jour);
            const estAujourdhui = iso === aujourdhui;
            const repasDuJour = entries
              .filter((e) => e.date === iso)
              .sort((a, b) => MEALS.indexOf(a.meal) - MEALS.indexOf(b.meal));

            return (
              <View key={iso} style={[styles.jour, i > 0 && styles.separateur]}>
                {/* Gros chiffre + jour de la semaine */}
                <View style={styles.date}>
                  <View style={[styles.rond, estAujourdhui && styles.rondAujourdhui]}>
                    <Text style={[styles.chiffre, estAujourdhui && { color: "white" }]} maxFontSizeMultiplier={MAX}>{jour.getDate()}</Text>
                  </View>
                  <Text style={[styles.jourNom, estAujourdhui && { color: recipeColors.green }]} maxFontSizeMultiplier={MAX}>
                    {dayName(jour).toLowerCase()}
                  </Text>
                </View>

                {/* Les repas (rien si le jour est vide : la ligne reste fine) */}
                <View style={styles.repas}>
                  {repasDuJour.map((e) => (
                    <CarteRepas key={e.id} repas={e} onPress={() => setRepasOuvert(e)} />
                  ))}
                </View>

                <Pressable onPress={() => setJourAjout(jour)} hitSlop={10} style={styles.plus} accessibilityLabel={`Ajouter un repas le ${jour.getDate()}`}>
                  <Ionicons name="add" size={18} color={recipeColors.green} />
                </Pressable>
              </View>
            );
          })}

        </View>
      )}
      </>)}

      <AddMealSheet jour={jourAjout} onClose={() => setJourAjout(null)} onAdd={ajouter} />
      <MealActionsSheet
        repas={repasOuvert}
        onClose={() => setRepasOuvert(null)}
        onVoirRecette={voirRecette}
        onPortions={changerPortions}
        onPlacer={placer}
        onRetirer={retirer}
      />
    </RecipeScreen>
  );
}

// ---- Une carte de repas : barre de couleur + photo (ou icône) + nom + « Souper · 2 p. » ----
function CarteRepas({ repas, onPress }: { repas: MealPlanEntry; onPress: () => void }) {
  const couleur = MEAL_COLORS[repas.meal];
  const icone = repas.is_leftover ? "refresh-outline" : repas.recipe_id ? "restaurant-outline" : "create-outline";

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.carte, pressed && { opacity: 0.7 }]}>
      <View style={[styles.barre, { backgroundColor: couleur.dot }]} />
      {repas.recipe_image_url ? (
        <Image source={{ uri: repas.recipe_image_url }} style={styles.photo} />
      ) : (
        <View style={[styles.photo, styles.photoVide]}>
          <Ionicons name={icone} size={16} color={recipeColors.green} />
        </View>
      )}
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={styles.carteNom} numberOfLines={1} maxFontSizeMultiplier={MAX}>{mealName(repas)}</Text>
        <Text style={[styles.carteMoment, { color: couleur.text }]} numberOfLines={1} maxFontSizeMultiplier={MAX}>
          {repas.is_leftover ? "♻ Restes · " : ""}{MEAL_LABELS[repas.meal]} · {repas.servings} p.
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  erreur: { fontFamily: "DMSans_500Medium", fontSize: 14, lineHeight: 19, color: "#b3261e" },
  // Sélecteur Repas | Épicerie (style « segmented control »)
  selecteur: { flexDirection: "row", padding: 3, borderRadius: 12, backgroundColor: recipeColors.light },
  option: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8, borderRadius: 10 },
  optionChoisie: { backgroundColor: "white", borderWidth: 1, borderColor: recipeColors.border },
  optionTexte: { fontFamily: "DMSans_500Medium", fontSize: 14, lineHeight: 19, color: recipeColors.muted },
  optionTexteChoisi: { fontFamily: "DMSans_700Bold", color: recipeColors.ink },
  compteur: { minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: recipeColors.border },
  compteurTexte: { fontFamily: "DMSans_700Bold", fontSize: 11, lineHeight: 14, color: recipeColors.muted },
  // marginHorizontal: -20 annule la marge de RecipeScreen : la liste va d'un bord à l'autre du téléphone
  liste: { backgroundColor: "white", marginHorizontal: -20, paddingHorizontal: 16 },
  semaine: { flexDirection: "row", alignItems: "center", gap: 8 },
  semaineTitre: { fontFamily: "DMSans_700Bold", fontSize: 16, lineHeight: 21, color: recipeColors.ink },
  fleche: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: recipeColors.light },
  jour: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 8, minHeight: 48 },
  separateur: { borderTopWidth: 1, borderTopColor: recipeColors.border },
  date: { width: 34, alignItems: "center" },
  rond: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  rondAujourdhui: { backgroundColor: recipeColors.green },
  chiffre: { fontFamily: "DMSans_700Bold", fontSize: 16, lineHeight: 20, color: recipeColors.ink },
  jourNom: { fontFamily: "DMSans_500Medium", fontSize: 10, lineHeight: 13, color: recipeColors.muted },
  repas: { flex: 1, gap: 6 },
  plus: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: recipeColors.light },
  carte: { flexDirection: "row", alignItems: "center", gap: 8, padding: 4, paddingLeft: 0, borderRadius: 10, backgroundColor: recipeColors.background, overflow: "hidden" },
  barre: { width: 4, alignSelf: "stretch" },
  photo: { width: 34, height: 34, borderRadius: 8 },
  photoVide: { alignItems: "center", justifyContent: "center", backgroundColor: recipeColors.light },
  carteNom: { fontFamily: "DMSans_700Bold", fontSize: 13, lineHeight: 17, color: recipeColors.ink },
  carteMoment: { fontFamily: "DMSans_500Medium", fontSize: 11, lineHeight: 14 },
});