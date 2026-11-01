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

// Promos : une offre renvoyée par GET /api/v1/offers (montants en texte, ex. "2.49").
export type Retailer = 'maxi' | 'metro' | 'superc';
export interface Price {
  kind: 'commercial' | 'declared' | 'estimated' | 'unknown';
  currency: 'CAD'; amount: string | null; min_amount: string | null; max_amount: string | null;
}
export interface Offer {
  id: string; product_id: string; ingredient_id: string; product_name: string;
  retailer: Retailer; store_id: string | null; external_store_id: string | null; external_product_id: string;
  format: { quantity: string | null; unit_raw: string | null };
  price: Price;              // prix de base
  promo_price: Price | null; // prix en promotion
  category_id: number | null;
  retrieved_at: string | null;
  image_url: string | null;    // lien de la photo du produit (null si aucune)
  image_source: string | null; // provenance de la photo (ex. « superc »)
  promotion: {
    declared: boolean | null; valid_from: string | null; valid_to: string | null;
    status: 'active' | 'expired' | 'upcoming' | 'unverifiable' | 'not_promotion' | 'unknown';
    evaluated_on: string;
  };
  source: { kind: string; url: string | null };
}
// Circulaire de la semaine d'un magasin : GET /api/v1/circulars (pages = liens des images, dans l'ordre).
export interface Circular {
  retailer: Retailer; valid_from: string; valid_to: string;
  page_count: number; pages: string[]; imported_at: string;
}

// ---- Calendrier (planification des repas) ----
export type MealType = "dejeuner" | "diner" | "souper" | "collation";

export type MealPlanEntry = {
  id: string;
  date: string;               // "AAAA-MM-JJ"
  meal: MealType;
  recipe_id: RecipeSummary["id"] | null;
  recipe_name: string | null;
  free_text: string | null;   // …ou un texte libre : « Restes », « Resto »
  servings: number;
};

export type MealPlan = {
  week_start: string;         // le lundi, "AAAA-MM-JJ"
  entries: MealPlanEntry[];
};