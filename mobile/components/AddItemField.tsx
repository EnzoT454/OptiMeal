import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { recipeColors as c } from "./recipes";
import { money, storeName } from "./promos";
import { enPromo, prixOffre, suggerer, type Contexte } from "./shoppingList";

// =====================================================================
// Champ « Ajouter à ma liste… » avec suggestions du catalogue.
// Pendant qu'on tape, on voit les produits connus avec leur prix et
// s'ils sont en promo. Sinon : « Ajouter « … » tel quel · sans prix ».
// Utilisé dans l'Épicerie et sur l'Accueil.
// =====================================================================

export default function AddItemField({ contexte, onAjouter, placeholder = "Ajouter à ma liste…" }: {
  contexte: Contexte | null;
  onAjouter: (nom: string, ingredientId: string | null) => void;
  placeholder?: string;
}) {
  const [texte, setTexte] = useState("");
  const propre = texte.trim();
  const suggestions = propre.length >= 2 && contexte ? suggerer(propre, contexte) : [];

  function choisir(nom: string, ingredientId: string | null) {
    setTexte("");
    onAjouter(nom, ingredientId);
  }

  // Touche « Terminé » du clavier : la 1re suggestion s'il y en a, sinon le texte tel quel
  function valider() {
    if (!propre) return;
    const premiere = suggestions[0];
    if (premiere) choisir(premiere.ingredient.name, premiere.ingredient.id);
    else choisir(propre, null);
  }

  return (
    <View style={{ gap: 6 }}>
      <View style={[styles.champ, propre.length > 0 && { borderColor: c.green }]}>
        <MaterialCommunityIcons name="plus" size={20} color={propre ? c.green : c.muted} />
        <TextInput
          value={texte}
          onChangeText={setTexte}
          onSubmitEditing={valider}
          placeholder={placeholder}
          placeholderTextColor={c.muted}
          returnKeyType="done"
          autoCorrect={false}
          style={styles.saisie}
          accessibilityLabel="Ajouter un article à ma liste"
        />
        {propre.length > 0 && (
          <Pressable accessibilityRole="button" accessibilityLabel="Effacer" onPress={() => setTexte("")} hitSlop={10}>
            <MaterialCommunityIcons name="close-circle" size={18} color={c.muted} />
          </Pressable>
        )}
      </View>

      {propre.length >= 2 && (
        <View style={styles.suggestions}>
          {suggestions.map(({ ingredient, meilleure }, i) => {
            const prix = meilleure ? prixOffre(meilleure) : null;
            const promo = meilleure ? enPromo(meilleure) : false;
            // Dans combien de magasins on a un prix pour cet ingrédient
            const nbMagasins = new Set((contexte?.offresParIngredient.get(ingredient.id) ?? [])
              .filter((o) => prixOffre(o) !== null).map((o) => o.retailer)).size;
            return (
              <Pressable
                key={ingredient.id}
                accessibilityRole="button"
                accessibilityLabel={`Ajouter ${ingredient.name}`}
                onPress={() => choisir(ingredient.name, ingredient.id)}
                style={[styles.suggestion, i > 0 && styles.separateur]}
              >
                <MaterialCommunityIcons name="magnify" size={16} color={c.muted} />
                <Text style={styles.nom} numberOfLines={1}>{ingredient.name}</Text>
                {meilleure && prix !== null ? (
                  <View style={styles.prixBloc}>
                    <Text style={[styles.prix, promo && styles.prixPromo]}>
                      {nbMagasins > 1 ? "dès " : ""}{money(prix)}
                    </Text>
                    <Text style={[styles.magasin, promo && styles.magasinPromo]}>
                      {promo ? `Promo · ${storeName(meilleure.retailer)}` : storeName(meilleure.retailer)}
                      {nbMagasins > 1 ? ` · ${nbMagasins} magasins` : ""}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.magasin}>prix inconnu</Text>
                )}
              </Pressable>
            );
          })}

          {/* Toujours possible : l'ajouter tel quel, hors catalogue */}
          <Pressable
            accessibilityRole="button"
            onPress={() => choisir(propre, null)}
            style={[styles.suggestion, suggestions.length > 0 && styles.separateur]}
          >
            <MaterialCommunityIcons name="plus" size={16} color={c.green} />
            <Text style={[styles.nom, { color: c.green }]} numberOfLines={1}>Ajouter « {propre} » tel quel</Text>
            <Text style={styles.magasin}>sans prix</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  champ: {
    flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, minHeight: 46,
    borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: "white",
  },
  saisie: {
    flex: 1, fontFamily: "DMSans_400Regular", fontSize: 15, color: c.ink, paddingVertical: 10,
    // Sur le web, le navigateur ajoute un cadre noir au champ actif : on l'enlève (le cadre vert suffit)
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : {}),
  },
  suggestions: { borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: "white", overflow: "hidden" },
  suggestion: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  separateur: { borderTopWidth: 1, borderTopColor: c.border },
  nom: { flex: 1, fontFamily: "DMSans_500Medium", fontSize: 14, lineHeight: 19, color: c.ink },
  prixBloc: { alignItems: "flex-end" },
  prix: { fontFamily: "DMSans_700Bold", fontSize: 14, lineHeight: 18, color: c.ink },
  prixPromo: { color: "#b45309" },
  magasin: { fontFamily: "DMSans_400Regular", fontSize: 11, lineHeight: 15, color: c.muted },
  magasinPromo: { color: "#b45309" },
});