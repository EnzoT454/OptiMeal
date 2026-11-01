import { useEffect, useState } from "react";
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from "react-native";
import { api } from "../services/api";
import type { MealType, Page, RecipeSummary } from "../types/api";
import { MEALS, MEAL_COLORS, MEAL_LABELS, dayName } from "./planning";

const VERT = "#25603c";

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
    const minuteur = setTimeout(() => {
      setChargement(true);
      setErreurRecettes(null);
      const params = new URLSearchParams({ q: recherche, limit: "10", offset: "0" });
      if (mode === "favoris") params.set("favorites", "true"); // seulement mes coups de cœur
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
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.titre}>
              Ajouter un repas{jour ? ` · ${dayName(jour)} ${jour.getDate()}` : ""}
            </Text>

            {/* ---- Moment ---- */}
            <Text style={styles.label}>Moment</Text>
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

            {/* ---- Recette ou texte libre ---- */}
            <View style={styles.onglets}>
              {(["recette", "favoris", "texte"] as Mode[]).map((m) => (
                <Pressable
                  key={m}
                  onPress={() => { setMode(m); setErreur(null); }}
                  style={[styles.onglet, mode === m && styles.ongletActif]}
                >
                  <Text style={[styles.ongletTexte, mode === m && styles.ongletTexteActif]}>
                    {MODE_LABELS[m]}
                  </Text>
                </Pressable>
              ))}
            </View>

            {mode !== "texte" ? (
              <>
                <TextInput
                  value={recherche}
                  onChangeText={setRecherche}
                  placeholder="Rechercher une recette"
                  style={styles.champ}
                />
                {chargement && <ActivityIndicator color={VERT} style={{ marginTop: 12 }} />}
                {erreurRecettes !== null && <Text style={styles.erreur}>{erreurRecettes}</Text>}
                {!chargement && erreurRecettes === null && recettes.length === 0 && (
                  <Text style={styles.vide}>
                    {mode === "favoris"
                      ? "Aucun favori. Touche le cœur d'une recette dans l'onglet Recettes."
                      : "Aucune recette trouvée. Ajoute-en dans l'onglet Recettes, ou écris une note."}
                  </Text>
                )}
                {!chargement && recettes.map((r) => (
                  <Pressable
                    key={String(r.id)}
                    onPress={() => choisirRecette(r)}
                    style={[styles.recette, recette?.id === r.id && styles.recetteActive]}
                  >
                    <Text style={styles.recetteNom} numberOfLines={1}>{r.name}</Text>
                    <Text style={styles.recetteInfo}>{r.total_time_minutes} min · {r.servings} portions</Text>
                  </Pressable>
                ))}
              </>
            ) : (
              <TextInput
                value={texte}
                onChangeText={(t) => { setTexte(t); setErreur(null); }}
                placeholder="Resto, pizza commandée…"
                style={styles.champ}
                returnKeyType="done"
                onSubmitEditing={valider}
              />
            )}
            {erreur !== null && <Text style={styles.erreur}>{erreur}</Text>}

            {/* ---- Portions ---- */}
            <Text style={styles.label}>Portions</Text>
            <View style={styles.portions}>
              <Pressable onPress={() => setPortions(Math.max(1, portions - 1))} style={styles.rond} accessibilityLabel="Une portion de moins">
                <Text style={styles.rondTexte}>−</Text>
              </Pressable>
              <Text style={styles.portionsNb}>{portions}</Text>
              <Pressable onPress={() => setPortions(Math.min(20, portions + 1))} style={styles.rond} accessibilityLabel="Une portion de plus">
                <Text style={styles.rondTexte}>+</Text>
              </Pressable>
            </View>

            <Pressable style={styles.bouton} onPress={valider}>
              <Text style={styles.boutonTexte}>Ajouter</Text>
            </Pressable>
            <Pressable style={styles.annuler} onPress={onClose}>
              <Text style={styles.annulerTexte}>Annuler</Text>
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fond: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  panneau: { maxHeight: "90%", backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32 },
  poignee: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: "#d9e0db", marginBottom: 12 },
  titre: { fontSize: 20, fontWeight: "700", color: "#1d2b22" },
  label: { marginTop: 16, marginBottom: 6, color: "#65746a", fontSize: 13 },
  choix: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  puce: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 2, borderColor: "transparent" },
  puceActive: { borderColor: VERT },
  onglets: { flexDirection: "row", marginTop: 16, marginBottom: 10, borderWidth: 1, borderColor: "#d9e0db", borderRadius: 8, overflow: "hidden" },
  onglet: { flex: 1, paddingVertical: 8, alignItems: "center" },
  ongletActif: { backgroundColor: "#EAF3DE" },
  ongletTexte: { color: "#65746a" },
  ongletTexteActif: { color: VERT, fontWeight: "600" },
  champ: { borderWidth: 1, borderColor: "#d9e0db", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  vide: { color: "#65746a", marginTop: 12 },
  recette: { marginTop: 8, padding: 10, borderRadius: 8, borderWidth: 2, borderColor: "#eef1ef" },
  recetteActive: { borderColor: VERT, backgroundColor: "#EAF3DE" },
  recetteNom: { fontSize: 15, fontWeight: "600", color: "#1d2b22" },
  recetteInfo: { fontSize: 12, color: "#65746a", marginTop: 2 },
  erreur: { color: "#b3261e", marginTop: 6, fontSize: 13 },
  portions: { flexDirection: "row", alignItems: "center", gap: 16 },
  rond: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: "#d9e0db", alignItems: "center", justifyContent: "center" },
  rondTexte: { fontSize: 20, color: VERT },
  portionsNb: { fontSize: 18, fontWeight: "600", minWidth: 24, textAlign: "center" },
  bouton: { marginTop: 24, backgroundColor: VERT, borderRadius: 8, paddingVertical: 12, alignItems: "center" },
  boutonTexte: { color: "#fff", fontSize: 16, fontWeight: "600" },
  annuler: { marginTop: 8, paddingVertical: 10, alignItems: "center" },
  annulerTexte: { color: "#65746a" },
});