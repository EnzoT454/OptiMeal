import type { Circular, Offer } from './api';

export type RecipeStackParams = {
  List: undefined; Add: undefined; ManualEntry: undefined; Detail: { id: string }; Editor: { id?: string } | undefined;
};

export type PromoStackParams = {
  List: undefined; Detail: { offer: Offer }; Circulars: undefined; Circular: { circular: Circular }; Cook: undefined; Follows: undefined;
  // La recette ouverte depuis « Cuisiner avec les promos » : la flèche retour revient aux promos.
  // ("Detail" est déjà pris par le détail d'une promo, d'où le nom "Recette".)
  Recette: { id: string };
  Editor: { id?: string } | undefined;
};

export type HomeStackParams = {
  Home: undefined;
  Paramètres: undefined;
  // La recette ouverte depuis l'Accueil : même écran que dans Recettes,
  // mais la flèche retour ramène à l'Accueil.
  Detail: { id: string };
  Editor: { id?: string } | undefined;
};

export type MainTabParams = {
  Accueil: undefined;
  Recettes: undefined;
  // vue = "epicerie" pour ouvrir directement la liste d'achats (depuis l'Accueil)
  Calendrier: { vue?: "repas" | "epicerie" } | undefined;
  Promos: undefined;
  Liste: undefined;
};

export type ListStackParams = {
  Lists: undefined; CreateList: undefined; ShoppingDetail: { id: string };
};