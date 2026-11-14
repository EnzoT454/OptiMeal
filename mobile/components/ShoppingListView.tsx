import { useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { recipeColors as c } from "./recipes";
import { money, storeName } from "./promos";
import AddItemField from "./AddItemField";
import ArticleSheet from "./ArticleSheet";
import {
  MAGASINS, RAYON_AUTRES, enPromo, meilleureOffre, prixOffre, prixRegulier, texteProduit,
  type LigneListe, type Quantite,
} from "./shoppingList";
import type { ListeAchats } from "./useShoppingList";
import type { Retailer } from "../types/api";

// =====================================================================
// Le contenu de l'Épicerie (dans le Calendrier) :
//   total du magasin → choix du magasin → ajout avec suggestions → rayons
//   → pas dans ce magasin → cochés (repliés) → déjà chez moi (replié)
// Case = mis dans le panier. Nom = fiche (J'en ai déjà / J'en ai toujours).
// =====================================================================

const UNITES: Record<Quantite["unite"], string> = {
  g: "g", ml: "ml", unit: "", cup: "tasse", tbsp: "c. à soupe", tsp: "c. à thé",
};

// 2.333 → "2,3" ; 450.2 → "450"
function nombre(v: number) {
  const arrondi = v >= 10 ? Math.round(v) : Math.round(v * 10) / 10;
  return String(arrondi).replace(".", ",");
}

// [200 g, 1 tasse] → "200 g + 1 tasse"
export function texteQuantites(quantites: Quantite[]) {
  return quantites.map((q) => `${nombre(q.valeur)} ${UNITES[q.unite]}`.trim()).join(" + ");
}

// Regrouper les lignes (déjà triées par rayon)
function parRayon(lignes: LigneListe[]) {
  const groupes: [string, LigneListe[]][] = [];
  for (const ligne of lignes) {
    const dernier = groupes[groupes.length - 1];
    if (dernier && dernier[0] === ligne.categorie) dernier[1].push(ligne);
    else groupes.push([ligne.categorie, [ligne]]);
  }
  return groupes;
}

export default function ShoppingListView({ liste }: { liste: ListeAchats }) {
  const [ouverte, setOuverte] = useState<LigneListe | null>(null); // la fiche affichée
  const [cocheesOuvertes, setCocheesOuvertes] = useState(false);
  const [chezMoiOuvert, setChezMoiOuvert] = useState(false);
  const { lignes, aAcheter, pasIci, cochees, chezMoi, chargement, erreur, magasin, totaux } = liste;
  const sansPrix = aAcheter.filter((l) => !liste.offreDe(l)).length;
  // Articles que l'utilisateur a choisi de prendre dans un autre magasin (via la fiche)
  const ici = aAcheter.filter((l) => { const o = liste.offreDe(l); return !o || o.retailer === magasin; });
  const ailleurs = aAcheter.filter((l) => !ici.includes(l));
  const autresMagasins = [...new Set(ailleurs.map((l) => liste.offreDe(l)!.retailer))];

  return (
    <View style={styles.contenu}>
      {/* ---- Total dans le magasin choisi ---- */}
      {lignes.length > 0 && (
        <View style={styles.total}>
          <View>
            <Text style={styles.totalLabel}>
              Total estimé{autresMagasins.length > 0 ? ` · ${1 + autresMagasins.length} magasins` : ` chez ${storeName(magasin)}`}
            </Text>
            <Text style={styles.totalValeur}>≈ {money(totaux.total)}</Text>
          </View>
          <View style={{ alignItems: "flex-end", gap: 2 }}>
            {totaux.economies > 0 && <Text style={styles.totalDetail}>{money(totaux.economies)} économisés</Text>}
            {sansPrix > 0 && <Text style={styles.totalDetail}>{sansPrix} sans prix</Text>}
            <Text style={styles.totalNote}>prix des paquets</Text>
          </View>
        </View>
      )}

      {/* ---- Un seul magasin à la fois ---- */}
      <View style={styles.magasins}>
        {MAGASINS.map((m: Retailer) => {
          const choisi = m === magasin;
          return (
            <Pressable key={m} accessibilityRole="button" accessibilityState={{ selected: choisi }}
              onPress={() => liste.choisirMagasin(m)} style={[styles.puce, choisi && styles.puceChoisie]}>
              <Text style={[styles.puceTexte, choisi && { color: "white" }]}>{storeName(m)}</Text>
            </Pressable>
          );
        })}
      </View>
      {liste.magasinAuto && lignes.length > 0 && (
        <Text style={styles.note}>Choisi pour toi : le moins cher pour ta liste.</Text>
      )}

      {/* ---- Ajouter un article (suggestions du catalogue) ---- */}
      <AddItemField contexte={liste.contexte} onAjouter={liste.ajouter} />

      {/* ---- États ---- */}
      {chargement && lignes.length === 0 && <ActivityIndicator color={c.green} style={{ marginTop: 24 }} />}

      {!chargement && erreur && (
        <View style={styles.boite}>
          <Text style={styles.texte}>{erreur}</Text>
          <Pressable accessibilityRole="button" onPress={liste.recharger} hitSlop={10}>
            <Text style={styles.lien}>Réessayer</Text>
          </Pressable>
        </View>
      )}

      {!chargement && !erreur && lignes.length === 0 && (
        <View style={styles.boite}>
          <MaterialCommunityIcons name="cart-outline" size={32} color={c.green} />
          <Text style={styles.texteFort}>Ta liste de la semaine est vide</Text>
          <Text style={styles.texte}>
            Planifie des recettes dans Repas : leurs ingrédients s'ajoutent ici. Tu peux aussi ajouter un article ci-dessus.
          </Text>
        </View>
      )}

      {!chargement && !erreur && lignes.length > 0 && aAcheter.length === 0 && pasIci.length === 0 && (
        <View style={styles.boite}>
          <MaterialCommunityIcons name="check-circle-outline" size={32} color={c.green} />
          <Text style={styles.texteFort}>Rien d'autre à acheter</Text>
          <Text style={styles.texte}>Bonne épicerie !</Text>
        </View>
      )}

      {lignes.length > 0 && aAcheter.length > 0 && (
        <Text style={styles.note}>Touche un article pour comparer ses prix, le prendre ailleurs ou dire que tu en as déjà.</Text>
      )}

      {/* ---- À acheter, par rayon ---- */}
      {parRayon(ici).map(([rayon, items]) => (
        <View key={rayon} style={styles.section}>
          <Text style={styles.rayon}>{rayon.toUpperCase()}</Text>
          <View style={styles.groupe}>
            {items.map((ligne, i) => (
              <Ligne key={ligne.ingredient_id} ligne={ligne} liste={liste} coche={false} premier={i === 0}
                onCocher={() => liste.basculerCoche(ligne.ingredient_id)} onOuvrir={() => setOuverte(ligne)} />
            ))}
          </View>
        </View>
      ))}

      {/* ---- Articles choisis dans un autre magasin (un 2e arrêt) ---- */}
      {autresMagasins.map((m) => {
        const items = ailleurs.filter((l) => liste.offreDe(l)!.retailer === m);
        return (
          <View key={m} style={styles.section}>
            <Text style={styles.rayon}>À PRENDRE CHEZ {storeName(m).toUpperCase()} ({items.length})</Text>
            <View style={styles.groupe}>
              {items.map((ligne, i) => (
                <Ligne key={ligne.ingredient_id} ligne={ligne} liste={liste} coche={false} premier={i === 0}
                  onCocher={() => liste.basculerCoche(ligne.ingredient_id)} onOuvrir={() => setOuverte(ligne)} />
              ))}
            </View>
          </View>
        );
      })}

      {/* ---- Vendus ailleurs, pas dans ce magasin ---- */}
      {pasIci.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.rayon}>PAS CHEZ {storeName(magasin).toUpperCase()} ({pasIci.length})</Text>
          <View style={styles.groupe}>
            {pasIci.map((ligne, i) => {
              const ailleurs = meilleureOffre(ligne)!;
              return (
                <Pressable key={ligne.ingredient_id} onPress={() => setOuverte(ligne)}
                  style={[styles.ligne, i > 0 && styles.separateur]}>
                  <MaterialCommunityIcons name="storefront-outline" size={22} color={c.muted} />
                  <Text style={[styles.nom, { flex: 1 }]} numberOfLines={1}>{ligne.nom}</Text>
                  <Text style={styles.magasin}>
                    chez {storeName(ailleurs.retailer)} {money(prixOffre(ailleurs))}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {/* ---- Cochés (dans le panier) : repliés ---- */}
      {cochees.length > 0 && (
        <Repli titre={`${cochees.length} dans le panier`} ouvert={cocheesOuvertes} onPress={() => setCocheesOuvertes(!cocheesOuvertes)}>
          {cochees.map((ligne, i) => (
            <Ligne key={ligne.ingredient_id} ligne={ligne} liste={liste} coche premier={i === 0}
              onCocher={() => liste.basculerCoche(ligne.ingredient_id)} onOuvrir={() => setOuverte(ligne)} />
          ))}
        </Repli>
      )}

      {/* ---- Déjà chez moi (J'en ai déjà / J'en ai toujours) : replié ---- */}
      {chezMoi.length > 0 && (
        <Repli titre={`${chezMoi.length} déjà chez moi`} ouvert={chezMoiOuvert} onPress={() => setChezMoiOuvert(!chezMoiOuvert)}>
          {chezMoi.map((ligne, i) => {
            const toujours = ligne.catalogue_id !== null && liste.toujours.has(ligne.catalogue_id);
            return (
              <View key={ligne.ingredient_id} style={[styles.ligne, i > 0 && styles.separateur]}>
                <MaterialCommunityIcons name={toujours ? "home-outline" : "check-circle-outline"} size={22} color={c.muted} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.nom, { color: c.muted }]} numberOfLines={1}>{ligne.nom}</Text>
                  <Text style={styles.sousTitre}>{toujours ? "toujours chez moi" : "cette semaine"}</Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel={`Remettre ${ligne.nom} dans la liste`} hitSlop={10}
                  onPress={() => toujours ? liste.basculerToujours(ligne.catalogue_id!) : liste.basculerDejaLa(ligne.ingredient_id)}>
                  <Text style={styles.lien}>Remettre</Text>
                </Pressable>
              </View>
            );
          })}
        </Repli>
      )}

      <ArticleSheet
        ligne={ouverte}
        liste={liste}
        quantite={ouverte ? texteQuantites(ouverte.quantites) : ""}
        onClose={() => setOuverte(null)}
      />
    </View>
  );
}

// Une section repliable (« 4 dans le panier ⌄ »)
function Repli({ titre, ouvert, onPress, children }: {
  titre: string; ouvert: boolean; onPress: () => void; children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: ouvert }} onPress={onPress} style={styles.repli}>
        <MaterialCommunityIcons name={ouvert ? "chevron-up" : "chevron-down"} size={18} color={c.muted} />
        <Text style={styles.repliTexte}>{titre}</Text>
      </Pressable>
      {ouvert && <View style={styles.groupe}>{children}</View>}
    </View>
  );
}

// Une ligne : case (panier) | nom → fiche | prix dans le magasin choisi
function Ligne({ ligne, liste, coche, premier, onCocher, onOuvrir }: {
  ligne: LigneListe; liste: ListeAchats; coche: boolean; premier: boolean;
  onCocher: () => void; onOuvrir: () => void;
}) {
  const offre = liste.offreDe(ligne);
  const prix = offre ? prixOffre(offre) : null;
  const promo = offre ? enPromo(offre) : false;
  const regulier = offre ? prixRegulier(offre) : null;
  const sousTitre = ligne.manuel
    ? (ligne.categorie === RAYON_AUTRES ? "ajouté par toi · hors catalogue" : "ajouté par toi")
    : ligne.pour.join(", ");

  return (
    <View style={[styles.ligne, !premier && styles.separateur]}>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: coche }}
        accessibilityLabel={`${ligne.nom} dans le panier`} onPress={onCocher} hitSlop={12}>
        <MaterialCommunityIcons name={coche ? "checkbox-marked" : "checkbox-blank-outline"} size={24}
          color={coche ? c.muted : c.green} />
      </Pressable>

      <Pressable style={{ flex: 1 }} onPress={onOuvrir} accessibilityRole="button"
        accessibilityHint="Ouvre la fiche de l'article">
        <Text style={[styles.nom, coche && styles.barre]} numberOfLines={2}>
          {ligne.nom}
          {ligne.quantites.length > 0 && <Text style={styles.quantite}> · {texteQuantites(ligne.quantites)}</Text>}
        </Text>
        {!coche && sousTitre.length > 0 && <Text style={styles.sousTitre} numberOfLines={1}>{sousTitre}</Text>}
        {!coche && offre && <Text style={styles.produit} numberOfLines={1}>{texteProduit(offre)}</Text>}
      </Pressable>

      {!coche && (
        <View style={styles.prixBloc}>
          {offre && prix !== null ? (
            <>
              <Text style={[styles.prix, promo && styles.prixPromo]}>{money(prix)}</Text>
              {promo && regulier !== null && regulier > prix && <Text style={styles.ancien}>{money(regulier)}</Text>}
            </>
          ) : (
            <Text style={styles.magasin}>prix inconnu</Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  contenu: { gap: 14 },

  total: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end",
    padding: 14, borderRadius: 14, backgroundColor: c.green,
  },
  totalLabel: { fontFamily: "DMSans_500Medium", fontSize: 12, lineHeight: 16, color: "rgba(255,255,255,0.85)" },
  totalValeur: { fontFamily: "DMSans_700Bold", fontSize: 26, lineHeight: 32, color: "white" },
  totalDetail: { fontFamily: "DMSans_500Medium", fontSize: 12, lineHeight: 16, color: "white" },
  totalNote: { fontFamily: "DMSans_400Regular", fontSize: 11, lineHeight: 15, color: "rgba(255,255,255,0.7)" },

  magasins: { flexDirection: "row", gap: 6 },
  puce: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 10, backgroundColor: c.light },
  puceChoisie: { backgroundColor: c.green },
  puceTexte: { fontFamily: "DMSans_700Bold", fontSize: 13, lineHeight: 18, color: c.green },
  note: { fontFamily: "DMSans_400Regular", fontSize: 12, lineHeight: 17, color: c.muted, marginTop: -6 },

  boite: { alignItems: "center", gap: 8, padding: 24, borderRadius: 16, backgroundColor: "white" },
  texte: { fontFamily: "DMSans_400Regular", fontSize: 14, lineHeight: 20, color: c.muted, textAlign: "center" },
  texteFort: { fontFamily: "DMSans_700Bold", fontSize: 16, lineHeight: 22, color: c.ink },
  lien: { fontFamily: "DMSans_700Bold", fontSize: 14, lineHeight: 20, color: c.green },

  section: { gap: 6 },
  rayon: { fontFamily: "DMSans_700Bold", fontSize: 12, lineHeight: 16, color: c.muted, letterSpacing: 0.5 },
  groupe: { backgroundColor: "white", borderRadius: 14, borderWidth: 1, borderColor: c.border, overflow: "hidden" },
  repli: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4 },
  repliTexte: { fontFamily: "DMSans_500Medium", fontSize: 14, lineHeight: 19, color: c.muted },

  ligne: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11, paddingHorizontal: 12 },
  separateur: { borderTopWidth: 1, borderTopColor: c.border },
  nom: { fontFamily: "DMSans_500Medium", fontSize: 15, lineHeight: 20, color: c.ink },
  quantite: { fontFamily: "DMSans_400Regular", color: c.muted },
  barre: { textDecorationLine: "line-through", color: c.muted },
  sousTitre: { fontFamily: "DMSans_400Regular", fontSize: 12, lineHeight: 16, color: c.muted, marginTop: 2 },
  produit: { fontFamily: "DMSans_500Medium", fontSize: 12, lineHeight: 16, color: c.green, marginTop: 2 },

  prixBloc: { alignItems: "flex-end", minWidth: 58 },
  prix: { fontFamily: "DMSans_700Bold", fontSize: 15, lineHeight: 19, color: c.ink },
  prixPromo: { color: "#b45309" },
  ancien: { fontFamily: "DMSans_400Regular", fontSize: 11, lineHeight: 14, color: c.muted, textDecorationLine: "line-through" },
  magasin: { fontFamily: "DMSans_400Regular", fontSize: 12, lineHeight: 16, color: c.muted },
});