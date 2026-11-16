import type { NavigatorScreenParams } from '@react-navigation/native';
import type { ShoppingPeriod } from './shoppingLists';
import type { Circular, Offer } from './api';

export type RecipeStackParams = {
  List: undefined; Add: undefined; ManualEntry: undefined; Detail: { id: string }; Editor: { id?: string } | undefined;
};

export type PromoStackParams = {
  List: undefined; Detail: { offer: Offer }; Circulars: undefined; Circular: { circular: Circular }; Cook: undefined; Follows: undefined;
};

export type HomeStackParams = {
  Home: undefined;
  Paramètres: undefined;
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
  Lists: undefined; CreateList: { period?: ShoppingPeriod } | undefined; RecoverLocal: undefined; ShoppingDetail: { id: string; revision?: number };
  Templates: undefined; TemplateDetail: { id: string };
  ReuseList: { id: string; revision: number; mode: 'copy' | 'template' };
  Revisions: { id: string };
};
