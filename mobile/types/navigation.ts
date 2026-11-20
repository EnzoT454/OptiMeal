import type { NavigatorScreenParams } from '@react-navigation/native';
import type { ShoppingListKind, ShoppingPeriod } from './shoppingLists';
import type { Circular, Offer } from './api';

export type RecipeStackParams = {
  List: undefined; Detail: { id: string }; Editor: { id?: string } | undefined;
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
  Detail: { id: string };
  Editor: { id?: string } | undefined;
  Exclusions: undefined;
};

export type MainTabParams = {
  Accueil: undefined;
  Recettes: NavigatorScreenParams<RecipeStackParams> | undefined;
  // vue = "epicerie" pour ouvrir directement la liste d'achats (depuis l'Accueil)
  Calendrier: { vue?: "repas" | "epicerie" } | undefined;
  Promos: undefined;
  Liste: NavigatorScreenParams<ListStackParams> | undefined;
};

export type ListStackParams = {
  Lists: { section?: 'recent' | 'saved' } | undefined; CreateList: { period?: ShoppingPeriod; kind?: ShoppingListKind } | undefined; ShoppingDetail: { id: string };
  AllLists: { section?: 'recent' | 'saved' } | undefined; Comparison: { id: string }; History: undefined; TemplateDetail: { id: string };
  ReuseList: { id: string; revision: number; mode: 'copy' | 'template' };
};
