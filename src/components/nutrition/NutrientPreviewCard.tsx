"use client";

import {
  NUTRIENT_LABELS,
  PRIORITY_NUTRIENTS,
  RDA,
  type Nutrient,
} from "@/lib/pediatric/rdaTables";
import type { LifeStageKey } from "@/lib/pediatric/ageBucket";

/**
 * Shows the priority nutrients + daily targets for a specific LifeStageKey.
 * Rendered in the onboarding Step 2 previews so users see upfront how
 * tracking differs between a 9-month-old and an 11-year-old (different
 * nutrients spotlighted, different target values), rather than discovering
 * the granularity only after they've completed onboarding.
 *
 * Deliberately foregrounds MICRO/MACRO NUTRIENTS over calories — the user
 * specifically asked for nutrient-level differentiation, not energy-level.
 */

interface Props {
  /** RDA-table key for the current life-stage. */
  stageKey: LifeStageKey;
  /** Human-readable stage label (e.g. "9-11 months", "Pregnant · 2nd trimester"). */
  stageLabel: string;
  locale: "zh-TW" | "en";
  /** How many priority nutrients to feature (default 5 — matches RDA rings grid). */
  limit?: number;
}

export function NutrientPreviewCard({
  stageKey,
  stageLabel,
  locale,
  limit = 5,
}: Props) {
  const L = (en: string, zh: string) => (locale === "en" ? en : zh);

  const priority = PRIORITY_NUTRIENTS[stageKey] ?? [];
  const rdaRow = RDA[stageKey] ?? {};

  // Newborn stage has no priority nutrients (milk-only). Show nothing —
  // the caller's Step 2 preview handles the newborn messaging separately.
  if (priority.length === 0) return null;

  // Pick the top-N priority nutrients that actually have a target value
  // (defensive — Partial RdaRow might omit some keys in edge cases).
  const featured = priority
    .slice(0, limit)
    .map((n) => ({ n, target: rdaRow[n] }))
    .filter((x): x is { n: Nutrient; target: NonNullable<typeof x.target> } =>
      x.target != null,
    );

  return (
    <div className="rounded-card bg-white border border-border p-5">
      <p className="text-[11px] text-ink-faded font-medium uppercase tracking-wide mb-1">
        {L("Daily nutrient targets", "每日營養目標")}
      </p>
      <p className="font-display font-semibold text-ink text-base mb-3">
        {stageLabel}
      </p>

      <ul className="space-y-2.5">
        {featured.map(({ n, target }) => {
          const label = NUTRIENT_LABELS[n];
          return (
            <li
              key={n}
              className="flex items-center gap-3"
            >
              <span className="text-lg w-7 text-center shrink-0">
                {label.emoji}
              </span>
              <div className="flex-1 min-w-0 flex items-baseline justify-between gap-2">
                <span className="text-sm text-ink">
                  {label[locale]}
                </span>
                <span className="text-sm font-display font-bold text-ink tabular-nums">
                  {target.value}
                  <span className="text-xs font-normal text-ink-faded ml-0.5">
                    {target.unit}
                    {target.isUpperLimit && (
                      <span className="ml-1 text-peach-deep" title={L("upper limit", "上限")}>
                        max
                      </span>
                    )}
                  </span>
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-4 pt-3 border-t border-border/60 text-[11px] text-ink-faded leading-snug">
        {L(
          "Targets adapt automatically as your child grows or your pregnancy progresses — every stage has different nutritional priorities.",
          "營養目標會依年齡與孕期自動調整，每個階段重點不同。",
        )}
      </p>
    </div>
  );
}
