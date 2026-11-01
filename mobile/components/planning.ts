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

// "2 – 8 novembre" ou "30 novembre – 6 décembre"
export function weekLabel(lundi: Date): string {
  const dimanche = addDays(lundi, 6);
  if (lundi.getMonth() === dimanche.getMonth()) {
    return `${lundi.getDate()} – ${dimanche.getDate()} ${MONTHS[dimanche.getMonth()]}`;
  }
  return `${lundi.getDate()} ${MONTHS[lundi.getMonth()]} – ${dimanche.getDate()} ${MONTHS[dimanche.getMonth()]}`;
}

// ---- FAUSSES DONNÉES (à remplacer par l'API plus tard) ----
let fakeEntries: MealPlanEntry[] = [
  { id: "e1", date: "2026-10-26", meal: "dejeuner", recipe_id: null, recipe_name: null, free_text: "Gruau aux fruits", servings: 2 },
  { id: "e2", date: "2026-10-26", meal: "souper", recipe_id: "null", recipe_name: "Curry de poulet", free_text: null, servings: 2 },
  { id: "e3", date: "2026-10-27", meal: "diner", recipe_id: null, recipe_name: null, free_text: "Restes de curry", servings: 1 },
  { id: "e4", date: "2026-10-27", meal: "souper", recipe_id: "null", recipe_name: "Pâtes au pesto", free_text: null, servings: 2 },
  { id: "e5", date: "2026-10-29", meal: "souper", recipe_id: "null", recipe_name: "Tacos", free_text: null, servings: 2 },
  { id: "e6", date: "2026-11-03", meal: "souper", recipe_id: "null", recipe_name: "Salade croquante", free_text: null, servings: 2 },
];
let nextId = 100;

// Les fonctions sont "async" : quand on branchera l'API, on mettra
// un fetch à l'intérieur, et l'écran n'aura pas à changer.
export async function getPlan(weekStart: string): Promise<MealPlan> {
  const fin = toISODate(addDays(fromISODate(weekStart), 6));
  const entries = fakeEntries.filter((e) => e.date >= weekStart && e.date <= fin);
  return { week_start: weekStart, entries };
}

export async function addEntry(entry: Omit<MealPlanEntry, "id">): Promise<MealPlanEntry> {
  const nouveau = { ...entry, id: `e${nextId++}` };
  fakeEntries = [...fakeEntries, nouveau];
  return nouveau;
}

export async function removeEntry(id: string): Promise<void> {
  fakeEntries = fakeEntries.filter((e) => e.id !== id);
}