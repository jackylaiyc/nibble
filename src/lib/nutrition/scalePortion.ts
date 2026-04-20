import type { FoodItem, PortionUnit } from "@/stores/mealStore";

/**
 * Scaling helper — when the user says "I only ate half of that", we need
 * to re-scale every nutrient field by the same grams ratio as the portion
 * change. Runs fully client-side so the review UI updates instantly; no
 * round-trip to Gemini is needed because the LLM-estimated nutrient density
 * (per-gram) is assumed unchanged by a portion tweak.
 *
 * Assumes `gramsEstimate` is the source of truth for scaling. Callers are
 * responsible for deriving the new grams from the new amount+unit using
 * whatever unit heuristic is appropriate for the dish (we don't try to
 * convert units here — a "tbsp" of olive oil is not a "tbsp" of honey).
 */

const NUTRIENT_FIELDS: (keyof FoodItem["nutrients"])[] = [
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
  "folate",
  "choline",
  "iodine",
  "caffeine",
  "alcohol",
];

/**
 * Return a shallow-cloned FoodItem with every nutrient scaled by
 * `newGrams / oldGrams`. If `oldGrams` is zero or not finite, returns the
 * food unchanged (can't scale an undefined baseline).
 *
 * `newAmount` and `newUnit` are optional display fields — pass them when
 * the user picked a new unit in the editor so the card label matches what
 * they actually chose. The scaling math only depends on grams.
 */
export function scaleFoodPortion(
  food: FoodItem,
  newGrams: number,
  newAmount?: number,
  newUnit?: PortionUnit,
): FoodItem {
  const oldGrams = food.gramsEstimate;
  if (!Number.isFinite(oldGrams) || oldGrams <= 0 || !Number.isFinite(newGrams) || newGrams < 0) {
    return {
      ...food,
      gramsEstimate: Number.isFinite(newGrams) && newGrams >= 0 ? newGrams : oldGrams,
      portionAmount: newAmount ?? food.portionAmount,
      portionUnit: newUnit ?? food.portionUnit,
    };
  }

  const ratio = newGrams / oldGrams;

  const scaledNutrients: FoodItem["nutrients"] = {};
  for (const k of NUTRIENT_FIELDS) {
    const v = food.nutrients[k];
    if (typeof v === "number" && Number.isFinite(v)) {
      // Keep two decimal places — matches sumFoodTotals rounding so the
      // per-food + totals math stays consistent (no drift from float noise).
      scaledNutrients[k] = Math.round(v * ratio * 100) / 100;
    }
  }

  return {
    ...food,
    gramsEstimate: Math.round(newGrams * 10) / 10,
    portionAmount: newAmount ?? food.portionAmount,
    portionUnit: newUnit ?? food.portionUnit,
    nutrients: scaledNutrients,
  };
}

/**
 * Rough per-unit grams to convert a new amount+unit back into grams.
 * These are deliberately coarse — accurate-enough when the original Gemini
 * estimate was also rough, and we only use them when the user picks a new
 * unit in the portion editor.
 *
 * When the user keeps the same unit (e.g. "3 tbsp" → "2 tbsp"), we derive
 * grams by proportion against the original (amount * gramsPerOld) — that
 * way the per-unit density of the *specific food* is preserved rather than
 * being overwritten by a generic default.
 */
const DEFAULT_GRAMS_PER_UNIT: Record<PortionUnit, number> = {
  g: 1,
  ml: 1, // water-density assumption; fine for broths, juices, milk
  tsp: 5,
  tbsp: 15,
  piece: 50,
};

/**
 * Derive the new grams estimate when the user changes amount and/or unit.
 * Prefers proportional scaling off the original food's own density whenever
 * the unit didn't change; falls back to generic per-unit defaults only
 * when the user switched units.
 */
export function deriveNewGrams(
  food: FoodItem,
  newAmount: number,
  newUnit: PortionUnit,
): number {
  if (!Number.isFinite(newAmount) || newAmount < 0) return food.gramsEstimate;

  if (newUnit === food.portionUnit) {
    // Same unit — proportional to original so we preserve the food's density.
    const origAmount = food.portionAmount;
    if (Number.isFinite(origAmount) && origAmount > 0 && food.gramsEstimate > 0) {
      return (food.gramsEstimate / origAmount) * newAmount;
    }
  }

  // Unit changed (or original had zero grams) — fall back to generic defaults.
  return newAmount * DEFAULT_GRAMS_PER_UNIT[newUnit];
}

export const PORTION_UNITS: PortionUnit[] = ["g", "ml", "tsp", "tbsp", "piece"];
