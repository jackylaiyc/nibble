/**
 * Given a set of meals logged for one day and an age bucket,
 * compute coverage percentages per nutrient vs. the age-appropriate RDA.
 *
 * This is pure math — no AI. Results are deterministic from inputs,
 * so we should cache downstream (never re-Geminiify gap analysis).
 */

import type { AgeBucket } from "./ageBucket";
import { RDA, type Nutrient, type RdaTarget } from "./rdaTables";

/**
 * A simplified totals view that sums the nutrient fields present on any meal.
 * Derived from the `Nutrient` union so adding a new nutrient auto-widens this
 * type; callers treat absent fields as "not tracked for this meal/stage".
 */
export type NutrientTotals = Partial<Record<Nutrient, number>>;

// Explicit list of keys to iterate when summing — keeps `sumMeals` cheap.
const NUTRIENT_KEY_LIST: Nutrient[] = [
  "calories", "protein", "fat", "carbs", "fiber",
  "iron", "zinc", "calcium", "vitaminD", "vitaminA",
  "vitaminC", "dha", "sodium", "sugar",
  "folate", "choline", "iodine", "caffeine", "alcohol",
];

export interface CoverageCell {
  nutrient: Nutrient;
  actual: number;
  target: RdaTarget;
  /** 0-1+ (can exceed 1 when over target). */
  coverage: number;
  status: "below" | "onTarget" | "over" | "unknown";
}

export function sumMeals(meals: NutrientTotals[]): NutrientTotals {
  const sum: NutrientTotals = {};
  for (const k of NUTRIENT_KEY_LIST) {
    let total = 0;
    let anySet = false;
    for (const meal of meals) {
      const v = meal[k];
      if (typeof v === "number" && !Number.isNaN(v)) {
        total += v;
        anySet = true;
      }
    }
    if (anySet) sum[k] = total;
  }
  return sum;
}

export function computeCoverage(
  totals: NutrientTotals,
  bucket: AgeBucket,
): CoverageCell[] {
  const targets = RDA[bucket];
  const cells: CoverageCell[] = [];
  // Only iterate nutrients this life stage tracks. Absent keys are skipped.
  (Object.keys(targets) as Nutrient[]).forEach((nutrient) => {
    const target = targets[nutrient];
    if (!target) return; // shouldn't happen given Object.keys source, but belt-and-braces for Partial rows
    const actual = totals[nutrient];
    if (typeof actual !== "number") {
      cells.push({
        nutrient,
        actual: 0,
        target,
        coverage: 0,
        status: "unknown",
      });
      return;
    }
    const coverage = target.value === 0 ? 0 : actual / target.value;
    const status: CoverageCell["status"] = target.isUpperLimit
      ? coverage > 1
        ? "over"
        : coverage > 0.8
          ? "onTarget"
          : "below"
      : coverage >= 0.9
        ? coverage > 1.5
          ? "over"
          : "onTarget"
        : "below";
    cells.push({ nutrient, actual, target, coverage, status });
  });
  return cells;
}

/**
 * Returns the top nutrient gaps for a cute summary line:
 * "Ethan needs more iron and zinc today."
 */
export function topGaps(
  coverage: CoverageCell[],
  limit = 3,
): CoverageCell[] {
  return coverage
    .filter((c) => !c.target.isUpperLimit && c.status === "below" && c.coverage < 0.75)
    .sort((a, b) => a.coverage - b.coverage)
    .slice(0, limit);
}

export function topOverages(
  coverage: CoverageCell[],
  limit = 2,
): CoverageCell[] {
  return coverage
    .filter((c) => c.target.isUpperLimit && c.status === "over")
    .sort((a, b) => b.coverage - a.coverage)
    .slice(0, limit);
}
