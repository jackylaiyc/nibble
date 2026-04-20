/**
 * Life-stage derivation for the profiles Nibble tracks.
 *
 * The app supports three profile kinds — infants (6mo–5yr), pregnant women
 * (by trimester), and breastfeeding women (0–6mo / 7+mo postpartum). Each
 * maps to a `LifeStageKey` that serves as the lookup key into the RDA
 * tables in `rdaTables.ts`.
 *
 * The legacy `AgeBucket` type (infant-only) is preserved as an alias of
 * `LifeStageKey` so infant-focused call sites keep working unchanged.
 */

// ─── life-stage key (superset of the old AgeBucket) ────────────────────────

/** Key used to look up RDA + priority nutrients + food cautions. */
export type LifeStageKey =
  // Newborn (0-5mo) — NO RDA table entry. These babies are exclusively
  // breast/formula-fed and self-regulate via demand feeding; the baby-feed
  // tracker (counts + benchmarks) is the relevant metric, not macro/micro
  // RDA coverage. Dashboard code must branch on profile.kind to avoid
  // looking up RDA[this key] — there's no row.
  | "newborn-0-5mo"
  // Infant / toddler / child — the `48mo+` key is preserved for back-compat
  // with localStorage records but now represents 4–8 yr specifically (it
  // used to be "4+ years, forever"). A separate `child-9-13yr` bucket picks
  // up older children, matching the USDA DRI 9–13 age group boundary.
  | "6-8mo"
  | "9-11mo"
  | "12-23mo"
  | "24-47mo"
  | "48mo+"          // now scoped to 4–8 yr; kept as key for record back-compat
  | "child-9-13yr"   // pre-teen — calorie + protein + zinc jump, calcium peaks
  // Pregnancy by trimester.
  | "pregnant-T1"
  | "pregnant-T2"
  | "pregnant-T3"
  // Breastfeeding by phase. 0–6mo has a larger calorie bump; 7+mo drops off.
  | "lactation-0-6mo"
  | "lactation-7+mo";

/** Back-compat alias — existing infant code imports `AgeBucket`. */
export type AgeBucket = LifeStageKey;

// ─── life-stage discriminated union ────────────────────────────────────────

/** Minimal input shape — mirrors the fields we care about on `Child`. Decoupled
 *  from the store to avoid circular imports. */
export interface LifeStageInput {
  kind?: "newborn" | "infant" | "pregnant" | "breastfeeding";
  /** Required when kind is "newborn" or "infant". */
  dob?: string;
  /** Required when kind is "pregnant". ISO YYYY-MM-DD. */
  pregnancyDueDate?: string;
  /** Required when kind is "breastfeeding". ISO YYYY-MM-DD. */
  breastfeedingStartDate?: string;
}

export type LifeStage =
  | {
      kind: "newborn";
      key: "newborn-0-5mo";
      months: number;
      weeks: number;
      displayShort: string; // "3 weeks old", "11 weeks old"
    }
  | {
      kind: "infant";
      key: "6-8mo" | "9-11mo" | "12-23mo" | "24-47mo" | "48mo+" | "child-9-13yr";
      months: number;
      years: number;
      displayShort: string; // "9mo", "2y 3m", "11y"
      isSupportedAge: boolean;
    }
  | {
      kind: "pregnant";
      key: "pregnant-T1" | "pregnant-T2" | "pregnant-T3";
      weeksPregnant: number;
      trimester: 1 | 2 | 3;
      displayShort: string; // "26 weeks", "T2"
    }
  | {
      kind: "breastfeeding";
      key: "lactation-0-6mo" | "lactation-7+mo";
      weeksPostpartum: number;
      monthsPostpartum: number;
      displayShort: string; // "5 months postpartum"
    };

// ─── infant helpers (existing) ─────────────────────────────────────────────

export interface AgeInfo {
  bucket: AgeBucket;
  months: number;
  years: number;
  displayShort: string;
  isSupportedAge: boolean;
}

export function monthsBetween(dob: Date, now: Date = new Date()): number {
  const y = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  const d = now.getDate() - dob.getDate();
  let total = y * 12 + m;
  if (d < 0) total -= 1;
  return Math.max(0, total);
}

export function bucketFromMonths(months: number): AgeBucket {
  if (months < 9) return "6-8mo";
  if (months < 12) return "9-11mo";
  if (months < 24) return "12-23mo";
  if (months < 48) return "24-47mo";
  if (months < 108) return "48mo+";      // 4–8 yr (DRI's "4–8 years")
  return "child-9-13yr";                  // 9–13 yr (DRI's "9–13 years", sex-averaged)
}

export function ageInfoFromDob(dob: string | Date, now: Date = new Date()): AgeInfo {
  const d = typeof dob === "string" ? new Date(dob) : dob;
  const months = monthsBetween(d, now);
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  const displayShort =
    months < 24 ? `${months}mo` : remMonths === 0 ? `${years}y` : `${years}y ${remMonths}m`;
  return {
    bucket: bucketFromMonths(months),
    months,
    years,
    displayShort,
    // Supported: 6 months through 13.99 years. Below 6mo the plate-scan
    // hero feature doesn't apply (exclusive breast milk / formula); above
    // 13 the teen/adult tracking lives in other products (MFP territory).
    isSupportedAge: months >= 6 && months < 168,
  };
}

// ─── pregnancy helpers ─────────────────────────────────────────────────────

/**
 * Weeks pregnant given a due date. Standard obstetric convention: a
 * full-term pregnancy is 40 weeks. We count backward from the due date.
 */
