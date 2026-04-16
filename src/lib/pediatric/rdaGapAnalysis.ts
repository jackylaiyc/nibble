/**
 * Given a set of meals logged for one day and an age bucket,
 * compute coverage percentages per nutrient vs. the age-appropriate RDA.
 *
 * This is pure math — no AI. Results are deterministic from inputs,
 * so we should cache downstream (never re-Geminiify gap analysis).
 */

import type { AgeBucket } from "./ageBucket";
import { RDA, type Nutrient, type RdaTarget } from "./rdaTables";

/** A simplified totals view that sums the nutrient fields present on any meal. */
export interface NutrientTotals {
  calories?: number;
  protein?: number;
  fat?: number;
  carbs?: number;
  fiber?: number;
  iron?: number;
  zinc?: number;
  calcium?: number;
  vitaminD?: number;
  vitaminA?: number;
  vitaminC?: number;
  dha?: number;
  sodium?: number;
  sugar?: number;
}

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
  const keys: (keyof NutrientTotals)[] = [
    "calories", "protein", "fat", "carbs", "fiber",
    "iron", "zinc", "calcium", "vitaminD", "vitaminA",
    "vitaminC", "dha", "sodium", "sugar",
  ];
  for (const k of keys) {
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
  (Object.keys(targets) as Nutrient[]).forEach((nutrient) => {
    const target = targets[nutrient];
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
