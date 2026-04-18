import type { MealRecord, FoodItem } from "@/stores/mealStore";

/**
 * Derive a de-duplicated list of the caregiver's most-recently-logged foods
 * across every saved meal. For each unique food (keyed by `nameEn` when
 * present, else `name`) we keep only the MOST RECENT instance — so when
 * the parent re-logs an oatmeal, the "recent foods" chip updates its
 * portion to reflect the latest version.
 *
 * Pure math, no state — safe to call in a useMemo on the dashboard.
 */

export interface RecentFood {
  /** Most-recent copy of the food item, ready to be re-logged as a meal. */
  food: FoodItem;
  /** When this food was last logged (ISO date "YYYY-MM-DD"). */
  lastDate: string;
  /** When this food was last logged (HH:MM). */
  lastTime: string;
}

export function buildRecentFoods(
  meals: MealRecord[],
  limit = 8,
): RecentFood[] {
  // Walk newest-first so the "most recent" instance naturally wins dedupe.
  const sortedMeals = [...meals].sort((a, b) =>
    `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`),
  );

  const seen = new Set<string>();
  const out: RecentFood[] = [];

  for (const meal of sortedMeals) {
    for (const food of meal.foods) {
      const key = (food.nameEn || food.name).toLowerCase().trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({ food, lastDate: meal.date, lastTime: meal.time });
      if (out.length >= limit) return out;
    }
  }
  return out;
}
