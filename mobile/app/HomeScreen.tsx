import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useAuth } from "../context/AuthContext";
import { RecipeScreen, recipeColors as c, recipeStyles } from "../components/recipes";
import { money, storeName } from "../components/promos";
import { MEALS, MEAL_COLORS, MEAL_LABELS, dayFullName, getPlan, mealName, mondayOf, toISODate } from "../components/planning";
import { useListeAchats } from "../components/useShoppingList";
import AddItemField from "../components/AddItemField";
import { enPromo, prixOffre } from "../components/shoppingList";
import type { MealPlanEntry } from "../types/api";

// =====================================================================
// Accueil : 3 cartes, une seule action par carte
//   1. Aujourd'hui           → Calendrier (Repas)
//   2. Ton épicerie          → Calendrier (Épicerie) + ajout rapide
//   3. En promo dans ta liste → Calendrier (Épicerie)
// =====================================================================

function salutation(d: Date) {
  const h = d.getHours();
  if (h < 12) return "Bonjour";
  if (h < 18) return "Bon après-midi";
  return "Bonsoir";
}

export default function HomeScreen() {
  const { session } = useAuth();
  const maintenant = new Date();

  return (
    <RecipeScreen>
      <View>
        <Text style={styles.date}>{dayFullName(maintenant)}</Text>
        <Text accessibilityRole="header" style={styles.salut}>{salutation(maintenant)}</Text>
      </View>

      {session ? (
        <TableauDeBord />
      ) : (
        <View style={styles.carte}>
          <Text style={styles.titreCarte}>Bienvenue dans OptiMeal</Text>
          <Text style={recipeStyles.body}>
            Découvre les recettes, les promotions et les circulaires. Connecte-toi pour planifier tes repas
            et retrouver ta liste d'épicerie ici.
          </Text>
        </View>
      )}
    </RecipeScreen>
  );
}

