import type { ShoppingItemRead, ShoppingPeriod, ShoppingScenario } from '../types/shoppingLists';

const months = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];
export function calendarProductsName(period: ShoppingPeriod): string {
  const start = new Date(`${period.start_date}T12:00:00`), end = new Date(`${period.end_date}T12:00:00`);
  const crossYear = start.getFullYear() !== end.getFullYear();
  const left = `${start.getDate()}${start.getMonth() !== end.getMonth() || crossYear ? ` ${months[start.getMonth()]}` : ''}${crossYear ? ` ${start.getFullYear()}` : ''}`;
  return `Épicerie ${left}-${end.getDate()} ${months[end.getMonth()]}${crossYear ? ` ${end.getFullYear()}` : ''}`;
}

// Les UUID du devis sont temporaires. L'ingrédient est la clé de regroupement du moteur.
export function calendarNeed(item: ShoppingItemRead, scenario?: ShoppingScenario | null) {
  return item.ingredient_id ? scenario?.needs.find(need => need.ingredient_id === item.ingredient_id) : undefined;
}

export function calendarProductSelection(items: ShoppingItemRead[], scenario: ShoppingScenario) {
  return {
    included: items,
    unpriced: items.filter(item => !calendarNeed(item, scenario)?.lines.length),
  };
}
