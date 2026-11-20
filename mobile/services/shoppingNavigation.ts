import type { NavigatorScreenParams } from '@react-navigation/native';
import type { ListStackParams } from '../types/navigation';

// Destination complète, utilisable même avant le montage du navigateur protégé.
// L’index reste dans la pile pour que Retour ramène aux listes récentes.
export function shoppingListStack(id: string) {
  return { index: 1, routes: [{ name: 'Lists' as const, params: { section: 'recent' as const } }, { name: 'ShoppingDetail' as const, params: { id } }] };
}

export function shoppingListDestination(id: string): NavigatorScreenParams<ListStackParams> {
  return { state: shoppingListStack(id) };
}