export function weeksPregnantFromDueDate(dueDate: string | Date, now: Date = new Date()): number {
  const due = typeof dueDate === "string" ? new Date(dueDate) : dueDate;
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const weeksRemaining = (due.getTime() - now.getTime()) / msPerWeek;
  const weeks = 40 - weeksRemaining;
  // Clamp to a sane range. Outside-range callers should flag isSupportedAge.
  return Math.max(0, Math.min(45, Math.round(weeks)));
}

export function trimesterFromWeeks(weeks: number): 1 | 2 | 3 {
  if (weeks <= 13) return 1;
  if (weeks <= 27) return 2;
  return 3;
}

// ─── breastfeeding helpers ─────────────────────────────────────────────────

export function weeksPostpartumFromStart(start: string | Date, now: Date = new Date()): number {
  const s = typeof start === "string" ? new Date(start) : start;
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const weeks = (now.getTime() - s.getTime()) / msPerWeek;
  return Math.max(0, Math.round(weeks));
}

// ─── unified life-stage resolver ───────────────────────────────────────────

/**
 * Derive the current `LifeStage` for a profile. Kind discriminator on the
 * profile picks the branch; missing `kind` defaults to "infant" for back-
 * compat with records created before the expansion.
 *
 * Returns a best-effort `LifeStage` even for inputs that are slightly
 * malformed (e.g. a missing due date). Callers gate UI via `isSupportedAge`
 * (infants only) or the trimester / week counters themselves.
 */
export function getLifeStage(input: LifeStageInput, now: Date = new Date()): LifeStage {
  const kind = input.kind ?? "infant";

  if (kind === "newborn") {
    const d = input.dob ? new Date(input.dob) : now;
    const months = monthsBetween(d, now);
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    const weeks = Math.max(0, Math.round((now.getTime() - d.getTime()) / msPerWeek));
    return {
      kind: "newborn",
      key: "newborn-0-5mo",
      months,
      weeks,
      displayShort: weeks < 2
        ? `${Math.max(1, Math.floor((now.getTime() - d.getTime()) / (24 * 60 * 60 * 1000)))} days old`
        : weeks < 14
          ? `${weeks} weeks old`
          : `${months} mo old`,
    };
  }

  if (kind === "pregnant") {
    const weeks = input.pregnancyDueDate
      ? weeksPregnantFromDueDate(input.pregnancyDueDate, now)
      : 20; // safe middle default
    const trimester = trimesterFromWeeks(weeks);
    const key =
      trimester === 1 ? "pregnant-T1" : trimester === 2 ? "pregnant-T2" : "pregnant-T3";
    return {
      kind: "pregnant",
      key,
      weeksPregnant: weeks,
      trimester,
      displayShort: `T${trimester} · ${weeks}w`,
    };
  }

  if (kind === "breastfeeding") {
    const weeks = input.breastfeedingStartDate
      ? weeksPostpartumFromStart(input.breastfeedingStartDate, now)
      : 8;
    const months = Math.floor(weeks / 4.345);
    const key: "lactation-0-6mo" | "lactation-7+mo" =
      months < 7 ? "lactation-0-6mo" : "lactation-7+mo";
    return {
      kind: "breastfeeding",
      key,
      weeksPostpartum: weeks,
      monthsPostpartum: months,
      displayShort: `${months}mo postpartum`,
    };
  }

  // Infant (default)
  const info = ageInfoFromDob(input.dob ?? new Date().toISOString(), now);
  return {
    kind: "infant",
    key: info.bucket as LifeStage extends { kind: "infant" } ? LifeStage["key"] : never,
    months: info.months,
    years: info.years,
    displayShort: info.displayShort,
    isSupportedAge: info.isSupportedAge,
  };
}

// ─── labels ────────────────────────────────────────────────────────────────

export const AGE_BUCKET_LABELS: Record<AgeBucket, { en: string; "zh-TW": string }> = {
  // Newborn (milk only — no plate-scan)
  "newborn-0-5mo": { en: "Newborn · 0–5 months", "zh-TW": "新生兒 · 0–5 個月" },
  // Infant / toddler / child
  "6-8mo": { en: "6–8 months", "zh-TW": "6–8 個月" },
  "9-11mo": { en: "9–11 months", "zh-TW": "9–11 個月" },
  "12-23mo": { en: "12–23 months", "zh-TW": "1–2 歲" },
  "24-47mo": { en: "2–4 years", "zh-TW": "2–4 歲" },
  "48mo+": { en: "4–8 years", "zh-TW": "4–8 歲" },         // formerly "4+ years"
  "child-9-13yr": { en: "9–13 years", "zh-TW": "9–13 歲" },
  // Pregnancy
  "pregnant-T1": { en: "Pregnant · 1st trimester", "zh-TW": "懷孕 · 第一孕期" },
  "pregnant-T2": { en: "Pregnant · 2nd trimester", "zh-TW": "懷孕 · 第二孕期" },
  "pregnant-T3": { en: "Pregnant · 3rd trimester", "zh-TW": "懷孕 · 第三孕期" },
  // Breastfeeding
  "lactation-0-6mo": { en: "Breastfeeding · 0–6 months", "zh-TW": "哺乳 · 產後 0–6 個月" },
  "lactation-7+mo": { en: "Breastfeeding · 7+ months", "zh-TW": "哺乳 · 產後 7 個月以上" },
};

/** Alias for downstream consumers that want a life-stage-neutral name. */
export const LIFE_STAGE_LABELS = AGE_BUCKET_LABELS;
