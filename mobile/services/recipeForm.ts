import { RecipeIngredient, RecipeUnit } from '../types/api';

export const recipeUnits: { value: RecipeUnit; label: string; accessibilityLabel: string }[] = [
  { value: 'g', label: 'g', accessibilityLabel: 'Grammes' },
  { value: 'ml', label: 'ml', accessibilityLabel: 'Millilitres' },
  { value: 'unit', label: 'unité', accessibilityLabel: 'Unités (pièces entières)' },
  { value: 'cup', label: 'tasse (250 ml)', accessibilityLabel: 'Tasse (250 millilitres)' },
  { value: 'tbsp', label: 'cuillère à table (15 ml)', accessibilityLabel: 'Cuillère à table (15 millilitres)' },
  { value: 'tsp', label: 'cuillère à thé (5 ml)', accessibilityLabel: 'Cuillère à thé (5 millilitres)' },
];

export function recipeUnitLabel(unit: RecipeUnit): string {
  return recipeUnits.find(option => option.value === unit)?.label ?? unit;
}

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

export type RecipeStepDraft = { text: string; duration: string };

export function stepDuration(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const minutes = Number(trimmed);
  return Number.isSafeInteger(minutes) && minutes <= 2147483647 ? minutes : null;
}

export function recipeStepTotal(steps: RecipeStepDraft[]): number | null {
  if (!steps.length) return null;
  const durations = steps.map(step => stepDuration(step.duration));
  if (durations.some(duration => duration === null)) return null;
  const total = durations.reduce<number>((sum, duration) => sum + (duration ?? 0), 0);
  return total <= 2147483647 ? total : null;
}

export function prepareRecipeSteps(steps: RecipeStepDraft[]) {
  if (!steps.length) throw new Error('Ajoute au moins une étape.');
  return steps.map((step, index) => {
    if (!step.text.trim()) throw new Error(`Décris l’étape ${index + 1}.`);
    const duration = stepDuration(step.duration);
    if (duration === null) throw new Error(`Indique la durée de l’étape ${index + 1} en minutes entières (0 ou plus).`);
    return { position: index + 1, text: step.text.trim(), duration_minutes: duration };
  });
}
