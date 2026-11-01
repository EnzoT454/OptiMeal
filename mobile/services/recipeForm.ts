import { RecipeDifficulty, RecipeIngredient, RecipeUnit } from '../types/api';

export const difficultyLabels: Record<RecipeDifficulty, string> = { easy: 'Facile', medium: 'Moyenne', hard: 'Difficile' };

export const recipeUnits: { value: RecipeUnit; label: string; accessibilityLabel: string }[] = [
  { value: 'g', label: 'g', accessibilityLabel: 'Grammes' },
  { value: 'ml', label: 'ml', accessibilityLabel: 'Millilitres' },
  { value: 'unit', label: 'unité', accessibilityLabel: 'Unités (pièces entières)' },
];

export function parseIngredientQuantity(value: string, unit: RecipeUnit | null): Pick<RecipeIngredient, 'quantity' | 'unit'> {
  if (!unit || !recipeUnits.some(option => option.value === unit)) throw new Error('Choisis une unité pour chaque ingrédient.');
  const match = /^(0|[1-9]\d*)(?:([.,]\d+))?$/.exec(value.trim());
  if (!match) throw new Error('Indique une quantité numérique, par exemple 300 ou 12,5.');
  const quantity = match[1] + (match[2]?.replace(',', '.') ?? '');
  if (!/[1-9]/.test(quantity) || (unit === 'unit' && /[1-9]/.test(quantity.split('.')[1] ?? ''))) {
    throw new Error('Les quantités doivent être positives. Les pièces sont entières.');
  }
  return { quantity, unit };
}

export function recipeBadges(recipe: { total_time_minutes: number; tags?: string[] }): string[] {
  const tags = (recipe.tags ?? []).filter(tag => tag.toLocaleLowerCase('fr') !== 'rapide');
  return recipe.total_time_minutes <= 30 ? ['Rapide', ...tags] : tags;
}
