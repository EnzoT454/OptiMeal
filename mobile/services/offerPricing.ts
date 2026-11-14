import type { Offer } from '../types/api';

export function hasActivePromotion(offer: Offer): boolean {
  return offer.promotion.status === 'active' && offer.promo_price?.amount != null;
}

// Prix d'une unité de vente. La condition doit être affichée avec ce montant.
export function currentOfferPrice(offer: Offer): string | null {
  return hasActivePromotion(offer) ? offer.promo_price!.amount : offer.price.amount;
}

export function quantityPriceCondition(offer: Offer): string | null {
  if (!hasActivePromotion(offer) || offer.quantity_limit == null || offer.price_after_limit == null) return null;
  const price = Number(offer.price_after_limit).toFixed(2).replace('.', ',');
  return `Limite de ${offer.quantity_limit} unité${offer.quantity_limit > 1 ? 's' : ''}, puis ${price} $ par unité`;
}
