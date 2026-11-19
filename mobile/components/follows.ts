import { readAccountJSON, updateAccountJSON, writeAccountJSON, type LocalAccount } from '../services/accountStorage';
import { api } from '../services/api';
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

// Les suivis restent d'abord sur le téléphone, séparés par compte (même fonctionnement qu'avant).
// Ils sont AUSSI enregistrés dans Supabase (table product_follow, routes /api/v1/follows) :
//   - chaque cloche touchée est envoyée au serveur en arrière-plan ;
//   - après une réinstallation ou sur un nouveau téléphone, les suivis sont récupérés du serveur.
// Si le serveur ne répond pas, l'app continue normalement avec le téléphone.
const KEY = 'optimeal.follows.v2'; // garder les données existantes, séparées par compte
const SYNC_KEY = 'optimeal.follows.synced'; // ce téléphone a déjà été synchronisé avec le serveur
const BASE = '/api/v1/follows';

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

// ---------- Serveur (jamais bloquant) ----------

// La liste du serveur, ou null s'il ne répond pas correctement.
async function lireServeur(): Promise<Follow[] | null> {
  try {
    const reponse = await api<{ item?: { items?: Follow[] } }>(BASE);
    const items = reponse?.item?.items;
    return Array.isArray(items) ? items : null;
  } catch {
    return null;
  }
}

function envoyerServeur(f: Follow) {
  if (!f.product_id) return; // ancien suivi pas encore relié à un produit : il reste sur le téléphone
  void Promise.resolve(api(BASE, {
    method: 'PUT',
    body: JSON.stringify({ product_id: f.product_id, retailer: f.retailer, name: f.name, since: f.since }),
  })).catch(() => {});
}

function retirerServeur(productId: string) {
  void Promise.resolve(api(`${BASE}/${encodeURIComponent(productId)}`, { method: 'DELETE' })).catch(() => {});
}

// Une seule fois par compte sur ce téléphone :
//   - téléphone vide et serveur rempli (réinstallation, nouveau téléphone) -> on récupère le serveur ;
//   - sinon -> on envoie au serveur les suivis du téléphone.
async function synchroniserUneFois(userId: string, local: Follow[]): Promise<Follow[]> {
  if (await readAccountJSON<boolean>(userId, SYNC_KEY, false)) return local;
  const serveur = await lireServeur();
  if (serveur === null) return local; // serveur indisponible : on réessaiera la prochaine fois
  if (local.length === 0 && serveur.length > 0) {
    const recuperes = await updateAccountJSON<Follow[]>(userId, KEY, [],
      current => (current.length === 0 ? serveur : current));
    await writeAccountJSON(userId, SYNC_KEY, true);
    return recuperes;
  }
  const surServeur = new Set(serveur.map(followKey));
  local.filter(f => f.product_id && !surServeur.has(f.product_id)).forEach(envoyerServeur);
  await writeAccountJSON(userId, SYNC_KEY, true);
  return local;
}

// ---------- Fonctions utilisées par useFollows (mêmes noms et mêmes règles qu'avant) ----------

export async function getFollows(userId: LocalAccount, offers: Offer[] = []): Promise<Follow[]> {
  const list = await readAccountJSON<Follow[]>(userId, KEY, []);
  if (!Array.isArray(list)) throw new Error('Données de suivi invalides.');
  const next = reconcileFollows(list, offers);
  const local = JSON.stringify(next) === JSON.stringify(list) ? list
    // Recalculer dans la file d'écritures pour ne pas perdre une cloche touchée entre-temps.
    : await updateAccountJSON<Follow[]>(userId, KEY, [], current => reconcileFollows(current, offers));
  return userId ? synchroniserUneFois(userId, local) : local;
}

export async function unfollow(userId: LocalAccount, key: string) {
  const list = await updateAccountJSON<Follow[]>(userId, KEY, [], current => current.filter(f => followKey(f) !== key));
  retirerServeur(key);
  return list;
}

export async function toggleFollow(userId: LocalAccount, offer: Offer): Promise<Follow[]> {
  let ajoute = null as Follow | null; // rempli dans la mise à jour ci-dessous
  const list = await updateAccountJSON<Follow[]>(userId, KEY, [], current => {
    const reconciled = reconcileFollows(current, [offer]);
    if (reconciled.some(f => followsOffer(f, offer))) { ajoute = null; return reconciled.filter(f => !followsOffer(f, offer)); }
    ajoute = { product_id: offer.product_id, retailer: offer.retailer,
      name: offer.product_name, since: new Date().toISOString() };
    return [...reconciled, ajoute];
  });
  if (ajoute) envoyerServeur(ajoute); else retirerServeur(offer.product_id);
  return list;
}

export function followedOnPromo(follows: Follow[], offers: Offer[]) {
  return new Set(offers.filter(o => follows.some(f => followsOffer(f, o)) && isOnPromo(o))
    .map(o => o.product_id)).size;
}