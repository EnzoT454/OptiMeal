import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "../services/api";
import { ON_DATE } from "./promos";
import { dayName, fromISODate, getPlan, mondayOf, toISODate } from "./planning";
import type { Detail, Ingredient, MealPlanEntry, Offer, Page, Recipe, RecipeUnit, Retailer } from "../types/api";

// =====================================================================
// Liste d'épicerie de la semaine : construite à partir des repas du
// Calendrier + les articles ajoutés à la main.
// Pour l'instant, le prix affiché est celui du paquet le moins cher.
// Plus tard, le backend calculera le nombre de paquets selon la quantité
// (et les conversions d'unités) : seul l'intérieur de ce fichier changera.
// =====================================================================

// « auto » = l'appli choisit le magasin le moins cher pour TOUTE la liste
export type Magasin = "auto" | Retailer;

export const MAGASINS: Retailer[] = ["maxi", "metro", "superc"];

export type Quantite = { valeur: number; unite: RecipeUnit };

// Une ligne de la liste
export type LigneListe = {
  ingredient_id: string;        // clé unique de la ligne (« manuel:… » pour un article ajouté à la main)
  catalogue_id: string | null;  // l'ingrédient du catalogue (null = article hors catalogue)
  nom: string;
  categorie: string;
  quantites: Quantite[];        // une par unité : [200 g] ou [200 g, 1 cup]
  pour: string[];               // ex. ["Chili · lun.", "Pâtes · mer."]
  offres: Offer[];              // tous les produits de cet ingrédient dans les 3 magasins
  manuel?: boolean;             // vrai = ajouté à la main
};

// Ce qu'on garde après le chargement : utile pour les suggestions et les ajouts
export type Contexte = {
  catalogue: Map<string, Ingredient>;
  offresParIngredient: Map<string, Offer[]>;
};

export const RAYON_AUTRES = "Autres";

// =====================================================================
// Prix
// =====================================================================

// Une promo compte seulement si elle est valide aujourd'hui
export function enPromo(o: Offer): boolean {
  return o.promotion.status === "active" && o.promo_price?.amount != null;
}

