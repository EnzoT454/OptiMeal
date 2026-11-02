import { useEffect, useState } from "react";
import {
  ActivityIndicator, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView,
  StyleSheet, Text, View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { api } from "../services/api";
import type { MealType, Page, RecipeSummary } from "../types/api";
import { MEALS, MEAL_LABELS, dayFullName } from "./planning";
import { RecipeButton, RecipeChip, RecipeField, recipeColors, recipeStyles } from "./recipes";

type Mode = "recette" | "favoris" | "texte";

const MODE_LABELS: Record<Mode, string> = { recette: "Recettes", favoris: "Favoris", texte: "Note" };

type Props = {
  jour: Date | null;   // null = panneau fermé
  onClose: () => void;
  onAdd: (meal: MealType, recette: RecipeSummary | null, texte: string, portions: number) => void;
};

export default function AddMealSheet({ jour, onClose, onAdd }: Props) {
  const [meal, setMeal] = useState<MealType>("souper");
  const [mode, setMode] = useState<Mode>("recette");
  const [texte, setTexte] = useState("");
  const [recherche, setRecherche] = useState("");
  const [recettes, setRecettes] = useState<RecipeSummary[]>([]);
  const [recette, setRecette] = useState<RecipeSummary | null>(null);
  const [chargement, setChargement] = useState(false);
  const [erreurRecettes, setErreurRecettes] = useState<string | null>(null);
  const [portions, setPortions] = useState(2);
  const [erreur, setErreur] = useState<string | null>(null);

  // Remettre le formulaire à zéro à chaque ouverture
  useEffect(() => {
    if (jour !== null) {
      setMeal("souper");
      setMode("recette");
      setTexte("");
      setRecherche("");
      setRecette(null);
      setPortions(2);
      setErreur(null);
    }
  }, [jour]);

  // Chercher les recettes (même API que l'onglet Recettes).
  // On attend 300 ms après la dernière lettre pour ne pas appeler l'API à chaque touche.
  useEffect(() => {
    if (jour === null || mode === "texte") return;
    let actif = true;
    setRecettes([]); setRecette(null); setChargement(true); setErreurRecettes(null);
    const minuteur = setTimeout(() => {
      setChargement(true);
      setErreurRecettes(null);
      const params = new URLSearchParams({ scope: mode === "favoris" ? "favorites" : "accessible", q: recherche, limit: "10", offset: "0" });
      api<Page<RecipeSummary>>("/api/v1/recipes?" + params)
        .then((res) => { if (actif) setRecettes(res.items); })
        .catch((e) => { if (actif) setErreurRecettes(e?.message ?? "Impossible de charger les recettes."); })
        .finally(() => { if (actif) setChargement(false); });
    }, 300);
    return () => { actif = false; clearTimeout(minuteur); };
  }, [jour, mode, recherche]);

  function choisirRecette(r: RecipeSummary) {
    setRecette(r);
    setPortions(r.servings || 2);
    setErreur(null);
  }

  function valider() {
    if (mode !== "texte") {
      if (recette === null) { setErreur("Choisis une recette."); return; }
      onAdd(meal, recette, "", portions);
    } else {
      const propre = texte.trim();
      if (propre === "") { setErreur("Écris le nom du repas."); return; }
      onAdd(meal, null, propre, portions);
    }
  }

  return (
    <Modal visible={jour !== null} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.fond} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Fermer" />

        <View style={styles.panneau}>
          <View style={styles.poignee} />
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 18 }}>
            <View style={{ gap: 2 }}>
              <Text style={styles.titre}>Ajouter un repas</Text>
              {jour && <Text style={recipeStyles.body}>{dayFullName(jour)}</Text>}
            </View>

            {/* ---- Moment ---- */}
            <View>
              <Text style={recipeStyles.label}>Moment</Text>
              <View style={recipeStyles.chips}>
                {MEALS.map((m) => (
                  <RecipeChip key={m} label={MEAL_LABELS[m]} selected={meal === m} onPress={() => setMeal(m)} />
                ))}
              </View>
            </View>

            {/* ---- Recettes, favoris ou note ---- */}
            <View>
              <Text style={recipeStyles.label}>Quoi ?</Text>
              <View style={recipeStyles.chips}>
                {(["recette", "favoris", "texte"] as Mode[]).map((m) => (
                  <RecipeChip key={m} label={MODE_LABELS[m]} selected={mode === m}
                    onPress={() => { setMode(m); setErreur(null); }} />
                ))}
              </View>
            </View>

            {mode !== "texte" ? (
              <View style={{ gap: 8 }}>
                <RecipeField
                  label="Rechercher une recette"
                  placeholder="Poulet, pâtes, soupe…"
                  value={recherche}
                  onChangeText={setRecherche}
                />
                {chargement && <ActivityIndicator color={recipeColors.green} style={{ marginTop: 8 }} />}
                {erreurRecettes !== null && <Text style={styles.erreur}>{erreurRecettes}</Text>}
                {!chargement && erreurRecettes === null && recettes.length === 0 && (
                  <Text style={recipeStyles.body}>
                    {mode === "favoris"
                      ? "Aucun favori. Touche le cœur d'une recette dans l'onglet Recettes."
                      : "Aucune recette trouvée. Ajoute-en dans l'onglet Recettes, ou écris une note."}
                  </Text>
                )}
                {!chargement && recettes.map((r) => {
                  const choisie = recette?.id === r.id;
                  // La photo de la recette (même champ image_url que dans l'onglet Recettes)
                  const photo = (r as RecipeSummary & { image_url?: string | null }).image_url;
                  return (
                    <Pressable
                      key={String(r.id)}
                      onPress={() => choisirRecette(r)}
                      style={[styles.recette, choisie && styles.recetteActive]}
                    >
                      {photo ? (
                        <Image source={{ uri: photo }} style={styles.photo} />
                      ) : (
                        <View style={[styles.photo, styles.photoVide]}>
                          <Ionicons name="restaurant-outline" size={18} color={recipeColors.green} />
                        </View>
                      )}
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={styles.recetteNom} numberOfLines={1}>{r.name}</Text>
                        <Text style={recipeStyles.note}>{r.total_time_minutes} min · {r.servings} portions</Text>
                      </View>
                      {choisie && <Ionicons name="checkmark-circle" size={22} color={recipeColors.green} />}
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <RecipeField
                label="Note"
                placeholder="Resto, pizza commandée…"
                value={texte}
                onChangeText={(t: string) => { setTexte(t); setErreur(null); }}
                returnKeyType="done"
                onSubmitEditing={valider}
              />
            )}
            {erreur !== null && <Text style={styles.erreur}>{erreur}</Text>}

            {/* ---- Portions ---- */}
            <View style={recipeStyles.row}>
              <Text style={[recipeStyles.label, { flex: 1, marginBottom: 0 }]}>Portions</Text>
              <Pressable onPress={() => setPortions(Math.max(1, portions - 1))} style={styles.rond} accessibilityLabel="Une portion de moins">
                <Text style={styles.rondTexte}>−</Text>
              </Pressable>
              <Text style={styles.portionsNb}>{portions}</Text>
              <Pressable onPress={() => setPortions(Math.min(20, portions + 1))} style={styles.rond} accessibilityLabel="Une portion de plus">
                <Text style={styles.rondTexte}>+</Text>
              </Pressable>
            </View>

            <View style={{ gap: 8 }}>
              <RecipeButton title="Ajouter" onPress={valider} />
              <RecipeButton title="Annuler" variant="neutral" onPress={onClose} />
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fond: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  panneau: { maxHeight: "90%", backgroundColor: recipeColors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32 },
  poignee: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: recipeColors.border, marginBottom: 14 },
  titre: { fontFamily: "DMSans_700Bold", fontSize: 22, lineHeight: 29, color: recipeColors.ink },
  recette: { flexDirection: "row", alignItems: "center", gap: 12, padding: 8, borderRadius: 12, backgroundColor: "white", borderWidth: 2, borderColor: "white" },
  photo: { width: 52, height: 52, borderRadius: 10 },
  photoVide: { alignItems: "center", justifyContent: "center", backgroundColor: recipeColors.light },
  recetteActive: { borderColor: recipeColors.green, backgroundColor: recipeColors.light },
  recetteNom: { fontFamily: "DMSans_700Bold", fontSize: 15, lineHeight: 20, color: recipeColors.ink },
  erreur: { fontFamily: "DMSans_500Medium", fontSize: 13, lineHeight: 18, color: "#b3261e" },
  rond: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: recipeColors.border, backgroundColor: "white", alignItems: "center", justifyContent: "center" },
  rondTexte: { fontFamily: "DMSans_700Bold", fontSize: 20, lineHeight: 24, color: recipeColors.green },
  portionsNb: { fontFamily: "DMSans_700Bold", fontSize: 17, lineHeight: 22, minWidth: 28, textAlign: "center", color: recipeColors.ink },
});