import type { MealRecord } from "@/stores/mealStore";
import type { AgeBucket } from "./ageBucket";
import { computeCoverage, sumMeals, topGaps } from "./rdaGapAnalysis";
import { NUTRIENT_LABELS, RDA, type Nutrient } from "./rdaTables";

/**
 * Build a compact prose summary of what was eaten today, designed
 * for the chat API's system prompt. The format is short on purpose —
 * the model reads it once per turn and we don't want it eating tokens
 * the user's actual question needs.
 *
 * Returns null when there are no meals today, so callers can decide
 * whether to inject the block at all.
 */
export interface IntakeChatContext {
  /** Pre-formatted block ready to splice into the system prompt. */
  prompt: string;
  /** Number of meals logged today — surfaced separately in case the
   *  client wants to render a UI badge. */
  mealCount: number;
  /** Top three nutrient gaps as canonical keys (for the chat-page
   *  preset-suggestions logic — not for the prompt itself). */
  gapNutrients: Nutrient[];
  /** Comma-joined food names. Empty string if no meals. */
  foodList: string;
}

export function buildIntakeChatContext(
  meals: MealRecord[],
  bucket: AgeBucket,
  locale: "zh-TW" | "en",
): IntakeChatContext | null {
  if (meals.length === 0) return null;

  const totals = sumMeals(meals.map((m) => m.totals));
  const coverage = computeCoverage(totals, bucket);
  const gaps = topGaps(coverage, 5); // top 5 under-target so the AI has room
  const foodNames = meals
    .flatMap((m) => m.foods.map((f) => (locale === "en" ? (f.nameEn || f.name) : f.name)))
    // Dedup so a banana eaten twice doesn't read as two distinct foods.
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .slice(0, 12);
  const foodList = foodNames.join(", ");

  // Render coverage as compact "Iron 65%, Calcium 90%, …" — ranked by
  // ascending coverage so the AI sees the gaps first.
  const allCovered = coverage
    .filter((c) => !c.target.isUpperLimit)
    .slice()
    .sort((a, b) => a.coverage - b.coverage)
    .map((c) => {
      const label = NUTRIENT_LABELS[c.nutrient]?.[locale] ?? c.nutrient;
      return `${label} ${Math.round(c.coverage * 100)}%`;
    })
    .join(", ");

  // Render gaps with the absolute amount still needed, so the AI can
  // reason about portions ("you still need ~3mg of iron — that's about
  // 1 yolk").
  const gapDetail = gaps
    .map((c) => {
      const label = NUTRIENT_LABELS[c.nutrient]?.[locale] ?? c.nutrient;
      const need = Math.max(0, c.target.value - c.actual);
      return `${label} (${Math.round(c.coverage * 100)}%, still need ~${round1(need)}${c.target.unit})`;
    })
    .join("; ");

  // Bucket label for context — "9-11mo" tells the model which RDA row
  // these percentages reference.
  const bucketRow = RDA[bucket];
  const bucketLabel = `${bucket} (${Object.keys(bucketRow).length} nutrients tracked)`;

  const prompt = [
    `Meals logged today: ${meals.length}`,
    `Foods eaten: ${foodList}`,
    `Today's coverage vs. ${bucketLabel}:`,
    `  ${allCovered}`,
    gapDetail
      ? `Top gaps right now: ${gapDetail}`
      : `All tracked nutrients on track today.`,
  ].join("\n");

  return {
    prompt,
    mealCount: meals.length,
    gapNutrients: gaps.map((c) => c.nutrient),
    foodList,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
