import { Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { MealType } from "../types/api";
import { MEALS, MEAL_COLORS, MEAL_LABELS, addDays, mondayOf, toISODate } from "./planning";
import { recipeColors } from "./recipes";

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet",
  "août", "septembre", "octobre", "novembre", "décembre"];
const LETTRES = ["L", "M", "M", "J", "V", "S", "D"]; // la semaine commence le lundi

// Les semaines (lundi → dimanche) qui couvrent un mois : 4 à 6 lignes de 7 jours
export function semainesDuMois(mois: Date): Date[][] {
  const premier = new Date(mois.getFullYear(), mois.getMonth(), 1);
  const dernier = new Date(mois.getFullYear(), mois.getMonth() + 1, 0);
  const semaines: Date[][] = [];
  for (let lundi = mondayOf(premier); lundi <= dernier; lundi = addDays(lundi, 7)) {
    semaines.push(Array.from({ length: 7 }, (_, i) => addDays(lundi, i)));
  }
  return semaines;
}

type Props = {
  mois: Date;                              // n'importe quel jour du mois affiché
  choisi: string;                          // le lundi de la semaine affichée ("2026-11-02")
  points: Record<string, MealType[]>;      // "2026-11-03" → ["dejeuner", "souper"]
  ouvert: boolean;                         // grille visible ou repliée
  onBasculer: () => void;
  onMois: (decalage: number) => void;      // -1 = mois précédent, +1 = suivant
  onJour: (jour: Date) => void;
  estAujourdhui: boolean;                  // la semaine affichée est celle d'aujourd'hui ?
  onAujourdhui: () => void;
};

export default function MonthGrid({ mois, choisi, points, ouvert, onBasculer, onMois, onJour, estAujourdhui: surAujourdhui, onAujourdhui }: Props) {
  const aujourdhui = toISODate(new Date());

  return (
    <View style={styles.carte}>
      {/* ---- ‹ Novembre 2026 ⌄ › ---- */}
      <View style={styles.entete}>
        <Pressable onPress={() => onMois(-1)} hitSlop={12} style={styles.fleche} accessibilityLabel="Mois précédent">
          <Ionicons name="chevron-back" size={18} color={recipeColors.green} />
        </Pressable>
        <Pressable onPress={onBasculer} style={styles.titreZone} accessibilityLabel={ouvert ? "Replier le mois" : "Afficher le mois"}>
          <Text style={styles.titre} maxFontSizeMultiplier={1.2}>{MOIS[mois.getMonth()]} {mois.getFullYear()}</Text>
          <Ionicons name={ouvert ? "chevron-up" : "chevron-down"} size={16} color={recipeColors.ink} />
        </Pressable>
        <Pressable onPress={() => onMois(1)} hitSlop={12} style={styles.fleche} accessibilityLabel="Mois suivant">
          <Ionicons name="chevron-forward" size={18} color={recipeColors.green} />
        </Pressable>
        {/* Bouton « aujourd'hui » : toujours au même endroit, vert plein quand on est déjà sur aujourd'hui */}
        <Pressable onPress={onAujourdhui} hitSlop={8} accessibilityLabel="Revenir à aujourd'hui"
          style={[styles.fleche, surAujourdhui && { backgroundColor: recipeColors.green }]}>
          <Ionicons name="today-outline" size={17} color={surAujourdhui ? "white" : recipeColors.green} />
        </Pressable>
      </View>

      {ouvert && (
        <>
          <View style={styles.ligne}>
            {LETTRES.map((l, i) => <Text key={i} style={styles.lettre} maxFontSizeMultiplier={1.2}>{l}</Text>)}
          </View>

          {semainesDuMois(mois).map((semaine) => (
            // La semaine affichée en dessous est surlignée
            <View key={toISODate(semaine[0])} style={[styles.ligne, toISODate(semaine[0]) === choisi && styles.ligneChoisie]}>
              {semaine.map((jour) => {
                const iso = toISODate(jour);
                const horsMois = jour.getMonth() !== mois.getMonth();
                const estAujourdhui = iso === aujourdhui;
                // Un point par moment planifié ce jour-là, dans l'ordre de la journée
                const repas = MEALS.filter((m) => points[iso]?.includes(m));
                return (
                  <Pressable key={iso} onPress={() => onJour(jour)} style={styles.case} accessibilityLabel={`Aller au ${jour.getDate()}`}>
                    <View style={[styles.rond, estAujourdhui && styles.rondAujourdhui]}>
                      <Text style={[styles.chiffre, horsMois && styles.horsMois, estAujourdhui && { color: "white" }]} maxFontSizeMultiplier={1.2}>
                        {jour.getDate()}
                      </Text>
                    </View>
                    <View style={styles.points}>
                      {repas.map((m) => <View key={m} style={[styles.point, { backgroundColor: MEAL_COLORS[m].dot }]} />)}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}

          {/* Légende, seulement quand la grille est ouverte */}
          <View style={styles.legende}>
            {MEALS.map((m) => (
              <View key={m} style={styles.legendeItem}>
                <View style={[styles.point, { backgroundColor: MEAL_COLORS[m].dot }]} />
                <Text style={styles.legendeTexte} maxFontSizeMultiplier={1.2}>{MEAL_LABELS[m]}</Text>
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  carte: { backgroundColor: "white", borderRadius: 16, padding: 10, gap: 2 },
  entete: { flexDirection: "row", alignItems: "center", gap: 8 },
  fleche: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: recipeColors.light },
  titreZone: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 4 },
  titre: { fontFamily: "DMSans_700Bold", fontSize: 16, lineHeight: 21, color: recipeColors.ink, textTransform: "capitalize" },
  ligne: { flexDirection: "row" },
  lettre: { flex: 1, textAlign: "center", fontFamily: "DMSans_500Medium", fontSize: 12, lineHeight: 16, color: recipeColors.muted, marginTop: 8 },
  case: { flex: 1, alignItems: "center", paddingVertical: 2 },
  rond: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  ligneChoisie: { backgroundColor: recipeColors.light, borderRadius: 10 },
  rondAujourdhui: { backgroundColor: recipeColors.green },
  chiffre: { fontFamily: "DMSans_500Medium", fontSize: 13, lineHeight: 17, color: recipeColors.ink },
  horsMois: { color: recipeColors.border },
  points: { flexDirection: "row", gap: 3, height: 7, marginTop: 2 },
  point: { width: 7, height: 7, borderRadius: 3.5 },
  legende: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 12, marginTop: 8 },
  legendeItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendeTexte: { fontFamily: "DMSans_500Medium", fontSize: 12, lineHeight: 16, color: recipeColors.muted },
});