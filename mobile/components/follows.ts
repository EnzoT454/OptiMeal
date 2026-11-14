import { readAccountJSON, updateAccountJSON, type LocalAccount } from '../services/accountStorage';
import type { Offer, Retailer } from '../types/api';
import { isOnPromo } from './search';

// product_id = enseigne + magasin + référence marchand, indépendant du relevé.
// offer_id n'est conservé que pour les anciens suivis à réassocier.
export interface Follow {
  product_id?: string;
  offer_id?: string;
  retailer: Retailer;
  name: string;
  since: string;
}
const KEY = 'optimeal.follows.v2'; // garder les données existantes, séparées par compte
export const followKey = (f: Follow): string => f.product_id ?? f.offer_id!;
export const followsOffer = (f: Follow, o: Offer): boolean => f.retailer === o.retailer &&
  (f.product_id ? f.product_id === o.product_id : f.offer_id === o.id);

export function reconcileFollows(list: Follow[], offers: Offer[]): Follow[] {
  const seen = new Set<string>();
  return list.map(f => {
    if (f.product_id) return f;
    const offer = offers.find(o => followsOffer(f, o));
    return offer ? { product_id: offer.product_id, retailer: f.retailer, name: f.name, since: f.since } : f;
  }).filter(f => { const key = followKey(f); if (seen.has(key)) return false; seen.add(key); return true; });
}

export async function getFollows(userId: LocalAccount, offers: Offer[] = []): Promise<Follow[]> {
  const list = await readAccountJSON<Follow[]>(userId, KEY, []);
  if (!Array.isArray(list)) throw new Error('Données de suivi invalides.');
  const next = reconcileFollows(list, offers);
  if (JSON.stringify(next) === JSON.stringify(list)) return list;
  // Recalculer dans la file d'écritures pour ne pas perdre une cloche touchée entre-temps.
  return updateAccountJSON<Follow[]>(userId, KEY, [], current => reconcileFollows(current, offers));
}

export async function unfollow(userId: LocalAccount, key: string) {
  return updateAccountJSON<Follow[]>(userId, KEY, [], list => list.filter(f => followKey(f) !== key));
}

export async function toggleFollow(userId: LocalAccount, offer: Offer): Promise<Follow[]> {
  return updateAccountJSON<Follow[]>(userId, KEY, [], current => {
    const list = reconcileFollows(current, [offer]);
    return list.some(f => followsOffer(f, offer))
      ? list.filter(f => !followsOffer(f, offer))
      : [...list, { product_id: offer.product_id, retailer: offer.retailer,
        name: offer.product_name, since: new Date().toISOString() }];
  });
}

export function followedOnPromo(follows: Follow[], offers: Offer[]) {
  return new Set(offers.filter(o => follows.some(f => followsOffer(f, o)) && isOnPromo(o))
    .map(o => o.product_id)).size;
}
