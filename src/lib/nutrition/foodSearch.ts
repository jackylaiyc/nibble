import chinaFoods from "@/data/china-food-composition.json";
import japanFoods from "@/data/japan-food-composition.json";
import type { FoodItem, PortionUnit } from "@/stores/mealStore";

/**
 * Text-search the local food DBs (China + Japan) and return the top N
 * matches, scored by a simple fuzzy match on the Chinese food name.
 *
 * Returns per-100g nutrition plus a factory for scaling to any portion.
 * Consumed by the manual search + quick-add UI.
 */

export interface FoodSearchResult {
  /** Stable-ish identifier for React keys: "cn-109001" / "jp-01010" */
  id: string;
  /** Chinese display name (always present). */
  name: string;
  /** Score from the fuzzy matcher, exposed for debugging — not rendered. */
  score: number;
  source: "china" | "japan";
  /** Per-100g values already mapped to our FoodItem.nutrients shape. */
  per100g: FoodItem["nutrients"];
}

// ─── number parsing + fuzzy match (same as localFoodDb.ts) ──────────────────

function parseNum(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  const s = String(val).replace(/—|－|Tr|tr|\(|\)|（|）/g, "").trim();
  if (s === "" || s === "-" || s === "…") return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase().trim();
  const t = target.toLowerCase().trim();
  if (!q) return 0;
  if (q === t) return 1.0;
  if (t.includes(q)) return 0.9;
  if (q.includes(t)) return 0.8;
  const qChars = new Set(q);
  const tChars = new Set(t);
  let overlap = 0;
  for (const c of qChars) if (tChars.has(c)) overlap++;
  const ratio = overlap / Math.max(qChars.size, tChars.size);
  return ratio > 0.5 ? ratio * 0.7 : 0;
}

// ─── nutrient mapping ───────────────────────────────────────────────────────

// China DB: vitaminA in mcg RAE; Fe/Zn/Ca in mg; Na in mg; vitaminC in mg.
type ChinaRow = (typeof chinaFoods)[number];
function mapChinaPer100g(row: ChinaRow): FoodItem["nutrients"] {
  const vitA_mcg = parseNum(row.vitaminA);
  return {
    calories: parseNum(row.energyKCal) ?? undefined,
    protein: parseNum(row.protein) ?? undefined,
    fat: parseNum(row.fat) ?? undefined,
    carbs: parseNum(row.CHO) ?? undefined,
    fiber: parseNum(row.dietaryFiber) ?? undefined,
    iron: parseNum(row.Fe) ?? undefined,
    zinc: parseNum(row.Zn) ?? undefined,
    calcium: parseNum(row.Ca) ?? undefined,
    sodium: parseNum(row.Na) ?? undefined,
    vitaminA: vitA_mcg != null ? round(vitA_mcg * 3.33) : undefined, // mcg RAE → IU
    vitaminC: parseNum(row.vitaminC) ?? undefined,
  };
}

// Japan DB: vitaRae in mcg RAE; ca/fe/zn in mg; na in mg.
type JapanRow = (typeof japanFoods)[number];
function mapJapanPer100g(row: JapanRow): FoodItem["nutrients"] {
  const vitA_mcg = parseNum(row.vitaRae);
  return {
    calories: parseNum(row.enercKcal) ?? undefined,
    protein: parseNum(row.prot) ?? undefined,
    fat: parseNum(row.fat) ?? undefined,
    carbs: parseNum(row.chocdf) ?? undefined,
    fiber: parseNum(row.fib) ?? undefined,
    iron: parseNum(row.fe) ?? undefined,
    zinc: parseNum(row.zn) ?? undefined,
    calcium: parseNum(row.ca) ?? undefined,
    sodium: parseNum(row.na) ?? undefined,
    vitaminA: vitA_mcg != null ? round(vitA_mcg * 3.33) : undefined,
    vitaminC: parseNum(row.vitC) ?? undefined,
  };
}

// ─── the search function ────────────────────────────────────────────────────

export function searchAllFoods(query: string, limit = 10): FoodSearchResult[] {
  const q = query.trim();
  if (q.length < 1) return [];

  const results: FoodSearchResult[] = [];

  for (const row of chinaFoods) {
    const score = fuzzyScore(q, row.foodName);
    if (score >= 0.5) {
      results.push({
        id: `cn-${row.foodCode}`,
        name: row.foodName,
        score,
        source: "china",
        per100g: mapChinaPer100g(row),
      });
    }
  }

  for (const row of japanFoods) {
    const score = fuzzyScore(q, row.foodName);
    if (score >= 0.5) {
      results.push({
        id: `jp-${(row as { foodCode?: string }).foodCode ?? row.foodName}`,
        name: row.foodName,
        score,
        source: "japan",
        per100g: mapJapanPer100g(row),
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

// ─── portion scaling ────────────────────────────────────────────────────────

/**
 * Build a FoodItem from a search result + a chosen portion size in grams.
 * Scales every numeric nutrient by grams/100.
 */
export function resultToFoodItem(
  result: FoodSearchResult,
  portionAmount: number,
  portionUnit: PortionUnit,
  gramsEstimate: number,
): FoodItem {
  const scale = gramsEstimate / 100;
  const nutrients: FoodItem["nutrients"] = {};
  for (const k of Object.keys(result.per100g) as (keyof FoodItem["nutrients"])[]) {
    const v = result.per100g[k];
    if (typeof v === "number" && Number.isFinite(v)) {
      nutrients[k] = round(v * scale);
    }
  }
  return {
    name: result.name,
    nameEn: result.name, // local DBs don't have English names; use Chinese as fallback
    portionAmount,
    portionUnit,
    gramsEstimate,
    nutrients,
    allergensPresent: [],
    source: result.source === "china" ? "local-db" : "local-db",
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
