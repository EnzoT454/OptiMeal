import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { SafeAreaView } from "react-native-safe-area-context";
import { recipeColors as c } from "./recipes";
import { money, storeName } from "./promos";
import { enPromo, offreChoisie, prixOffre, texteProduit, type LigneListe } from "./shoppingList";
import type { ListeAchats } from "./useShoppingList";

// =====================================================================
// Fiche d'un article (s'ouvre par le bas quand on touche son nom) :
//   prix dans les 3 magasins + « J'en ai déjà » / « J'en ai toujours »
//   (+ « Retirer de ma liste » pour un article ajouté à la main)
// =====================================================================

export default function ArticleSheet({ ligne, liste, quantite, onClose }: {
  ligne: LigneListe | null;   // null = fermée
  liste: ListeAchats;
  quantite: string;           // « 200 g » (déjà mis en texte par l'écran)
  onClose: () => void;
}) {
  if (!ligne) return null;

  const dejaLa = liste.dejaLa.has(ligne.ingredient_id);
  const toujours = ligne.catalogue_id !== null && liste.toujours.has(ligne.catalogue_id);
  const sousTitre = ligne.manuel ? "Ajouté par toi" : ligne.pour.join(", ");
  // Tous les produits avec un prix, ton magasin d'abord, puis du moins cher au plus cher
  const produits = ligne.offres
    .filter((o) => prixOffre(o) !== null)
    .sort((a, b) => Number(b.retailer === liste.magasin) - Number(a.retailer === liste.magasin) || prixOffre(a)! - prixOffre(b)!);
  const retenue = liste.offreDe(ligne);

  // Chaque action ferme la fiche : l'article change de section dans la liste
  const agir = (action: () => void) => () => { action(); onClose(); };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.fond} onPress={onClose} accessibilityLabel="Fermer la fiche" />
      <SafeAreaView edges={["bottom"]} style={styles.feuille}>
        <View style={styles.poignee} />

        <View style={styles.entete}>
          <View style={{ flex: 1 }}>
            <Text style={styles.titre}>{ligne.nom}{quantite ? ` · ${quantite}` : ""}</Text>
            {sousTitre.length > 0 && <Text style={styles.sousTitre}>{sousTitre}</Text>}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Fermer" onPress={onClose} hitSlop={12}>
            <MaterialCommunityIcons name="close" size={22} color={c.muted} />
          </Pressable>
        </View>

        {/* ---- Tous les produits des 3 magasins : toucher pour choisir ---- */}
        {produits.length > 0 ? (
          <View>
            <Text style={styles.section}>OÙ LE PRENDRE</Text>
            <View style={styles.prixListe}>
              {produits.map((o, i) => {
                const prix = prixOffre(o)!;
                const promo = enPromo(o);
                const choisi = o.id === retenue?.id;
                return (
                  <Pressable key={o.id} accessibilityRole="radio" accessibilityState={{ selected: choisi }}
                    onPress={() => {
                      // Le produit par défaut du magasin : pas besoin de le retenir à part
                      const parDefaut = offreChoisie(ligne, liste.magasin);
                      liste.choisirProduit(ligne.ingredient_id, o.id === parDefaut?.id ? null : o.id);
                    }}
                    style={[styles.prixLigne, i > 0 && styles.separateur, choisi && { backgroundColor: c.light }]}>
                    <MaterialCommunityIcons name={choisi ? "radiobox-marked" : "radiobox-blank"} size={20}
                      color={choisi ? c.green : c.muted} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.magasin, choisi && { fontFamily: "DMSans_700Bold" }]}>
                        {storeName(o.retailer)}{o.retailer === liste.magasin ? " · ton magasin" : ""}
                      </Text>
                      <Text style={styles.produit} numberOfLines={1}>{texteProduit(o)}</Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={[styles.prix, promo && styles.promo]}>{money(prix)}</Text>
                      {promo && <Text style={[styles.produit, styles.promo]}>en promo</Text>}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : (
          <Text style={styles.sousTitre}>Pas dans notre catalogue : prix inconnu.</Text>
        )}

        {/* ---- Actions ---- */}
        <View style={styles.actions}>
          <Action
            icone="check-circle-outline"
            titre={dejaLa ? "Remettre dans ma liste" : "J'en ai déjà"}
            detail={dejaLa ? "Je dois l'acheter finalement" : "Pas besoin de l'acheter cette semaine"}
            onPress={agir(() => liste.basculerDejaLa(ligne.ingredient_id))}
          />
          {ligne.catalogue_id && (
            <Action
              icone="home-outline"
              titre={toujours ? "Je n'en ai plus toujours" : "J'en ai toujours"}
              detail={toujours ? "Le remettre dans mes listes" : "Ne plus le mettre dans mes listes (sel, huile…)"}
              onPress={agir(() => liste.basculerToujours(ligne.catalogue_id!))}
            />
          )}
          {ligne.manuel && (
            <Action
              icone="trash-can-outline"
              titre="Retirer de ma liste"
              detail="Supprimer cet article ajouté à la main"
              onPress={agir(() => liste.supprimer(ligne))}
              danger
            />
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function Action({ icone, titre, detail, onPress, danger = false }: {
  icone: "check-circle-outline" | "home-outline" | "trash-can-outline";
  titre: string; detail: string; onPress: () => void; danger?: boolean;
}) {
  const couleur = danger ? "#b3261e" : c.green;
  return (
    <Pressable accessibilityRole="button" onPress={onPress}
      style={({ pressed }) => [styles.action, pressed && { backgroundColor: c.light }]}>
      <MaterialCommunityIcons name={icone} size={22} color={couleur} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.actionTitre, danger && { color: couleur }]}>{titre}</Text>
        <Text style={styles.sousTitre}>{detail}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fond: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  feuille: {
    backgroundColor: "white", borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, gap: 14,
  },
  poignee: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: c.border },
  entete: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  titre: { fontFamily: "DMSans_700Bold", fontSize: 19, lineHeight: 25, color: c.ink },
  sousTitre: { fontFamily: "DMSans_400Regular", fontSize: 13, lineHeight: 18, color: c.muted, marginTop: 2 },

  section: { fontFamily: "DMSans_700Bold", fontSize: 12, lineHeight: 16, color: c.muted, letterSpacing: 0.5, marginBottom: 6 },
  prixListe: { borderRadius: 12, borderWidth: 1, borderColor: c.border, overflow: "hidden" },
  prixLigne: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, paddingHorizontal: 12 },
  separateur: { borderTopWidth: 1, borderTopColor: c.border },
  magasin: { fontFamily: "DMSans_500Medium", fontSize: 14, lineHeight: 19, color: c.ink },
  produit: { fontFamily: "DMSans_400Regular", fontSize: 12, lineHeight: 16, color: c.muted },
  prix: { fontFamily: "DMSans_700Bold", fontSize: 15, lineHeight: 19, color: c.ink },
  promo: { color: "#b45309" },

  actions: { gap: 2 },
  action: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 10 },
  actionTitre: { fontFamily: "DMSans_700Bold", fontSize: 15, lineHeight: 20, color: c.ink },
});