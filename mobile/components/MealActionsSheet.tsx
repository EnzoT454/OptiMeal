import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { MealPlanEntry, MealType } from "../types/api";
import {
  MEALS, MEAL_LABELS, addDays, dayFullName, dayName, fromISODate, mealName, recipeUnavailable, toISODate,
} from "./planning";
import { RecipeButton, RecipeChip, recipeColors, recipeStyles } from "./recipes";

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
    if (action !== "deplacer" && indisponible) return;
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
                <Ionicons name="people-outline" size={22} color={recipeColors.green} />
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
              <View style={[recipeStyles.chips, { marginTop: 14 }]}>
                {MEALS.map((m) => (
                  <RecipeChip key={m} label={MEAL_LABELS[m]} selected={meal === m} onPress={() => setMeal(m)} />
                ))}
              </View>

              <View style={{ gap: 8, marginTop: 20 }}>
                <RecipeButton title="Valider" onPress={() => onPlacer(ecran, date, meal)} />
                <RecipeButton title="Retour" variant="neutral" onPress={() => setEcran("menu")} />
              </View>
            </>
          )}

          {ecran === "menu" && (
            <RecipeButton title="Fermer" variant="neutral" onPress={onClose} style={{ marginTop: 8 }} />
          )}
        </View>
      </View>
    </Modal>
  );
}

// Une ligne du menu : icône + texte
function Ligne({ icone, texte, onPress, couleur }: {
  icone: keyof typeof Ionicons.glyphMap; texte: string; onPress: () => void; couleur?: string;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.ligne, pressed && { opacity: 0.5 }]}>
      <Ionicons name={icone} size={22} color={couleur ?? recipeColors.green} />
      <Text style={[styles.ligneTexte, couleur ? { color: couleur } : null]}>{texte}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fond: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  panneau: { backgroundColor: recipeColors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32 },
  poignee: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: recipeColors.border, marginBottom: 14 },
  titre: { fontFamily: "DMSans_700Bold", fontSize: 22, lineHeight: 29, color: recipeColors.ink },
  sousTitre: { fontFamily: "DMSans_400Regular", fontSize: 14, lineHeight: 19, color: recipeColors.muted, marginTop: 2 },
  separateur: { height: 1, backgroundColor: recipeColors.border, marginVertical: 12 },
  ligne: { flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 12 },
  ligneTexte: { flex: 1, fontFamily: "DMSans_500Medium", fontSize: 16, lineHeight: 22, color: recipeColors.ink },
  rond: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: recipeColors.border, backgroundColor: "white", alignItems: "center", justifyContent: "center" },
  rondTexte: { fontFamily: "DMSans_700Bold", fontSize: 20, lineHeight: 24, color: recipeColors.green },
  portionsNb: { fontFamily: "DMSans_700Bold", fontSize: 16, lineHeight: 22, minWidth: 26, textAlign: "center", color: recipeColors.ink },
  label: { fontFamily: "DMSans_700Bold", fontSize: 13, lineHeight: 18, color: recipeColors.ink, marginBottom: 10 },
  jour: { width: 54, paddingVertical: 8, borderRadius: 12, alignItems: "center", backgroundColor: "white", borderWidth: 1, borderColor: recipeColors.border },
  jourActif: { backgroundColor: recipeColors.green, borderColor: recipeColors.green },
  jourNom: { fontFamily: "DMSans_500Medium", fontSize: 11, lineHeight: 15, color: recipeColors.muted },
  jourDate: { fontFamily: "DMSans_700Bold", fontSize: 17, lineHeight: 22, color: recipeColors.ink },
});