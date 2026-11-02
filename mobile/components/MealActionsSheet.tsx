import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { MealPlanEntry, MealType } from "../types/api";
import {
  MEALS, MEAL_COLORS, MEAL_LABELS, addDays, dayFullName, dayName, fromISODate, mealName, recipeUnavailable, toISODate,
} from "./planning";

const VERT = "#25603c";
const ROUGE = "#b3261e";

// "menu" = la liste des actions ; les 3 autres = on choisit un jour et un moment.
export type Placement = "restes" | "dupliquer" | "deplacer";
type Ecran = "menu" | Placement;

const TITRES: Record<Placement, string> = {
  restes: "Prévoir les restes pour…",
  dupliquer: "Dupliquer vers…",
  deplacer: "Déplacer vers…",
};

type Props = {
  repas: MealPlanEntry | null; // null = panneau fermé
  onClose: () => void;
  onVoirRecette: (recipeId: string) => void;
  onPortions: (portions: number) => void;
  onPlacer: (action: Placement, date: string, meal: MealType) => void;
  onRetirer: () => void;
};

export default function MealActionsSheet({ repas, onClose, onVoirRecette, onPortions, onPlacer, onRetirer }: Props) {
  const [ecran, setEcran] = useState<Ecran>("menu");
  const [date, setDate] = useState("");
  const [meal, setMeal] = useState<MealType>("souper");

  // À chaque ouverture : revenir au menu
  useEffect(() => {
    if (repas !== null) setEcran("menu");
  }, [repas]);

  if (repas === null) {
    return <Modal visible={false} transparent />;
  }

  const jourRepas = fromISODate(repas.date);
  const nom = mealName(repas);
  const indisponible = recipeUnavailable(repas);
  const estRecette = repas.recipe_id !== null && !indisponible;

  // Ouvrir le choix du jour avec une valeur de départ logique
  function choisir(action: Placement) {
    if (action !== 'deplacer' && indisponible) return;
    if (action === "restes") {
      setDate(toISODate(addDays(jourRepas, 1))); // les restes : le lendemain…
      setMeal("diner");                           // …au dîner
    } else if (action === "dupliquer") {
      setDate(toISODate(addDays(jourRepas, 1)));
      setMeal(repas!.meal);
    } else {
      setDate(repas!.date);
      setMeal(repas!.meal);
    }
    setEcran(action);
  }

  // Les 14 jours proposés : à partir du jour du repas
  const jours = Array.from({ length: 14 }, (_, i) => addDays(jourRepas, i));

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.fond}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Fermer" />

        <View style={styles.panneau}>
          <View style={styles.poignee} />
          <Text style={styles.titre} numberOfLines={2}>
            {repas.is_leftover ? "♻ Restes · " : ""}{nom}
          </Text>
          <Text style={styles.sousTitre}>
            {MEAL_LABELS[repas.meal]} · {dayFullName(jourRepas)}
          </Text>
          <View style={styles.separateur} />

          {ecran === "menu" ? (
            <>
              {estRecette && (
                <Ligne icone="search-outline" texte="Voir la recette" onPress={() => onVoirRecette(repas.recipe_id!)} />
              )}

              {/* Portions : − / + directement dans la ligne */}
              <View style={styles.ligne}>
                <Ionicons name="people-outline" size={22} color="#1d2b22" />
                <Text style={styles.ligneTexte}>Portions</Text>
                <Pressable onPress={() => onPortions(Math.max(1, repas.servings - 1))} style={styles.rond} accessibilityLabel="Une portion de moins">
                  <Text style={styles.rondTexte}>−</Text>
                </Pressable>
                <Text style={styles.portionsNb}>{repas.servings}</Text>
                <Pressable onPress={() => onPortions(Math.min(20, repas.servings + 1))} style={styles.rond} accessibilityLabel="Une portion de plus">
                  <Text style={styles.rondTexte}>+</Text>
                </Pressable>
              </View>

              {estRecette && !repas.is_leftover && (
                <Ligne icone="refresh-outline" texte="Prévoir les restes" onPress={() => choisir("restes")} />
              )}
              {!indisponible && <Ligne icone="copy-outline" texte="Dupliquer" onPress={() => choisir("dupliquer")} />}
              <Ligne icone="calendar-outline" texte="Déplacer" onPress={() => choisir("deplacer")} />

              <View style={styles.separateur} />
              <Ligne icone="trash-outline" texte="Retirer du calendrier" couleur={ROUGE} onPress={onRetirer} />
            </>
          ) : (
            <>
              <Text style={styles.label}>{TITRES[ecran]}</Text>

              {/* Les jours, en ligne qui défile */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {jours.map((j) => {
                  const iso = toISODate(j);
                  const actif = iso === date;
                  return (
                    <Pressable key={iso} onPress={() => setDate(iso)} style={[styles.jour, actif && styles.jourActif]}>
                      <Text style={[styles.jourNom, actif && { color: "#fff" }]}>{dayName(j)}</Text>
                      <Text style={[styles.jourDate, actif && { color: "#fff" }]}>{j.getDate()}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {/* Le moment */}
              <View style={styles.choix}>
                {MEALS.map((m) => (
                  <Pressable
                    key={m}
                    onPress={() => setMeal(m)}
                    style={[styles.puce, { backgroundColor: MEAL_COLORS[m].bg }, meal === m && styles.puceActive]}
                  >
                    <Text style={{ color: MEAL_COLORS[m].text }}>{MEAL_LABELS[m]}</Text>
                  </Pressable>
                ))}
              </View>

              <Pressable style={styles.bouton} onPress={() => onPlacer(ecran, date, meal)}>
                <Text style={styles.boutonTexte}>Valider</Text>
              </Pressable>
              <Pressable style={styles.fermer} onPress={() => setEcran("menu")}>
                <Text style={styles.fermerTexte}>Retour</Text>
              </Pressable>
            </>
          )}

          {ecran === "menu" && (
            <Pressable style={styles.fermer} onPress={onClose}>
              <Text style={styles.fermerTexte}>Fermer</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

// Une ligne du menu : icône + texte
function Ligne({ icone, texte, onPress, couleur = "#1d2b22" }: {
  icone: keyof typeof Ionicons.glyphMap; texte: string; onPress: () => void; couleur?: string;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.ligne, pressed && { opacity: 0.5 }]}>
      <Ionicons name={icone} size={22} color={couleur} />
      <Text style={[styles.ligneTexte, { color: couleur }]}>{texte}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fond: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  panneau: { backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32 },
  poignee: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: "#d9e0db", marginBottom: 12 },
  titre: { fontSize: 20, fontWeight: "700", color: "#1d2b22" },
  sousTitre: { color: "#65746a", marginTop: 4 },
  separateur: { height: StyleSheet.hairlineWidth, backgroundColor: "#d9e0db", marginVertical: 12 },
  ligne: { flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 12 },
  ligneTexte: { flex: 1, fontSize: 17, color: "#1d2b22" },
  rond: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: "#d9e0db", alignItems: "center", justifyContent: "center" },
  rondTexte: { fontSize: 20, color: VERT },
  portionsNb: { fontSize: 17, fontWeight: "600", minWidth: 24, textAlign: "center" },
  label: { marginBottom: 10, color: "#65746a", fontSize: 14 },
  jour: { width: 52, paddingVertical: 8, borderRadius: 10, alignItems: "center", backgroundColor: "#f2f5f3" },
  jourActif: { backgroundColor: VERT },
  jourNom: { fontSize: 11, color: "#65746a" },
  jourDate: { fontSize: 17, fontWeight: "600", color: "#1d2b22" },
  choix: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  puce: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 2, borderColor: "transparent" },
  puceActive: { borderColor: VERT },
  bouton: { marginTop: 20, backgroundColor: VERT, borderRadius: 8, paddingVertical: 12, alignItems: "center" },
  boutonTexte: { color: "#fff", fontSize: 16, fontWeight: "600" },
  fermer: { marginTop: 8, paddingVertical: 10, alignItems: "center" },
  fermerTexte: { color: "#65746a", fontSize: 16 },
});
