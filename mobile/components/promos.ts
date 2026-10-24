import type { Offer, Retailer } from '../types/api';

// Fonctions partagées par les écrans Promos (liste et détail).
export const RETAILERS: { id: Retailer; name: string }[] = [
  { id: 'maxi', name: 'Maxi' }, { id: 'metro', name: 'Metro' }, { id: 'superc', name: 'Super C' },
];
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

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