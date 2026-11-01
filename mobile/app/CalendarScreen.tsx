import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { MealPlanEntry, MealType, RecipeSummary } from "../types/api";
import AddMealSheet from "../components/AddMealSheet";
import MealActionsSheet, { type Placement } from "../components/MealActionsSheet";
import {
  MEALS, MEAL_COLORS, MEAL_LABELS,
  addDays, addEntry, dayName, getPlan, mondayOf, removeEntry, toISODate, updateEntry, weekLabel,
} from "../components/planning";

const VERT = "#25603c";

export default function CalendarScreen() {
  const navigation = useNavigation<any>();

  // ---- L'état de l'écran ----
  const [lundi, setLundi] = useState(() => mondayOf(new Date()));
  const [entries, setEntries] = useState<MealPlanEntry[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [jourAjout, setJourAjout] = useState<Date | null>(null);        // panneau « ajouter » (null = fermé)
  const [repasOuvert, setRepasOuvert] = useState<MealPlanEntry | null>(null); // menu du repas (null = fermé)

  // ---- Charger le plan chaque fois que la semaine change ----
  useEffect(() => {
    let annule = false;
    setChargement(true);
    setErreur(null);
    getPlan(toISODate(lundi))
      .then((plan) => { if (!annule) setEntries(plan.entries); })
      .catch(() => { if (!annule) setErreur("Impossible de charger le calendrier."); })
      .finally(() => { if (!annule) setChargement(false); });
    return () => { annule = true; };
  }, [lundi]);

  // Un repas est-il dans la semaine affichée ? (sinon on ne l'affiche pas)
  const debut = toISODate(lundi);
  const fin = toISODate(addDays(lundi, 6));
  const dansLaSemaine = (e: MealPlanEntry) => e.date >= debut && e.date <= fin;

  // Remplacer un repas modifié dans la liste
  function remplacer(nouveau: MealPlanEntry) {
    setEntries((avant) => avant.map((e) => (e.id === nouveau.id ? nouveau : e)).filter(dansLaSemaine));
  }

  // ---- Ajouter un repas (appelé par le panneau +) ----
  async function ajouter(meal: MealType, recette: RecipeSummary | null, texte: string, portions: number) {
    if (jourAjout === null) return;
    try {
      const nouveau = await addEntry({
        date: toISODate(jourAjout),
        meal,
        recipe_id: recette ? recette.id : null,
        recipe_name: recette ? recette.name : null,
        free_text: recette ? null : texte,
        servings: portions,
      });
      setEntries((avant) => [...avant, nouveau]);
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
    try {
      if (action === "deplacer") {
        remplacer(await updateEntry(r.id, { date, meal }));
      } else {
        // « restes » et « dupliquer » créent un nouveau repas avec la même recette
        const nouveau = await addEntry({
          date, meal,
          recipe_id: r.recipe_id,
          recipe_name: r.recipe_name,
          free_text: r.free_text,
          servings: r.servings,
          is_leftover: action === "restes" ? true : r.is_leftover,
        });
        if (dansLaSemaine(nouveau)) setEntries((avant) => [...avant, nouveau]);
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
    setRepasOuvert(null);
    navigation.navigate("Recettes", { screen: "Detail", params: { id: recipeId }, initial: false });
  }

  const jours = Array.from({ length: 7 }, (_, i) => addDays(lundi, i));
  const aujourdhui = toISODate(new Date());
  const cetteSemaine = toISODate(mondayOf(new Date())) === debut;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.contenu}>
        {/* ---- En-tête ---- */}
        <View style={styles.entete}>
          <Text style={styles.title}>Calendrier</Text>
          {!cetteSemaine && (
            <Pressable style={styles.aujourdhui} onPress={() => setLundi(mondayOf(new Date()))}>
              <Ionicons name="today-outline" size={16} color={VERT} />
              <Text style={styles.aujourdhuiTexte}>Aujourd'hui</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.semaineLigne}>
          <Pressable onPress={() => setLundi(addDays(lundi, -7))} hitSlop={12} accessibilityLabel="Semaine précédente">
            <Ionicons name="chevron-back" size={22} color={VERT} />
          </Pressable>
          <Text style={styles.week}>{weekLabel(lundi)}</Text>
          <Pressable onPress={() => setLundi(addDays(lundi, 7))} hitSlop={12} accessibilityLabel="Semaine suivante">
            <Ionicons name="chevron-forward" size={22} color={VERT} />
          </Pressable>
        </View>
        <Text style={styles.resume}>{entries.length} repas planifiés</Text>

        {/* ---- Légende des couleurs ---- */}
        <View style={styles.legende}>
          {MEALS.map((m) => (
            <View key={m} style={styles.legendeItem}>
              <View style={[styles.point, { backgroundColor: MEAL_COLORS[m].text }]} />
              <Text style={[styles.legendeTexte, { color: MEAL_COLORS[m].text }]}>{MEAL_LABELS[m]}</Text>
            </View>
          ))}
        </View>

        {chargement && <ActivityIndicator color={VERT} style={{ marginTop: 24 }} />}
        {erreur !== null && <Text style={styles.erreur}>{erreur}</Text>}

        {/* ---- Les 7 jours ---- */}
        {!chargement && jours.map((jour) => {
          const iso = toISODate(jour);
          const estAujourdhui = iso === aujourdhui;
          const repasDuJour = entries
            .filter((e) => e.date === iso)
            .sort((a, b) => MEALS.indexOf(a.meal) - MEALS.indexOf(b.meal));

          return (
            <View key={iso} style={styles.jour}>
              <View style={[styles.jourEntete, estAujourdhui && styles.jourAujourdhui]}>
                <Text style={[styles.jourNom, estAujourdhui && { color: "#fff" }]}>{dayName(jour)}</Text>
                <Text style={[styles.jourDate, estAujourdhui && { color: "#fff" }]}>{jour.getDate()}</Text>
              </View>

              <View style={{ flex: 1 }}>
                {repasDuJour.map((e) => (
                  <CarteRepas key={e.id} repas={e} onPress={() => setRepasOuvert(e)} />
                ))}
                {repasDuJour.length === 0 && (
                  <Pressable onPress={() => setJourAjout(jour)}>
                    <Text style={styles.ajouter}>Ajouter un repas</Text>
                  </Pressable>
                )}
              </View>

              <Pressable onPress={() => setJourAjout(jour)} hitSlop={10} style={styles.plus} accessibilityLabel="Ajouter un repas">
                <Ionicons name="add" size={24} color={VERT} />
              </Pressable>
            </View>
          );
        })}
      </ScrollView>

      <AddMealSheet jour={jourAjout} onClose={() => setJourAjout(null)} onAdd={ajouter} />
      <MealActionsSheet
        repas={repasOuvert}
        onClose={() => setRepasOuvert(null)}
        onVoirRecette={voirRecette}
        onPortions={changerPortions}
        onPlacer={placer}
        onRetirer={retirer}
      />
    </SafeAreaView>
  );
}

// ---- Une carte de repas : photo (ou icône) + nom + « 2 p. · Souper » ----
function CarteRepas({ repas, onPress }: { repas: MealPlanEntry; onPress: () => void }) {
  const couleur = MEAL_COLORS[repas.meal];
  const icone = repas.is_leftover ? "refresh-outline" : repas.recipe_id ? "restaurant-outline" : "create-outline";

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.carte, { backgroundColor: couleur.bg }, pressed && { opacity: 0.7 }]}
    >
      {repas.recipe_image_url ? (
        <Image source={{ uri: repas.recipe_image_url }} style={styles.photo} />
      ) : (
        <View style={[styles.photo, styles.photoVide]}>
          <Ionicons name={icone} size={20} color={couleur.text} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={[styles.carteNom, { color: couleur.text }]} numberOfLines={1}>
          {repas.recipe_name ?? repas.free_text}
        </Text>
        <Text style={[styles.carteMoment, { color: couleur.text }]}>
          {repas.is_leftover ? "♻ Restes · " : ""}{repas.servings} p. · {MEAL_LABELS[repas.meal]}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  contenu: { padding: 20, paddingBottom: 40 },
  entete: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 28, fontWeight: "700", color: "#1d2b22" },
  aujourdhui: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: VERT },
  aujourdhuiTexte: { color: VERT, fontWeight: "600" },
  semaineLigne: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 12 },
  week: { fontSize: 18, fontWeight: "600" },
  resume: { color: "#65746a", marginTop: 4 },
  legende: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 10, marginBottom: 8 },
  legendeItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  point: { width: 8, height: 8, borderRadius: 4 },
  legendeTexte: { fontSize: 12 },
  jour: { flexDirection: "row", gap: 12, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#d9e0db" },
  jourEntete: { width: 44, alignItems: "center", paddingVertical: 4, borderRadius: 10, alignSelf: "flex-start" },
  jourAujourdhui: { backgroundColor: VERT },
  jourNom: { fontSize: 11, color: "#65746a" },
  jourDate: { fontSize: 18, fontWeight: "600" },
  carte: { flexDirection: "row", alignItems: "center", gap: 10, padding: 6, borderRadius: 10, marginBottom: 6 },
  photo: { width: 44, height: 44, borderRadius: 8 },
  photoVide: { alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.6)" },
  carteNom: { fontSize: 15, fontWeight: "600" },
  carteMoment: { fontSize: 12, marginTop: 2 },
  ajouter: { color: VERT, paddingVertical: 10 },
  plus: { paddingTop: 8 },
  erreur: { color: "#b3261e", marginTop: 16 },
});