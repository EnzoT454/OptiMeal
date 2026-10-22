export type RecipeUnit = 'g' | 'ml' | 'unit';
export type RecipeDifficulty = 'easy' | 'medium' | 'hard';
export interface RecipeIngredient {
  ingredient_id: string; quantity: string; unit: RecipeUnit; preparation: string | null;
}
export interface RecipeWrite {
  name: string; description: string; servings: number;
  prep_time_minutes: number; cook_time_minutes: number; total_time_minutes: number;
  image_url: string | null; ingredients: RecipeIngredient[];
  difficulty: RecipeDifficulty | null; tags: string[];
  instructions: { position: number; text: string }[];
}
export interface RecipeSummary {
  id: string; name: string; description: string; servings: number; total_time_minutes: number;
  image_url: string | null; review_required: boolean; is_owned: boolean; is_favorite: boolean;
  difficulty: RecipeDifficulty | null; tags: string[];
}
export type Recipe = RecipeSummary & RecipeWrite;
export interface Page<T> { items: T[]; total: number; limit: number; offset: number; }
export interface Detail<T> { item: T; }
export interface Ingredient { id: string; name: string; category: string; aliases: string[]; }
export interface Profile { id: string; email: string | null; display_name: string | null; created_at: string; }
