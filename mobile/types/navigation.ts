import type { Offer, Retailer } from './api';

export type RecipeStackParams = {
  List: undefined; Add: undefined; ManualEntry: undefined; Detail: { id: string }; Editor: { id?: string } | undefined;
};

export type PromoStackParams = {
  List: undefined; Detail: { offer: Offer }; Circulars: undefined; Circular: { retailer: Retailer };
};

export type MainTabParams = {
  Accueil: undefined;
  Recettes: undefined;
  Calendrier: undefined;
  Promos: undefined;
  Paramètres: undefined;
};