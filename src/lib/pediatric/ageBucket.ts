/**
 * Age bucket derivation from a child's date of birth.
 *
 * Buckets match the RDA tables in `rdaTables.ts` and the WHO/AAP
 * feeding milestones. If a child falls outside 6mo-5yr we still return
 * a best-fit bucket so the app never crashes, but the UI should gate
 * on `isSupportedAge` before showing recommendations.
 */

export type AgeBucket =
  | "6-8mo"
  | "9-11mo"
  | "12-23mo"
  | "24-47mo"
  | "48mo+";

export interface AgeInfo {
  bucket: AgeBucket;
  months: number;
  years: number;
  displayShort: string; // "9mo", "2y 3m"
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
  return "48mo+";
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
    isSupportedAge: months >= 6 && months < 60,
  };
}

export const AGE_BUCKET_LABELS: Record<AgeBucket, { en: string; "zh-TW": string }> = {
  "6-8mo": { en: "6–8 months", "zh-TW": "6–8 個月" },
  "9-11mo": { en: "9–11 months", "zh-TW": "9–11 個月" },
  "12-23mo": { en: "12–23 months", "zh-TW": "1–2 歲" },
  "24-47mo": { en: "2–4 years", "zh-TW": "2–4 歲" },
  "48mo+": { en: "4+ years", "zh-TW": "4 歲以上" },
};
