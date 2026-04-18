/**
 * Build a caregiver-friendly summary of a day's nutrition intake.
 *
 * Input: the meals logged on a given date + the child's age bucket.
 * Output: a verdict (excellent / good / gaps), warm locale-aware copy,
 * and the top nutrient gaps/excesses to mention.
 *
 * Called from the dashboard to render the post-10pm "how did today go"
 * card. Pure math + copy — no side effects.
 */

import type { AgeBucket } from "./ageBucket";
import type { MealRecord } from "@/stores/mealStore";
import { sumMeals, computeCoverage, type NutrientTotals } from "./rdaGapAnalysis";
import { NUTRIENT_LABELS, PRIORITY_NUTRIENTS, type Nutrient } from "./rdaTables";

export type Verdict = "excellent" | "good" | "gaps";

export interface DailySummary {
  date: string;               // YYYY-MM-DD
  mealCount: number;
  totals: NutrientTotals;
  verdict: Verdict;
  titleEn: string;
  titleZh: string;
  bodyEn: string;
  bodyZh: string;
  topGaps: Array<{ nutrient: Nutrient; coverage: number }>;
  topExcesses: Array<{ nutrient: Nutrient; coverage: number }>;
}

/** Returns null if the day had zero meals logged. */
export function buildDailySummary(
  meals: MealRecord[],
  bucket: AgeBucket,
): DailySummary | null {
  if (meals.length === 0) return null;

  const totals = sumMeals(meals.map((m) => m.totals));
  const coverage = computeCoverage(totals, bucket);
  const priority = PRIORITY_NUTRIENTS[bucket];

  const priorityGaps = coverage
    .filter(
      (c) =>
        priority.includes(c.nutrient) &&
        !c.target.isUpperLimit &&
        c.coverage < 0.75,
    )
    .sort((a, b) => a.coverage - b.coverage);

  const excesses = coverage
    .filter((c) => c.target.isUpperLimit && c.coverage > 1.2)
    .sort((a, b) => b.coverage - a.coverage);

  let verdict: Verdict;
  let titleEn: string;
  let titleZh: string;
  let bodyEn: string;
  let bodyZh: string;

  const mealsWord = meals.length === 1 ? "meal" : "meals";

  if (priorityGaps.length === 0 && excesses.length === 0) {
    verdict = "excellent";
    titleEn = "Amazing day! 🎉";
    titleZh = "今日完美達標！🎉";
    bodyEn = `All priority nutrients on track across ${meals.length} ${mealsWord} today. Great job!`;
    bodyZh = `今天記了 ${meals.length} 餐，所有關鍵營養都達標。太棒了！`;
  } else if (priorityGaps.length === 0) {
    verdict = "good";
    const e0 = excesses[0]!.nutrient;
    const eEn = NUTRIENT_LABELS[e0].en;
    const eZh = NUTRIENT_LABELS[e0]["zh-TW"];
    titleEn = "Great job today! ✨";
    titleZh = "今天表現很好！✨";
    bodyEn = `All priority nutrients met. Keep an eye on ${eEn} which came in a bit over today.`;
    bodyZh = `關鍵營養都補足了，只是${eZh}稍微偏高，明天可以留意一下。`;
  } else if (priorityGaps.length <= 2) {
    verdict = "good";
    const g0 = priorityGaps[0]!;
    const gapsEn = priorityGaps
      .slice(0, 2)
      .map((g) => NUTRIENT_LABELS[g.nutrient].en);
    const gapsZh = priorityGaps
      .slice(0, 2)
      .map((g) => NUTRIENT_LABELS[g.nutrient]["zh-TW"]);
    const pct = Math.round((1 - g0.coverage) * 100);
    titleEn = "Close — a small gap";
    titleZh = "差一點點";
    bodyEn = `${meals.length} ${mealsWord} logged. Tomorrow try to add a bit more ${joinEn(gapsEn)} — ${gapsEn[0]} was about ${pct}% short.`;
    bodyZh = `今天記了 ${meals.length} 餐，明天可以多補一點${joinZh(gapsZh)}，${gapsZh[0]}還差約 ${pct}%。`;
  } else {
    verdict = "gaps";
    const gapsEn = priorityGaps
      .slice(0, 3)
      .map((g) => NUTRIENT_LABELS[g.nutrient].en);
    const gapsZh = priorityGaps
      .slice(0, 3)
      .map((g) => NUTRIENT_LABELS[g.nutrient]["zh-TW"]);
    titleEn = "Room to grow tomorrow 💪";
    titleZh = "明天還可以再加油 💪";
    bodyEn = `A few priority nutrients came in low today: ${joinEn(gapsEn)}. Try working them into tomorrow's meals.`;
    bodyZh = `今天有幾個關鍵營養沒補到：${joinZh(gapsZh)}。明天可以重點補充。`;
  }

  return {
    date: meals[0]!.date,
    mealCount: meals.length,
    totals,
    verdict,
    titleEn,
    titleZh,
    bodyEn,
    bodyZh,
    topGaps: priorityGaps
      .slice(0, 3)
      .map((c) => ({ nutrient: c.nutrient, coverage: c.coverage })),
    topExcesses: excesses
      .slice(0, 2)
      .map((c) => ({ nutrient: c.nutrient, coverage: c.coverage })),
  };
}

/**
 * Pick which day to summarize based on the current wall-clock.
 * - After 22:00 → summarize today (fresh end-of-day reflection).
 * - Before 22:00 → summarize yesterday (the last complete day).
 */
export function dateToSummarize(now: Date = new Date()): string {
  const d = new Date(now);
  if (now.getHours() < 22) {
    d.setDate(d.getDate() - 1);
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function joinEn(parts: string[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0]!;
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

function joinZh(parts: string[]): string {
  return parts.join("、");
}