function TableauDeBord() {
  const navigation = useNavigation<any>();
  const liste = useListeAchats();
  const [repasSemaine, setRepasSemaine] = useState<MealPlanEntry[]>([]);
  const [chargementRepas, setChargementRepas] = useState(true);
  const [erreurRepas, setErreurRepas] = useState(false);

  // Recharger chaque fois qu'on revient sur l'Accueil
  useFocusEffect(useCallback(() => {
    let annule = false;
    setErreurRepas(false);
    getPlan(toISODate(mondayOf(new Date())))
      .then((plan) => { if (!annule) setRepasSemaine(plan.entries); })
      .catch(() => { if (!annule) setErreurRepas(true); })
      .finally(() => { if (!annule) setChargementRepas(false); });
    liste.recharger();
    return () => { annule = true; };
  }, [liste.recharger]));

  const ouvrirRepas = () => navigation.navigate("Calendrier", { vue: "repas" });
  const ouvrirEpicerie = () => navigation.navigate("Calendrier", { vue: "epicerie" });

  const aujourdhui = toISODate(new Date());
  const repasDuJour = repasSemaine
    .filter((e) => e.date === aujourdhui)
    .sort((a, b) => MEALS.indexOf(a.meal) - MEALS.indexOf(b.meal));

  const { aAcheter, totaux, magasin, nbAAcheter, chargement: chargementListe } = liste;
  const lignesEnPromo = aAcheter
    .map((ligne) => ({ ligne, offre: liste.offreDe(ligne) }))
    .filter(({ offre }) => offre && enPromo(offre))
    .slice(0, 3);

  return (
    <>
      {/* ---- 1. Aujourd'hui : toute la carte ouvre le Calendrier ---- */}
      <Pressable accessibilityRole="button" accessibilityLabel="Aujourd'hui, ouvrir le calendrier"
        onPress={ouvrirRepas} style={({ pressed }) => [styles.carte, pressed && styles.appuye]}>
        <EnTete titre="Aujourd'hui" />
        {chargementRepas && <ActivityIndicator color={c.green} />}
        {!chargementRepas && erreurRepas && (
          <Text style={recipeStyles.body}>Impossible de charger tes repas. Vérifie ta connexion.</Text>
        )}
        {!chargementRepas && !erreurRepas && repasDuJour.length === 0 && (
          <View style={styles.vide}>
            <MaterialCommunityIcons name="silverware-fork-knife" size={20} color={c.green} />
            <Text style={[recipeStyles.body, { flex: 1 }]}>Rien de prévu aujourd'hui.</Text>
            <Text style={styles.lien}>Planifier un repas</Text>
          </View>
        )}
        {!chargementRepas && !erreurRepas && repasDuJour.map((e) => (
          <View key={e.id} style={styles.repas}>
            <View style={[styles.pastille, { backgroundColor: MEAL_COLORS[e.meal].dot }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.repasNom} numberOfLines={1}>{mealName(e)}</Text>
              <Text style={[styles.repasMoment, { color: MEAL_COLORS[e.meal].text }]}>
                {e.is_leftover ? "Restes · " : ""}{MEAL_LABELS[e.meal]} · {e.servings} p.
              </Text>
            </View>
          </View>
        ))}
      </Pressable>

      {/* ---- 2. Ton épicerie ---- */}
      <View style={styles.carte}>
        <Pressable accessibilityRole="button" accessibilityLabel="Ton épicerie, ouvrir la liste" onPress={ouvrirEpicerie}>
          <EnTete titre="Ton épicerie" />
        </Pressable>

        {chargementListe && liste.lignes.length === 0 && <ActivityIndicator color={c.green} />}
        {!chargementListe && liste.erreur && <Text style={recipeStyles.body}>{liste.erreur}</Text>}

        {!liste.erreur && (!chargementListe || liste.lignes.length > 0) && (
          <Pressable accessibilityRole="button" onPress={ouvrirEpicerie} style={styles.tuiles}>
            <Tuile valeur={String(nbAAcheter)} label="à acheter" />
            <Tuile valeur={aAcheter.length > 0 ? `≈ ${money(totaux.total)}` : "–"} label={`chez ${storeName(magasin)}`} />
            <Tuile valeur={String(totaux.nbPromo)} label="en promo" promo />
          </Pressable>
        )}

        <AddItemField contexte={liste.contexte} onAjouter={liste.ajouter} />
      </View>

      {/* ---- 3. En promo dans ta liste (seulement s'il y en a) ---- */}
      {lignesEnPromo.length > 0 && (
        <Pressable accessibilityRole="button" accessibilityLabel="En promo dans ta liste, ouvrir la liste"
          onPress={ouvrirEpicerie} style={({ pressed }) => [styles.carte, pressed && styles.appuye]}>
          <EnTete titre="En promo dans ta liste" />
          {lignesEnPromo.map(({ ligne, offre }) => (
            <View key={ligne.ingredient_id} style={styles.promoLigne}>
              <Text style={styles.promoNom} numberOfLines={1}>{ligne.nom}</Text>
              <Text style={styles.promoPrix}>{money(prixOffre(offre!))}</Text>
              <View style={styles.etiquette}>
                <Text style={styles.etiquetteTexte}>{storeName(offre!.retailer)}</Text>
              </View>
            </View>
          ))}
        </Pressable>
      )}
    </>
  );
}

function EnTete({ titre }: { titre: string }) {
  return (
    <View style={styles.enTete}>
      <Text style={styles.titreCarte}>{titre}</Text>
      <MaterialCommunityIcons name="chevron-right" size={22} color={c.muted} />
    </View>
  );
}

function Tuile({ valeur, label, promo = false }: { valeur: string; label: string; promo?: boolean }) {
  return (
    <View style={[styles.tuile, promo && styles.tuilePromo]}>
      <Text style={[styles.tuileValeur, promo && styles.textePromo]} numberOfLines={1} adjustsFontSizeToFit>{valeur}</Text>
      <Text style={[styles.tuileLabel, promo && styles.textePromo]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  date: { fontFamily: "DMSans_500Medium", fontSize: 14, lineHeight: 19, color: c.muted },
  salut: { fontFamily: "DMSans_700Bold", fontSize: 28, lineHeight: 36, color: c.ink },

  carte: { backgroundColor: "white", borderRadius: 16, padding: 16, gap: 12, borderWidth: 1, borderColor: c.border },
  appuye: { opacity: 0.7 },
  enTete: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  titreCarte: { fontFamily: "DMSans_700Bold", fontSize: 17, lineHeight: 23, color: c.ink },
  lien: { fontFamily: "DMSans_700Bold", fontSize: 14, lineHeight: 19, color: c.green },

  vide: { flexDirection: "row", alignItems: "center", gap: 10 },
  repas: { flexDirection: "row", alignItems: "center", gap: 10 },
  pastille: { width: 4, alignSelf: "stretch", borderRadius: 2 },
  repasNom: { fontFamily: "DMSans_700Bold", fontSize: 15, lineHeight: 20, color: c.ink },
  repasMoment: { fontFamily: "DMSans_500Medium", fontSize: 12, lineHeight: 16 },

  tuiles: { flexDirection: "row", gap: 8 },
  tuile: { flex: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 8, backgroundColor: c.background },
  tuilePromo: { backgroundColor: "#fff1d6" },
  tuileValeur: { fontFamily: "DMSans_700Bold", fontSize: 20, lineHeight: 26, color: c.ink },
  tuileLabel: { fontFamily: "DMSans_500Medium", fontSize: 12, lineHeight: 16, color: c.muted },
  textePromo: { color: "#7a4106" },

  promoLigne: { flexDirection: "row", alignItems: "center", gap: 10 },
  promoNom: { flex: 1, fontFamily: "DMSans_500Medium", fontSize: 15, lineHeight: 20, color: c.ink },
  promoPrix: { fontFamily: "DMSans_700Bold", fontSize: 15, lineHeight: 20, color: "#b45309" },
  etiquette: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: "#fff1d6" },
  etiquetteTexte: { fontFamily: "DMSans_500Medium", fontSize: 11, lineHeight: 15, color: "#7a4106" },
});