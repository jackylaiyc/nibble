"use client";

import type { Nutrient } from "@/lib/pediatric/rdaTables";
import { NUTRIENT_LABELS } from "@/lib/pediatric/rdaTables";

/**
 * Circular coverage ring for a single nutrient.
 *
 * Color logic:
 *   below (<90%) on a target-nutrient → butter (warm warning)
 *   onTarget (90-150%) → sage (brand success)
 *   over (>150% for limits, >150% for targets) → peach-deep (attention)
 *   unknown (no data) → soft grey, low opacity
 *
 * Ring caps visually at 100% so an iron coverage of 180% doesn't
 * over-rotate. The label text shows the true pct for caregivers.
 */

type Status = "below" | "onTarget" | "over" | "unknown";

interface Props {
  nutrient: Nutrient;
  /** 0-1+ — 1 means hit the target. */
  coverage: number;
  status: Status;
  actual: number;
  unit: string;
  locale: "zh-TW" | "en";
  /** Compact mode for dense grids; default sm. */
  size?: "sm" | "md" | "lg";
}

const SIZE_PX: Record<NonNullable<Props["size"]>, number> = {
  sm: 64,
  md: 84,
  lg: 112,
};

const COLORS: Record<Status, { stroke: string; track: string; text: string }> = {
  below: { stroke: "var(--color-butter-deep)", track: "var(--color-border)", text: "var(--color-ink)" },
  onTarget: { stroke: "var(--color-sage-deep)", track: "var(--color-border)", text: "var(--color-ink)" },
  over: { stroke: "var(--color-peach-deep)", track: "var(--color-border)", text: "var(--color-ink)" },
  unknown: { stroke: "var(--color-ink-faded)", track: "var(--color-border)", text: "var(--color-ink-faded)" },
};

export function RDARing({
  nutrient,
  coverage,
  status,
  actual,
  unit,
  locale,
  size = "md",
}: Props) {
  const px = SIZE_PX[size];
  const stroke = size === "sm" ? 6 : size === "md" ? 7 : 9;
  const r = px / 2 - stroke;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(coverage, 1);
  const offset = c * (1 - clamped);
  const pct = Math.round(coverage * 100);
  const colors = COLORS[status];

  const label = NUTRIENT_LABELS[nutrient];

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: px, height: px }}>
        <svg viewBox={`0 0 ${px} ${px}`} className="-rotate-90">
          <circle
            cx={px / 2}
            cy={px / 2}
            r={r}
            fill="none"
            stroke={colors.track}
            strokeWidth={stroke}
          />
          <circle
            cx={px / 2}
            cy={px / 2}
            r={r}
            fill="none"
            stroke={colors.stroke}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.6s ease-out" }}
          />
        </svg>
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ fontSize: size === "sm" ? 18 : size === "md" ? 24 : 32 }}
        >
          {label.emoji}
        </div>
      </div>
      <p className="mt-2 text-xs font-medium" style={{ color: colors.text }}>
        {label[locale]}
      </p>
      <p
        className="font-display font-semibold tabular-nums"
        style={{
          fontSize: size === "sm" ? 13 : 15,
          color: status === "unknown" ? "var(--color-ink-faded)" : "var(--color-ink)",
        }}
      >
        {status === "unknown" ? "—" : `${pct}%`}
      </p>
      {status !== "unknown" && (
        <p className="text-[10px] text-ink-faded tabular-nums">
          {formatActual(actual, unit)}
        </p>
      )}
    </div>
  );
}

function formatActual(value: number, unit: string): string {
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded}${unit}`;
}
