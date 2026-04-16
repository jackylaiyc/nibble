/**
 * WHO growth-curve math.
 *
 * Percentile/Z-score math using the LMS method
 * (https://www.who.int/tools/child-growth-standards/standards).
 *
 * Only pure functions live here. The full LMS coefficient tables
 * (weight-for-age, length/height-for-age, head-circumference-for-age,
 * split by sex and age in months) are large and load on demand from
 * `src/data/who/*.json` when the growth chart mounts — keeps the main
 * bundle lean.
 */

export type Measure = "weight" | "height" | "head";
export type Sex = "male" | "female";

export interface LmsEntry {
  /** Power of the Box–Cox transform (skew). */
  l: number;
  /** Median of the distribution at this age. */
  m: number;
  /** Coefficient of variation. */
  s: number;
}

/**
 * Convert an observed measurement to a WHO z-score given the age-appropriate
 * LMS triplet. Handles the L=0 edge case (reduces to log-normal).
 */
export function lmsToZScore(value: number, lms: LmsEntry): number {
  if (value <= 0 || lms.m <= 0 || lms.s <= 0) return NaN;
  const { l, m, s } = lms;
  if (l === 0) {
    return Math.log(value / m) / s;
  }
  return (Math.pow(value / m, l) - 1) / (l * s);
}

/**
 * Cumulative standard-normal approximation (Abramowitz & Stegun 26.2.17,
 * error < 7.5e-8). Good enough for a growth-chart percentile readout.
 */
export function zScoreToPercentile(z: number): number {
  if (!Number.isFinite(z)) return NaN;
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const y =
    1 -
    ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  const phi = 0.5 * (1 + sign * y);
  return Math.min(Math.max(phi * 100, 0), 100);
}

/** Percentile from a raw value when you already have the LMS triplet. */
export function valueToPercentile(value: number, lms: LmsEntry): number {
  return zScoreToPercentile(lmsToZScore(value, lms));
}

/**
 * Look up the LMS triplet for a given measurement, sex, and age in months.
 * Returns `null` until the WHO coefficient JSON has been loaded into
 * `setLmsTable()`.
 *
 * TODO (growth percentile): Wire actual WHO 2006 Child Growth Standards LMS
 * data here. Source: https://www.who.int/tools/child-growth-standards/standards
 * Need monthly LMS triplets for ages 0–60mo for both sexes across:
 *   - weight-for-age (kg)
 *   - length/height-for-age (cm)
 *   - head-circumference-for-age (cm)
 * Until then `lookupLms` returns null and `LatestCell` shows "—" — UI
 * degrades gracefully but percentile readout is non-functional. The WHO
 * tables are public-domain; download CSV/expanded-tables from the link
 * above, run a small script to convert to `Record<measure, Record<sex,
 * Record<month, {l,m,s}>>>`, then call `setLmsTable(table)` here at module
 * load time.
 */
let lmsTable: Record<Measure, Record<Sex, Record<number, LmsEntry>>> | null =
  null;

export function setLmsTable(
  table: Record<Measure, Record<Sex, Record<number, LmsEntry>>>,
): void {
  lmsTable = table;
}

/** True once WHO LMS data has been loaded — UI uses this to hide percentile
 * readouts that would always render "—" when data hasn't been wired yet. */
export function hasLmsData(): boolean {
  return lmsTable !== null;
}

export function lookupLms(
  measure: Measure,
  sex: Sex,
  ageMonths: number,
): LmsEntry | null {
  if (!lmsTable) return null;
  const rounded = Math.round(ageMonths);
  const bySex = lmsTable[measure]?.[sex];
  if (!bySex) return null;
  return bySex[rounded] ?? null;
}

/** Nice cutoffs for the chart's reference bands. */
export const REFERENCE_PERCENTILES = [3, 15, 50, 85, 97] as const;
