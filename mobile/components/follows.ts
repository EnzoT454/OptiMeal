import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Offer } from '../types/api';
import { isOnPromo } from './search';

// Ingrédients suivis : l'utilisateur est prévenu quand l'un des 3 magasins les met en promo.
// On suit l'ingrédient (« Bœuf haché »), pas un produit précis : peu importe la marque ou le magasin.
//
// ÉTAPE 1 (maintenant) : la liste est enregistrée sur le téléphone (AsyncStorage).
// ÉTAPE 2 (backend) : seul l'intérieur de ces fonctions changera pour appeler /api/v1/me/follows ;
// les écrans qui les utilisent ne bougeront pas.

export interface Follow {
  ingredient_id: string;
  name: string;   // nom affiché si la liste des ingrédients ne se charge pas
  since: string;  // date du suivi (AAAA-MM-JJ…)
}

const KEY = 'optimeal.follows.v1';

export async function getFollows(): Promise<Follow[]> {
  try {
    const saved = await AsyncStorage.getItem(KEY);
    const list = saved ? JSON.parse(saved) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return []; // stockage illisible : on repart d'une liste vide plutôt que de bloquer l'écran
  }
}

async function save(list: Follow[]) {
  await AsyncStorage.setItem(KEY, JSON.stringify(list));
}

export async function follow(ingredient_id: string, name: string) {
  const list = await getFollows();
  if (list.some(f => f.ingredient_id === ingredient_id)) return;
  await save([...list, { ingredient_id, name, since: new Date().toISOString() }]);
}

export async function unfollow(ingredient_id: string) {
  const list = await getFollows();
  await save(list.filter(f => f.ingredient_id !== ingredient_id));
}

// Nombre d'ingrédients suivis qui sont en promo dans au moins un magasin (le chiffre de l'onglet « Suivis »).
export function followedOnPromo(follows: Follow[], offers: Offer[]) {
  const ids = new Set(follows.map(f => f.ingredient_id));
  return new Set(offers.filter(o => ids.has(o.ingredient_id) && isOnPromo(o)).map(o => o.ingredient_id)).size;
}

// Suivre ou ne plus suivre l'ingrédient d'un produit (bouton cloche). Renvoie la nouvelle liste.
export async function toggleFollow(offer: Offer): Promise<Follow[]> {
  const list = await getFollows();
  if (list.some(f => f.ingredient_id === offer.ingredient_id)) await unfollow(offer.ingredient_id);
  else await follow(offer.ingredient_id, offer.product_name);
  return getFollows();
}