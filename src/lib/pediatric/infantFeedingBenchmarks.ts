/**
 * Expected feeding-pattern ranges for infants 0–6 months, keyed by
 * weeks-of-life. Used by the dashboard BabyFeedCard to turn raw counts
 * ("4 feeds today") into contextual signals ("lower than typical for 3wks").
 *
 * Sources:
 *   - AAP HealthyChildren.org (family-facing guidance)
 *   - AAP Pediatric Nutrition Handbook, 8th ed.
 *   - La Leche League International, "The Womanly Art of Breastfeeding"
 *   - WHO Infant and young child feeding guidelines
 *
 * Design notes:
 *   - Ranges are intentionally conservative — "typical and comfortable" rather
 *     than "clinical tolerance". A mom at the edge of the range should see
 *     "lower than typical" language, not an alarm.
 *   - True medical red flags (no wet diapers in 8+ hours, dehydration,
 *     sustained feeding refusal) need a separate, louder UI layer. This
 *     file is for routine pattern guidance, not triage.
 *   - After 6 months (26 weeks) the plate-scan feature takes over as the
 *     primary signal — we return null for callers above that.
 *   - Breastfed babies often drop to a single dirty diaper every few days
 *     around month 2–3; we reflect this with a wider minimum of 0–1
 *     rather than panicking parents.
 */

export interface InfantBenchmark {
  /** Minimum age in weeks this benchmark applies to (inclusive). */
  weekMin: number;
  /** Maximum age in weeks (exclusive). */
  weekMax: number;
  /** Human-readable age band label. */
  label: { en: string; "zh-TW": string };
  /** Expected daily feed count (breastfeeding + formula combined). */
  feedsPerDay: [min: number, max: number];
  /** Expected total daily formula volume in ml (breastfed feeding is by
   *  demand — we don't bucket-check volume, only feed count). */
  milkMLPerDay: [min: number, max: number];
  /** Expected daily wet diaper count. */
  wetDiapers: [min: number, max: number];
  /** Expected daily dirty diaper count. Breastfed babies naturally drop to
   *  0-1/day after ~6 weeks, which is normal — we reflect that here. */
  dirtyDiapers: [min: number, max: number];
  /** Typical range of minutes between feeds during wake hours. Overnight
   *  stretches can be longer — we show the daytime range. */
  gapMinutes: [min: number, max: number];
  /** Short bilingual note shown as context on the card. */
  note: { en: string; "zh-TW": string };
}

const TABLE: InfantBenchmark[] = [
  {
    weekMin: 0,
    weekMax: 1,
    label: { en: "Week 1 (newborn)", "zh-TW": "第 1 週（新生兒）" },
    feedsPerDay: [8, 12],
    milkMLPerDay: [400, 700],
    // Day 1-3 is lower (colostrum phase); ranges apply from ~day 4 onward.
    wetDiapers: [5, 8],
    dirtyDiapers: [3, 5],
    gapMinutes: [90, 180],
    note: {
      en: "Cluster feeds are normal. Wake baby if 4+ hrs without a feed.",
      "zh-TW":"密集哺乳很正常；若超過 4 小時沒吃，請喚醒寶寶餵食。",
    },
  },
  {
    weekMin: 1,
    weekMax: 4,
    label: { en: "Weeks 2–4", "zh-TW": "第 2–4 週" },
    feedsPerDay: [8, 10],
    milkMLPerDay: [500, 900],
    wetDiapers: [6, 8],
    dirtyDiapers: [3, 5],
    gapMinutes: [120, 240],
    note: {
      en: "Growth spurt around week 3 — extra feeds are normal.",
      "zh-TW":"第 3 週有成長陡升期，哺乳次數會暫時增加，這是正常的。",
    },
  },
  {
    weekMin: 4,
    weekMax: 8,
    label: { en: "1–2 months", "zh-TW": "滿月至 2 個月" },
    feedsPerDay: [7, 9],
    milkMLPerDay: [600, 900],
    wetDiapers: [5, 7],
    dirtyDiapers: [2, 4],
    gapMinutes: [150, 240],
    note: {
      en: "Breastfed babies may start spacing dirty diapers 1–3 days apart — usually fine.",
      "zh-TW":"親餵寶寶大便可能 1–3 天才一次，通常是正常的。",
    },
  },
  {
    weekMin: 8,
    weekMax: 12,
    label: { en: "2–3 months", "zh-TW": "2–3 個月" },
    feedsPerDay: [6, 8],
    milkMLPerDay: [700, 900],
    wetDiapers: [5, 7],
    dirtyDiapers: [0, 3],
    gapMinutes: [180, 300],
    note: {
      en: "Feeds consolidate into longer, less frequent sessions. Sleep stretches grow.",
      "zh-TW":"哺乳時間拉長、次數變少；夜間睡眠開始變長。",
    },
  },
  {
    weekMin: 12,
    weekMax: 16,
    label: { en: "3–4 months", "zh-TW": "3–4 個月" },
    feedsPerDay: [5, 7],
    milkMLPerDay: [700, 900],
    wetDiapers: [5, 7],
    dirtyDiapers: [0, 2],
    gapMinutes: [180, 300],
    note: {
      en: "4-month sleep regression is common — temporary extra night wakings are normal.",
      "zh-TW":"4 個月睡眠倒退期很常見，夜間多醒幾次是正常現象，通常會過去。",
    },
  },
  {
    weekMin: 16,
    weekMax: 26,
    label: { en: "4–6 months", "zh-TW": "4–6 個月" },
    feedsPerDay: [5, 6],
    milkMLPerDay: [700, 900],
    wetDiapers: [4, 6],
    dirtyDiapers: [0, 2],
    gapMinutes: [180, 360],
    note: {
      en: "Watch for solids-readiness cues: head control, interest in food, tongue-thrust gone.",
      "zh-TW":"留意副食品準備信號：頭部控制穩、對食物有興趣、伸舌反射消退。",
    },
  },
];

// ─── public API ───────────────────────────────────────────────────────────

/**
 * Return the benchmark band for a baby's age in weeks, or null if beyond
 * the tracked range (26+ weeks → plate scan is primary feature).
 */
export function getBenchmarkForWeeks(weeks: number): InfantBenchmark | null {
  if (weeks < 0) return null;
  if (weeks >= 26) return null;
  for (const band of TABLE) {
    if (weeks >= band.weekMin && weeks < band.weekMax) return band;
  }
  return null;
}

/** Tag a count against a range: below, normal, or above. */
export type BenchStatus = "below" | "normal" | "above";

export function statusForCount(
  count: number,
  range: [number, number],
): BenchStatus {
  const [min, max] = range;
  if (count < min) return "below";
  if (count > max) return "above";
  return "normal";
}

/**
 * Status for time-since-last-feed in minutes. Below-min (too frequent) and
 * above-max (too infrequent) both matter — the latter more so for hydration.
 */
export function statusForGapMinutes(
  minutesSinceLastFeed: number,
  range: [number, number],
): BenchStatus {
  const [, max] = range;
  // "Below min" (frequent feeding) isn't concerning — babies cluster-feed and
  // self-regulate. Only flag when the gap is longer than typical.
  if (minutesSinceLastFeed > max) return "above";
  return "normal";
}
