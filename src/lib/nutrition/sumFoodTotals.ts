import type { FoodItem } from "@/stores/mealStore";

/**
 * Re-sum a meal's nutrient totals from its foods[]. Shared by the scan
 * review flow (photo / barcode / search / recent) and the meal detail
 * edit flow so the totals never drift from the foods they're computed from.
 */

export type NutrientTotals = FoodItem["nutrients"];

const NUTRIENT_KEYS: (keyof NutrientTotals)[] = [
  "calories",
  "protein",
  "fat",
  "carbs",
  "fiber",
  "iron",
  "zinc",
  "calcium",
  "vitaminD",
  "vitaminA",
  "vitaminC",
  "dha",
  "sodium",
  "sugar",
];

export function sumFoodTotals(foods: FoodItem[]): NutrientTotals {
  const totals: NutrientTotals = {};
  for (const food of foods) {
    for (const k of NUTRIENT_KEYS) {
      const v = food.nutrients[k];
      if (typeof v === "number" && Number.isFinite(v)) {
        totals[k] = Math.round(((totals[k] ?? 0) + v) * 100) / 100;
      }
    }
  }
  return totals;
}
