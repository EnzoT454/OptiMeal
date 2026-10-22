import { RecipeDifficulty, RecipeIngredient } from '../types/api';

export const difficultyLabels: Record<RecipeDifficulty, string> = { easy: 'Facile', medium: 'Moyenne', hard: 'Difficile' };

export function parseQuantityUnit(value: string): Pick<RecipeIngredient, 'quantity' | 'unit'> {
  const match = /^(0|[1-9]\d*)(?:([.,]\d+))?\s*(g|ml|unit|unités?|pièces?)$/iu.exec(value.trim());
  if (!match) throw new Error('Indique la quantité et l’unité, par exemple 300 g, 150 ml ou 2 unit.');
  const quantity = match[1] + (match[2]?.replace(',', '.') ?? '');
  const rawUnit = match[3].toLocaleLowerCase('fr');
  const unit = rawUnit === 'g' || rawUnit === 'ml' ? rawUnit : 'unit';
  if (!/[1-9]/.test(quantity) || (unit === 'unit' && /[1-9]/.test(quantity.split('.')[1] ?? ''))) {
    throw new Error('Les quantités doivent être positives. Les pièces sont entières.');
  }
  return { quantity, unit };
}

export function recipeBadges(recipe: { total_time_minutes: number; tags?: string[] }): string[] {
  const tags = (recipe.tags ?? []).filter(tag => tag.toLocaleLowerCase('fr') !== 'rapide');
  return recipe.total_time_minutes <= 30 ? ['Rapide', ...tags] : tags;
}