function nombreOuNull(texte: string | null | undefined): number | null {
  if (texte == null) return null;
  const n = Number(texte);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Prix payé aujourd'hui (promo valide, sinon prix de base). null = prix inconnu (jamais 0 $)
export function prixOffre(o: Offer): number | null {
  return nombreOuNull(enPromo(o) ? o.promo_price!.amount : o.price.amount);
}

export function prixRegulier(o: Offer): number | null {
  return nombreOuNull(o.price.amount);
}

// Le produit retenu pour une ligne dans un magasin : le moins cher de ce magasin
export function offreChoisie(ligne: LigneListe, magasin: Retailer): Offer | undefined {
  return ligne.offres
    .filter((o) => o.retailer === magasin && prixOffre(o) !== null)
    .sort((a, b) => prixOffre(a)! - prixOffre(b)!)[0];
}

// Produits choisis à la main dans la fiche : { id de la ligne → id de l'offre }
export type ChoixProduits = Record<string, string>;

// Le produit de la ligne : celui choisi dans la fiche, sinon le moins cher du magasin
export function offreDeLigne(ligne: LigneListe, magasin: Retailer, choix: ChoixProduits = {}): Offer | undefined {
  const choisi = choix[ligne.ingredient_id];
  const offre = choisi ? ligne.offres.find((o) => o.id === choisi && prixOffre(o) !== null) : undefined;
  return offre ?? offreChoisie(ligne, magasin);
}

// Le moins cher tous magasins confondus (pour « Pas chez X, mais chez Y »)
export function meilleureOffre(ligne: LigneListe): Offer | undefined {
  return ligne.offres
    .filter((o) => prixOffre(o) !== null)
    .sort((a, b) => prixOffre(a)! - prixOffre(b)!)[0];
}

// Total de la liste dans UN magasin
export type TotalMagasin = {
  magasin: Retailer;
  total: number;      // somme des prix des paquets trouvés dans ce magasin
  economies: number;  // grâce aux promos de ce magasin
  nbPromo: number;
  absents: number;    // articles vendus ailleurs, mais pas dans ce magasin
};

export function totalMagasin(lignes: LigneListe[], magasin: Retailer, choix: ChoixProduits = {}): TotalMagasin {
  const t: TotalMagasin = { magasin, total: 0, economies: 0, nbPromo: 0, absents: 0 };
  for (const ligne of lignes) {
    const o = offreDeLigne(ligne, magasin, choix);
    if (!o) {
      if (meilleureOffre(ligne)) t.absents++; // existe ailleurs
      continue;                               // sinon : prix inconnu partout
    }
    const prix = prixOffre(o)!;
    t.total += prix;
    if (enPromo(o)) {
      t.nbPromo++;
      const regulier = prixRegulier(o);
      if (regulier !== null && regulier > prix) t.economies += regulier - prix;
    }
  }
  return t;
}

// Les 3 magasins, du meilleur au moins bon : d'abord le moins d'articles absents, puis le total
export function comparerMagasins(lignes: LigneListe[]): TotalMagasin[] {
  return MAGASINS.map((m) => totalMagasin(lignes, m))
    .sort((a, b) => a.absents - b.absents || a.total - b.total);
}

// =====================================================================
// Étape 1 : les repas de la semaine
// =====================================================================

export function lundiDeLaSemaine(aujourdhui = new Date()): string {
  return toISODate(mondayOf(aujourdhui));
}

// Un repas compte s'il a une recette et que ce n'est pas un reste
export function compteDansLaListe(repas: MealPlanEntry): boolean {
  return repas.recipe_id !== null && !repas.is_leftover;
}

export async function repasDeLaSemaine(aujourdhui = new Date()): Promise<MealPlanEntry[]> {
  const plan = await getPlan(lundiDeLaSemaine(aujourdhui));
  return plan.entries.filter(compteDansLaListe);
}

// =====================================================================
// Étape 2 : des repas aux lignes (aucun appel réseau, facile à tester)
// =====================================================================

export function construireLignes(
  repas: MealPlanEntry[],
  recettes: Map<string, Recipe>,
  contexte: Contexte,
): LigneListe[] {
  const lignes = new Map<string, LigneListe>();

  for (const r of repas) {
    const recette = recettes.get(r.recipe_id!);
    if (!recette) continue; // recette introuvable : on l'ignore

    // 4 portions planifiées pour une recette de 2 → tout × 2
    const facteur = recette.servings > 0 ? r.servings / recette.servings : 1;
    // « Pâtes au bœuf · mar. · 2 p. » : on voit pour combien de portions la quantité est calculée
    const etiquette = `${recette.name} · ${dayName(fromISODate(r.date)).toLowerCase()} · ${r.servings} p.`;

    for (const ing of recette.ingredients) {
      let ligne = lignes.get(ing.ingredient_id);
      if (!ligne) {
        const infos = contexte.catalogue.get(ing.ingredient_id);
        ligne = {
          ingredient_id: ing.ingredient_id,
          catalogue_id: ing.ingredient_id,
          nom: infos?.name ?? "Ingrédient inconnu",
          categorie: infos?.category ?? RAYON_AUTRES,
          quantites: [],
          pour: [],
          offres: contexte.offresParIngredient.get(ing.ingredient_id) ?? [],
        };
        lignes.set(ing.ingredient_id, ligne);
      }

      // Additionner seulement si c'est la même unité (pas de conversion ici)
      const valeur = Number(ing.quantity) * facteur;
      if (Number.isFinite(valeur) && valeur > 0) {
        const memeUnite = ligne.quantites.find((q) => q.unite === ing.unit);
        if (memeUnite) memeUnite.valeur += valeur;
        else ligne.quantites.push({ valeur, unite: ing.unit });
      }

      if (!ligne.pour.includes(etiquette)) ligne.pour.push(etiquette);
    }
  }

  return [...lignes.values()];
}

// « Fusilli Selection · 900 g » : le produit à prendre au magasin
export function texteProduit(o: Offer): string {
  const { quantity, unit_raw } = o.format;
  const format = quantity && unit_raw ? ` · ${quantity.replace(".", ",")} ${unit_raw}` : "";
  return `${o.product_name}${format}`;
}

// Trier par rayon puis par nom, « Autres » à la fin
export function trier(lignes: LigneListe[]): LigneListe[] {
  return [...lignes].sort((a, b) => {
    if (a.categorie !== b.categorie) {
      if (a.categorie === RAYON_AUTRES) return 1;
      if (b.categorie === RAYON_AUTRES) return -1;
      return a.categorie.localeCompare(b.categorie);
    }
    return a.nom.localeCompare(b.nom);
  });
}

// =====================================================================
// Étape 3 : charger ce qu'il faut et tout assembler
// =====================================================================

async function chargerRecette(id: string): Promise<Recipe | null> {
  try {
    const res = await api<Detail<Recipe>>(`/api/v1/recipes/${id}`);
    return res.item;
  } catch {
    return null; // recette supprimée ou inaccessible
  }
}

// Charger toutes les pages d'une route (100 à la fois)
async function toutesLesPages<T>(chemin: string): Promise<T[]> {
  const items: T[] = [];
  const separateur = chemin.includes("?") ? "&" : "?";
  let offset = 0;
  while (true) {
    const page = await api<Page<T>>(`${chemin}${separateur}limit=100&offset=${offset}`);
    items.push(...page.items);
    offset += page.items.length;
    if (page.items.length === 0 || offset >= page.total) break;
  }
  return items;
}

export async function chargerContexte(): Promise<Contexte> {
  const cheminOffres = ON_DATE ? `/api/v1/offers?on_date=${ON_DATE}` : "/api/v1/offers";
  const [ingredients, offres] = await Promise.all([
    toutesLesPages<Ingredient>("/api/v1/ingredients"),
    toutesLesPages<Offer>(cheminOffres),
  ]);
  const catalogue = new Map(ingredients.map((i) => [i.id, i]));
  const offresParIngredient = new Map<string, Offer[]>();
  for (const o of offres) {
    offresParIngredient.set(o.ingredient_id, [...(offresParIngredient.get(o.ingredient_id) ?? []), o]);
  }
  return { catalogue, offresParIngredient };
}

// La fonction que les écrans appellent : la liste complète de la semaine
export async function chargerListe(aujourdhui = new Date()): Promise<{ lignes: LigneListe[]; contexte: Contexte }> {
  const repas = await repasDeLaSemaine(aujourdhui);
  const ids = [...new Set(repas.map((r) => r.recipe_id!))]; // chaque recette une seule fois

  const [recettesChargees, contexte, manuels] = await Promise.all([
    Promise.all(ids.map(chargerRecette)),
    chargerContexte(),
    lireManuels(),
  ]);

  const recettes = new Map<string, Recipe>();
  for (const r of recettesChargees) if (r) recettes.set(r.id, r);

  const lignes = [
    ...construireLignes(repas, recettes, contexte),
    ...manuels.map((a) => ligneManuelle(a, contexte)),
  ];
  return { lignes: trier(lignes), contexte };
}

// =====================================================================
// Suggestions pendant qu'on tape (catalogue + alias)
// =====================================================================

// « Pommes Gala » → "pommes gala" (sans accents ni majuscules)
function normaliser(texte: string): string {
  return texte.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export type Suggestion = { ingredient: Ingredient; meilleure: Offer | undefined };

// Chaque mot tapé doit être le début d'un mot du nom ou d'un alias : « pom ga » → Pomme Gala
export function suggerer(texte: string, contexte: Contexte, max = 5): Suggestion[] {
  const mots = normaliser(texte).split(/\s+/).filter(Boolean);
  if (mots.length === 0) return [];

  const resultats: { ingredient: Ingredient; score: number }[] = [];
  for (const ingredient of contexte.catalogue.values()) {
    const noms = [ingredient.name, ...ingredient.aliases].map(normaliser);
    const correspond = noms.some((nom) => {
      const motsDuNom = nom.split(/\s+/);
      return mots.every((m) => motsDuNom.some((mn) => mn.startsWith(m)));
    });
    if (!correspond) continue;
    // Le nom principal qui commence par le texte passe en premier
    const score = normaliser(ingredient.name).startsWith(mots.join(" ")) ? 0 : 1;
    resultats.push({ ingredient, score });
  }

  return resultats
    .sort((a, b) => a.score - b.score || a.ingredient.name.localeCompare(b.ingredient.name))
    .slice(0, max)
    .map(({ ingredient }) => {
      const offres = contexte.offresParIngredient.get(ingredient.id) ?? [];
      const meilleure = offres
        .filter((o) => prixOffre(o) !== null)
        .sort((a, b) => prixOffre(a)! - prixOffre(b)!)[0];
      return { ingredient, meilleure };
    });
}

// =====================================================================
// Stockage sur le téléphone (AsyncStorage) — plus tard dans le backend
// =====================================================================

async function lireIds(cle: string): Promise<Set<string>> {
  const texte = await AsyncStorage.getItem(cle);
  return new Set(texte ? JSON.parse(texte) : []);
}

async function ecrireIds(cle: string, ids: Set<string>) {
  await AsyncStorage.setItem(cle, JSON.stringify([...ids]));
}

// Articles cochés (mis dans le panier au magasin) : une liste par semaine
const cleCoches = () => `shoppingList.coches.${lundiDeLaSemaine()}`;
export const lireCoches = () => lireIds(cleCoches());
export const ecrireCoches = (ids: Set<string>) => ecrireIds(cleCoches(), ids);

// « J'en ai déjà » : pour cette semaine seulement
const cleDejaLa = () => `shoppingList.dejaLa.${lundiDeLaSemaine()}`;
export const lireDejaLa = () => lireIds(cleDejaLa());
export const ecrireDejaLa = (ids: Set<string>) => ecrireIds(cleDejaLa(), ids);

// « J'en ai toujours » : ingrédients du catalogue qu'on a toujours à la maison (toutes les semaines)
const CLE_TOUJOURS = "shoppingList.gardeManger"; // ancien nom de la clé gardé pour ne rien perdre
export const lireToujours = () => lireIds(CLE_TOUJOURS);
export const ecrireToujours = (ids: Set<string>) => ecrireIds(CLE_TOUJOURS, ids);

// Produits choisis dans la fiche : pour cette semaine
const cleChoix = () => `shoppingList.choix.${lundiDeLaSemaine()}`;
export async function lireChoix(): Promise<ChoixProduits> {
  const texte = await AsyncStorage.getItem(cleChoix());
  return texte ? JSON.parse(texte) : {};
}
export async function ecrireChoix(choix: ChoixProduits) {
  await AsyncStorage.setItem(cleChoix(), JSON.stringify(choix));
}

// Magasin choisi (« auto » = le moins cher)
const CLE_MAGASIN = "shoppingList.magasin";
export async function lireMagasin(): Promise<Magasin> {
  const m = await AsyncStorage.getItem(CLE_MAGASIN);
  return m === "maxi" || m === "metro" || m === "superc" ? m : "auto";
}
export async function ecrireMagasin(m: Magasin) {
  await AsyncStorage.setItem(CLE_MAGASIN, m);
}

// ---- Articles ajoutés à la main ----

export type ArticleManuel = {
  id: string;
  nom: string;
  ingredient_id?: string | null; // l'ingrédient du catalogue choisi dans les suggestions (sinon hors catalogue)
};

const CLE_MANUELS = "shoppingList.manuels";

export async function lireManuels(): Promise<ArticleManuel[]> {
  const texte = await AsyncStorage.getItem(CLE_MANUELS);
  return texte ? JSON.parse(texte) : [];
}

async function ecrireManuels(articles: ArticleManuel[]) {
  await AsyncStorage.setItem(CLE_MANUELS, JSON.stringify(articles));
}

// Ajoute un article ; renvoie la nouvelle liste des articles manuels
export async function ajouterManuel(nom: string, ingredientId: string | null = null): Promise<ArticleManuel[]> {
  const articles = await lireManuels();
  const propre = nom.trim();
  if (!propre) return articles;
  // Déjà dans la liste (même ingrédient, ou même texte) : on ne l'ajoute pas deux fois
  const doublon = articles.some((a) =>
    ingredientId ? a.ingredient_id === ingredientId : !a.ingredient_id && a.nom.toLowerCase() === propre.toLowerCase());
  if (doublon) return articles;
  const nouveau: ArticleManuel = { id: Date.now().toString(36), nom: propre, ingredient_id: ingredientId };
  const liste = [...articles, nouveau];
  await ecrireManuels(liste);
  return liste;
}

export async function retirerManuel(id: string): Promise<ArticleManuel[]> {
  const liste = (await lireManuels()).filter((a) => a.id !== id);
  await ecrireManuels(liste);
  return liste;
}

// Un article manuel devient une ligne comme les autres (avec ses prix s'il est au catalogue)
export function ligneManuelle(article: ArticleManuel, contexte?: Contexte): LigneListe {
  const id = article.ingredient_id ?? null;
  const infos = id ? contexte?.catalogue.get(id) : undefined;
  return {
    ingredient_id: `manuel:${article.id}`,
    catalogue_id: id,
    nom: infos?.name ?? article.nom,
    categorie: infos?.category ?? RAYON_AUTRES,
    quantites: [],
    pour: [],
    offres: id ? contexte?.offresParIngredient.get(id) ?? [] : [],
    manuel: true,
  };
}