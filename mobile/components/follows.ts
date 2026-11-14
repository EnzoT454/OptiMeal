import { readAccountJSON, updateAccountJSON, type LocalAccount } from '../services/accountStorage';
import type { Offer, Retailer } from '../types/api';
import { isOnPromo } from './search';

// Produits suivis : l'utilisateur est prévenu quand CE produit, dans CE magasin, passe en promo
// (demande du prof : suivre un seul produit, pas toute la catégorie ni l'ingrédient dans les 3 magasins).
// Les suivis conservent actuellement l'identifiant d'offre reçu de l'API.
//
// ÉTAPE 1 (maintenant) : la liste est enregistrée sur le téléphone (AsyncStorage).
// ÉTAPE 2 (backend) : seul l'intérieur de ces fonctions changera pour appeler /api/v1/me/follows ;
// les écrans qui les utilisent ne bougeront pas.

export interface Follow {
  offer_id: string;
  retailer: Retailer;
  name: string;   // nom affiché si le produit n'est plus vendu
  since: string;  // date du suivi (AAAA-MM-JJ…)
}

// « v2 » : l'ancienne liste « v1 » (par ingrédient) est ignorée.
const KEY = 'optimeal.follows.v2';

export async function getFollows(userId: LocalAccount): Promise<Follow[]> {
  try {
    const list = await readAccountJSON<Follow[]>(userId, KEY, []);
    return Array.isArray(list) ? list : [];
  } catch {
    return []; // stockage illisible : on repart d'une liste vide plutôt que de bloquer l'écran
  }
}

export async function unfollow(userId: LocalAccount, offerId: string) {
  return updateAccountJSON<Follow[]>(userId, KEY, [], list => list.filter(f => f.offer_id !== offerId));
}

// Suivre ou ne plus suivre un produit (cloche ou bouton de la fiche). Renvoie la nouvelle liste.
export async function toggleFollow(userId: LocalAccount, offer: Offer): Promise<Follow[]> {
  return updateAccountJSON<Follow[]>(userId, KEY, [], list => list.some(f => f.offer_id === offer.id)
    ? list.filter(f => f.offer_id !== offer.id)
    : [...list, { offer_id: offer.id, retailer: offer.retailer, name: offer.product_name, since: new Date().toISOString() }]);
}

// Nombre de produits suivis en promo cette semaine (la pastille rouge de l'onglet « Suivis »).
export function followedOnPromo(follows: Follow[], offers: Offer[]) {
  const ids = new Set(follows.map(f => f.offer_id));
  return offers.filter(o => ids.has(o.id) && isOnPromo(o)).length;
}
