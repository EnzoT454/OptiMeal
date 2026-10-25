import { api } from '../services/api';
import type { Offer, Page, Retailer } from '../types/api';

// Fonctions partagées par les écrans Promos (liste, détail, circulaires).

// Pour tester avec des promos passées, mettre une date ici (ex. '2026-10-05').
// Laisser undefined pour utiliser la date du jour.
export const ON_DATE: string | undefined = undefined;

// Les promos en cours, telles que renvoyées par le backend.
export async function fetchPromos() {
  const params = new URLSearchParams({ promotion_only: 'true', limit: '100' });
  if (ON_DATE) params.set('on_date', ON_DATE);
  const page = await api<Page<Offer>>('/api/v1/offers?' + params);
  return page.items;
}

// Présentation de chaque magasin dans les circulaires (couleur et slogan de la maquette).
export const CIRCULAR_STYLE: Record<Retailer, { color: string; slogan: string }> = {
  maxi: { color: '#fff1d6', slogan: 'Les petits prix de la semaine' },
  metro: { color: '#edf5ec', slogan: 'De bonnes idées pour vos repas' },
  superc: { color: '#f4f0fa', slogan: 'Des aubaines tous les jours' },
};
export const RETAILERS: { id: Retailer; name: string }[] = [
  { id: 'maxi', name: 'Maxi' }, { id: 'metro', name: 'Metro' }, { id: 'superc', name: 'Super C' },
];
const MONTHS: string[] = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

export function storeName(retailer: Retailer) {
  return RETAILERS.find(r => r.id === retailer)?.name ?? retailer;
}
export function money(amount: string | number | null | undefined) {
  return amount == null ? '—' : `${Number(amount).toFixed(2).replace('.', ',')} $`;
}
// '2026-10-07' → '7 octobre' (sans passer par Date, pour éviter un décalage de fuseau horaire)
export function longDate(value: string | null | undefined) {
  if (!value) return null;
  const [, month, day] = value.split('-').map(Number);
  return `${day} ${MONTHS[month - 1]}`;
}
// Prix payé aujourd'hui : le prix promo s'il existe, sinon le prix de base.
export function currentPrice(offer: Offer) {
  return offer.promo_price?.amount ?? offer.price.amount;
}
export function discount(offer: Offer) {
  const regular = Number(offer.price.amount);
  const promo = Number(offer.promo_price?.amount);
  if (!regular || !promo || promo >= regular) return null;
  return Math.round((1 - promo / regular) * 100);
}
export function formatText(offer: Offer) {
  const { quantity, unit_raw } = offer.format;
  return quantity && unit_raw ? `${quantity.replace('.', ',')} ${unit_raw}` : null;
}
// Prix au kilo, au litre ou à l'unité, pour comparer des formats différents.
export function unitPrice(offer: Offer) {
  const price = Number(currentPrice(offer));
  const quantity = Number(offer.format.quantity);
  if (!price || !quantity) return null;
  switch (offer.format.unit_raw?.toLowerCase()) {
    case 'g': return `${money(price / quantity * 1000)} / kg`;
    case 'kg': return `${money(price / quantity)} / kg`;
    case 'lb': return `${money(price / (quantity * 0.4536))} / kg`;
    case 'ml': return `${money(price / quantity * 1000)} / L`;
    case 'l': return `${money(price / quantity)} / L`;
    case 'un': return quantity > 1 ? `${money(price / quantity)} / unité` : null;
    default: return null;
  }
}

// Période couverte par plusieurs promos : '1 – 28 octobre' ou '28 sept. – 3 octobre'.
export function dateRange(offers: Offer[]) {
  const starts = offers.map(o => o.promotion.valid_from).filter((d): d is string => !!d).sort();
  const ends = offers.map(o => o.promotion.valid_to).filter((d): d is string => !!d).sort();
  const start = starts[0];
  const end = ends[ends.length - 1];
  if (!start || !end) return end ? `Jusqu’au ${longDate(end)}` : 'Dates non indiquées';
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  return `${sameMonth ? Number(start.slice(8)) : longDate(start)} – ${longDate(end)}`;
}