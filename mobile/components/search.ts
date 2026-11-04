import { api } from '../services/api';
import type { Ingredient, Offer, Page } from '../types/api';
import { ON_DATE } from './promos';

// Recherche de produits pour l'onglet Promos : tous les produits (en promo ou non)
// et une recherche « tolérante » (pluriels, accents, alias, petite faute de frappe).

// Toutes les pages d'une liste de l'API (l'API renvoie au plus 100 éléments à la fois).
async function fetchAll<T>(path: string, params: Record<string, string> = {}) {
  const items: T[] = [];
  for (let offset = 0; ; offset += 100) {
    const query = new URLSearchParams({ ...params, limit: '100', offset: String(offset) });
    const page = await api<Page<T>>(`${path}?${query}`);
    items.push(...page.items);
    if (!page.items.length || items.length >= page.total) return items;
  }
}

// Tous les produits des 3 magasins. Un produit qui n'est pas en promo aujourd'hui
// (jamais en promo, ou promo terminée) est affiché à son prix régulier : promo_price = null.
export async function fetchAllOffers() {
  const offers = await fetchAll<Offer>('/api/v1/offers', ON_DATE ? { on_date: ON_DATE } : {});
  return offers.map(o => (isOnPromo(o) ? o : { ...o, promo_price: null }));
}

export function isOnPromo(offer: Offer) {
  return offer.promotion.status === 'active' && offer.promo_price?.amount != null;
}

// Tous les ingrédients (nom commun + alias), par exemple « Bœuf haché ».
export function fetchIngredients() {
  return fetchAll<Ingredient>('/api/v1/ingredients');
}

// Mots-clés de chaque ingrédient (nom + alias), pour que « volaille » trouve « Poulet ».
// Si la liste ne se charge pas, la recherche marche quand même sur le nom du produit.
export async function fetchKeywords() {
  try {
    const ingredients = await fetchIngredients();
    return Object.fromEntries(ingredients.map(i => [i.id, [i.name, ...i.aliases].join(' ')]));
  } catch {
    return {} as Record<string, string>;
  }
}

// « Œufs Bio » → ['oeuf', 'bio'] : minuscules, sans accents, sans ponctuation, au singulier.
export function words(text: string) {
  return text.toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/).filter(Boolean).map(singular);
}

// Pluriel simple du français : ailes → aile, choux → chou (les mots courts ne changent pas).
function singular(word: string) {
  return word.length > 3 && /[sx]$/.test(word) ? word.slice(0, -1) : word;
}

// Nombre de lettres à changer pour passer d'un mot à l'autre (distance de Levenshtein).
function distance(a: string, b: string) {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length];
}

// Un mot cherché correspond à un mot du produit s'il en est le début (« pou » → « poulet »),
// ou avec une faute de frappe : 1 lettre d'écart à partir de 4 lettres, 2 à partir de 8 (« poulett » → « poulet »).
// Jamais au milieu d'un mot : sinon « lai » trouverait « p-lai-n yogurt ».
function wordMatches(searched: string, word: string) {
  if (word.startsWith(searched)) return true;
  const allowed = searched.length >= 8 ? 2 : searched.length >= 4 ? 1 : 0;
  return allowed > 0 && Math.abs(word.length - searched.length) <= allowed && distance(searched, word) <= allowed;
}

// Petits mots ignorés dans la recherche : « ailes de poulet » = « ailes poulet ».
const STOP = new Set(['de', 'du', 'des', 'd', 'la', 'le', 'les', 'l', 'au', 'aux', 'a', 'et', 'en']);
export function searchWords(query: string) {
  return words(query).filter(w => !STOP.has(w));
}

// Score de pertinence : 0 = ne correspond pas. Plus c'est haut, plus le produit monte dans la liste.
// Chaque mot cherché doit se retrouver dans le nom du produit ou dans les mots-clés de son ingrédient.
export function searchScore(searched: string[], offer: Offer, keywords: Record<string, string>) {
  if (!searched.length) return 1;
  const name = words(offer.product_name);
  const extra = words(keywords[offer.ingredient_id] ?? '');
  let score = 0;
  for (const s of searched) {
    if (name.some(w => w.startsWith(s))) score += 3;          // le nom du produit commence pareil : le meilleur
    else if (name.some(w => wordMatches(s, w))) score += 2;   // dans le nom, avec une petite faute
    else if (extra.some(w => wordMatches(s, w))) score += 1;  // trouvé grâce aux alias
    else return 0;
  }
  return score;
}