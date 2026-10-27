import type { Circular, Offer } from './api';

export type RecipeStackParams = {
  List: undefined; Add: undefined; ManualEntry: undefined; Detail: { id: string }; Editor: { id?: string } | undefined;
};

export type PromoStackParams = {
  List: undefined; Detail: { offer: Offer }; Circulars: undefined; Circular: { circular: Circular }; Cook: undefined;
};

export type MainTabParams = {
  Accueil: undefined;
  Recettes: undefined;
  Calendrier: undefined;
  Promos: undefined;
  Paramètres: undefined;
};