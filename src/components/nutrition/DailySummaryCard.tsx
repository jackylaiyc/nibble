"use client";

import type { DailySummary } from "@/lib/pediatric/dailySummary";
import { NUTRIENT_LABELS } from "@/lib/pediatric/rdaTables";

interface Props {
  summary: DailySummary;
  locale: "zh-TW" | "en";
  onDismiss: () => void;
}

export function DailySummaryCard({ summary, locale, onDismiss }: Props) {
  const title = locale === "en" ? summary.titleEn : summary.titleZh;
  const body = locale === "en" ? summary.bodyEn : summary.bodyZh;

  const palette =
    summary.verdict === "excellent"
      ? { bg: "bg-sage/30", border: "border-sage-deep/40", icon: "🌟" }
      : summary.verdict === "good"
        ? { bg: "bg-butter/40", border: "border-butter-deep/40", icon: "✨" }
        : { bg: "bg-peach/30", border: "border-peach-deep/40", icon: "💪" };

  // Pretty date label (e.g. "Apr 18" / "4月18日")
  const dateLabel = (() => {
    const [y, m, d] = summary.date.split("-").map(Number);
    if (!y || !m || !d) return summary.date;
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString(locale === "en" ? "en-US" : "zh-TW", {
      month: "short",
      day: "numeric",
    });
  })();

  const headerEn = `Summary for ${dateLabel} · ${summary.mealCount} ${summary.mealCount === 1 ? "meal" : "meals"}`;
  const headerZh = `${dateLabel} 營養總結 · ${summary.mealCount} 餐`;

  return (
    <section
      className={`rounded-bubble ${palette.bg} border ${palette.border} p-5 relative`}
    >
      <button
        type="button"
        onClick={onDismiss}
        className="absolute top-3 right-3 size-7 rounded-full bg-white/70 text-ink-faded hover:text-ink flex items-center justify-center text-base leading-none"
        aria-label={locale === "en" ? "Dismiss" : "關閉"}
      >
        ×
      </button>

      <div className="flex items-start gap-3 pr-7">
        <span className="text-2xl shrink-0">{palette.icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-ink-faded font-medium tracking-wide">
            {locale === "en" ? headerEn : headerZh}
          </p>
          <h2 className="font-display font-bold text-ink text-base leading-tight mt-0.5">
            {title}
          </h2>
          <p className="mt-2 text-sm text-ink-soft leading-snug">{body}</p>

          {/* Specific nutrient chips: show gaps first, then excesses */}
          {(summary.topGaps.length > 0 || summary.topExcesses.length > 0) && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {summary.topGaps.map((g) => (
                <span
                  key={`gap-${g.nutrient}`}
                  className="inline-flex items-center gap-1 text-[11px] bg-white/70 rounded-full px-2 py-0.5 border border-border"
                >
                  <span>↓</span>
                  <span className="text-ink-soft">
                    {NUTRIENT_LABELS[g.nutrient][locale]}
                  </span>
                  <span className="font-semibold text-ink tabular-nums">
                    {Math.round(g.coverage * 100)}%
                  </span>
                </span>
              ))}
              {summary.topExcesses.map((e) => (
                <span
                  key={`ex-${e.nutrient}`}
                  className="inline-flex items-center gap-1 text-[11px] bg-white/70 rounded-full px-2 py-0.5 border border-border"
                >
                  <span>↑</span>
                  <span className="text-ink-soft">
                    {NUTRIENT_LABELS[e.nutrient][locale]}
                  </span>
                  <span className="font-semibold text-ink tabular-nums">
                    {Math.round(e.coverage * 100)}%
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
