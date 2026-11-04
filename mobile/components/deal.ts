import type { Offer } from '../types/api';

// Couleur selon la force du rabais : du rouge foncé (gros rabais) au jaune (petit rabais).
// background/color : l'étiquette « −50 % » ; text : couleur de « Économisez … » sur fond blanc
// (toujours assez foncée pour rester lisible, même pour le jaune).
// label : aucun mot pour l'instant (le pourcentage et l'économie suffisent).
export function deal(percent: number | null) {
  if (percent == null) return null;
  if (percent >= 50) return { label: null, background: '#9f1a10', color: 'white', text: '#9f1a10' };   // rouge foncé
  if (percent >= 35) return { label: null, background: '#d1361b', color: 'white', text: '#b42318' };   // rouge
  if (percent >= 20) return { label: null, background: '#f28a2e', color: '#3b1a00', text: '#b54708' };   // orange
  return { label: null, background: '#fcd34d', color: '#5c3a00', text: '#8a5a00' };                   // jaune
}

// Produit vendu au poids (format « 1 kg » ou « 1 lb ») : le prix et l'économie sont « par kg » ou « par lb ».
export function perWeight(offer: Offer) {
  const unit = offer.format.unit_raw?.toLowerCase();
  return (unit === 'kg' || unit === 'lb') && Number(offer.format.quantity) === 1 ? ` / ${unit}` : '';
}

// Économie en dollars : prix de base − prix promo (null s'il n'y a pas de vraie économie).
export function saving(offer: Offer) {
  const regular = Number(offer.price.amount);
  const promo = Number(offer.promo_price?.amount);
  if (!regular || !promo || promo >= regular) return null;
  return regular - promo;
}