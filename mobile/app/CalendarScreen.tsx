import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { MealPlanEntry, MealType, RecipeSummary } from "../types/api";
import AddMealSheet from "../components/AddMealSheet";
import {
  MEALS, MEAL_COLORS, MEAL_LABELS,
  addDays, addEntry, dayName, getPlan, mondayOf, removeEntry, toISODate, weekLabel,
} from "../components/planning";

const VERT = "#25603c";

export default function CalendarScreen() {
  // ---- L'état de l'écran ----
  const [lundi, setLundi] = useState(() => mondayOf(new Date()));
  const [entries, setEntries] = useState<MealPlanEntry[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [selection, setSelection] = useState<string | null>(null);
  const [jourAjout, setJourAjout] = useState<Date | null>(null); // jour où on ajoute (null = panneau fermé)

  // ---- Charger le plan chaque fois que la semaine change ----
  useEffect(() => {
    let annule = false;
    setChargement(true);
    setErreur(null);
    setSelection(null);
    getPlan(toISODate(lundi))
      .then((plan) => { if (!annule) setEntries(plan.entries); })
      .catch(() => { if (!annule) setErreur("Impossible de charger le calendrier."); })
      .finally(() => { if (!annule) setChargement(false); });
    return () => { annule = true; };
  }, [lundi]);

  // ---- Retirer le repas sélectionné ----
  async function retirer() {
    if (selection === null) return;
    try {
      await removeEntry(selection);
      setEntries((avant) => avant.filter((e) => e.id !== selection));
      setSelection(null);
    } catch {
      setErreur("Impossible de retirer ce repas.");
    }
  }

 // ---- Ajouter un repas (appelé par le panneau) ----
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

  const jours = Array.from({ length: 7 }, (_, i) => addDays(lundi, i));
  const aujourdhui = toISODate(new Date());

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.contenu}>
        <Text style={styles.title}>Calendrier</Text>

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

        {selection !== null && (
          <Pressable style={styles.boutonRetirer} onPress={retirer}>
            <Text style={styles.boutonRetirerTexte}>Retirer ce repas</Text>
          </Pressable>
        )}

        {chargement && <ActivityIndicator color={VERT} style={{ marginTop: 24 }} />}
        {erreur !== null && <Text style={styles.erreur}>{erreur}</Text>}

        {!chargement && erreur === null && jours.map((jour) => {
          const iso = toISODate(jour);
          const repasDuJour = entries
            .filter((e) => e.date === iso)
            .sort((a, b) => MEALS.indexOf(a.meal) - MEALS.indexOf(b.meal));

          return (
            <View key={iso} style={styles.jour}>
              <View style={styles.jourEntete}>
                <Text style={styles.jourNom}>{dayName(jour)}</Text>
                <Text style={[styles.jourDate, iso === aujourdhui && { color: VERT }]}>{jour.getDate()}</Text>
              </View>

              <View style={{ flex: 1 }}>
                {repasDuJour.map((e) => (
                  <Pressable
                    key={e.id}
                    onPress={() => setSelection(selection === e.id ? null : e.id)}
                    style={[
                      styles.carte,
                      { backgroundColor: MEAL_COLORS[e.meal].bg },
                      selection === e.id && styles.carteSelection,
                    ]}
                  >
                    <Text style={[styles.carteNom, { color: MEAL_COLORS[e.meal].text }]} numberOfLines={1}>
                      {e.recipe_name ?? e.free_text}
                    </Text>
                    <Text style={[styles.carteMoment, { color: MEAL_COLORS[e.meal].text }]}>
                      {e.servings} p. · {MEAL_LABELS[e.meal]}
                    </Text>
                  </Pressable>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  contenu: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 28, fontWeight: "700", color: "#1d2b22" },
  semaineLigne: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 12 },
  week: { fontSize: 18, fontWeight: "600" },
  resume: { color: "#65746a", marginTop: 4, marginBottom: 8 },
  jour: { flexDirection: "row", gap: 12, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#d9e0db" },
  jourEntete: { width: 40, alignItems: "center" },
  jourNom: { fontSize: 11, color: "#65746a" },
  jourDate: { fontSize: 18, fontWeight: "600" },
  carte: { flexDirection: "row", alignItems: "center", padding: 10, borderRadius: 8, marginBottom: 6, borderWidth: 2, borderColor: "transparent" },
  carteSelection: { borderColor: VERT },
  carteNom: { flex: 1, fontSize: 15 },
  carteMoment: { fontSize: 11, marginLeft: 8 },
  ajouter: { color: VERT, paddingVertical: 10 },
  plus: { paddingTop: 8 },
  erreur: { color: "#b3261e", marginTop: 16 },
  boutonRetirer: { alignSelf: "flex-start", marginTop: 8, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: "#b3261e" },
  boutonRetirerTexte: { color: "#b3261e" },
});