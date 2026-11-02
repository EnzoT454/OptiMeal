import { api } from "../services/api";
import type { MealPlan, MealPlanEntry, MealType } from "../types/api";

// ---- Les 4 repas ----
export const MEALS: MealType[] = ["dejeuner", "diner", "souper", "collation"];

export const MEAL_LABELS: Record<MealType, string> = {
  dejeuner: "Déjeuner",
  diner: "Dîner",
  souper: "Souper",
  collation: "Collation",
};

export const MEAL_COLORS: Record<MealType, { bg: string; text: string }> = {
  dejeuner: { bg: "#FAEEDA", text: "#633806" },
  diner: { bg: "#E6F1FB", text: "#0C447C" },
  souper: { bg: "#EAF3DE", text: "#27500A" },
  collation: { bg: "#FBEAF0", text: "#72243E" },
};

// ---- Dates ----
const DAY_NAMES = ["DIM.", "LUN.", "MAR.", "MER.", "JEU.", "VEN.", "SAM."];
const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet",
  "août", "septembre", "octobre", "novembre", "décembre"];

export function recipeUnavailable(entry: Pick<MealPlanEntry, 'recipe_name' | 'free_text'>): boolean {
  return entry.recipe_name === null && entry.free_text === null;
}

export function mealName(entry: Pick<MealPlanEntry, 'recipe_name' | 'free_text'>): string {
  return entry.recipe_name ?? entry.free_text ?? 'Recette indisponible';
}

// Date → "2026-11-02" (en heure locale, pas UTC)
export function toISODate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const j = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${j}`;
}

// "2026-11-02" → Date (en heure locale)
export function fromISODate(s: string): Date {
  const [a, m, j] = s.split("-").map(Number);
  return new Date(a, m - 1, j);
}

export function addDays(d: Date, n: number): Date {
  const copie = new Date(d);
  copie.setDate(copie.getDate() + n);
  return copie;
}

// Le lundi de la semaine d'une date, à minuit
export function mondayOf(d: Date): Date {
  const jour = d.getDay(); // 0 = dimanche
  const ecart = jour === 0 ? -6 : 1 - jour;
  const lundi = addDays(d, ecart);
  return new Date(lundi.getFullYear(), lundi.getMonth(), lundi.getDate());
}

export function dayName(d: Date): string {
  return DAY_NAMES[d.getDay()];
}

const DAY_FULL = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

// "Mardi 3 novembre"
export function dayFullName(d: Date): string {
  return `${DAY_FULL[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

// "2 – 8 novembre" ou "30 novembre – 6 décembre"
export function weekLabel(lundi: Date): string {
  const dimanche = addDays(lundi, 6);
  if (lundi.getMonth() === dimanche.getMonth()) {
    return `${lundi.getDate()} – ${dimanche.getDate()} ${MONTHS[dimanche.getMonth()]}`;
  }
  return `${lundi.getDate()} ${MONTHS[lundi.getMonth()]} – ${dimanche.getDate()} ${MONTHS[dimanche.getMonth()]}`;
}

// ---- Appels au backend (/api/v1/plans) ----
// Le backend répond toujours { item: ..., meta: ... } : on ne garde que "item".
type Reponse<T> = { item: T };

export async function getPlan(weekStart: string): Promise<MealPlan> {
  const res = await api<Reponse<MealPlan>>(`/api/v1/plans?week=${weekStart}`);
  return res.item;
}

// is_leftover est facultatif : si l'écran ne le donne pas, c'est un repas normal.
// recipe_name et recipe_image_url sont ignorés : c'est le backend qui les retrouve.
type NouveauRepas = Omit<MealPlanEntry, "id" | "is_leftover" | "recipe_image_url"> & {
  is_leftover?: boolean;
  recipe_image_url?: string | null;
};

export async function addEntry(entry: NouveauRepas): Promise<MealPlanEntry> {
  // On n'envoie PAS recipe_name : c'est le backend qui retrouve le nom de la recette.
  const corps = {
    date: entry.date,
    meal: entry.meal,
    recipe_id: entry.recipe_id,
    free_text: entry.free_text,
    servings: entry.servings,
    is_leftover: entry.is_leftover ?? false,
  };
  const res = await api<Reponse<MealPlanEntry>>("/api/v1/plans/entries", {
    method: "POST",
    body: JSON.stringify(corps),
  });
  return res.item;
}

// On envoie seulement ce qui change : { servings: 4 } ou { date: "2026-11-05", meal: "diner" }
export type Changements = { servings?: number; date?: string; meal?: MealType };

export async function updateEntry(id: string, changements: Changements): Promise<MealPlanEntry> {
  const res = await api<Reponse<MealPlanEntry>>(`/api/v1/plans/entries/${id}`, {
    method: "PATCH",
    body: JSON.stringify(changements),
  });
  return res.item;
}

export async function removeEntry(id: string): Promise<void> {
  await api<void>(`/api/v1/plans/entries/${id}`, { method: "DELETE" });
}
