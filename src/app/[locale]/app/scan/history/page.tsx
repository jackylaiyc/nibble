"use client";

import { useEffect, useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useChildProfileStore } from "@/stores/childProfileStore";
import { useMealStore, type MealRecord } from "@/stores/mealStore";
import { NUTRIENT_LABELS, type Nutrient } from "@/lib/pediatric/rdaTables";

/**
 * Meal history — every saved plate, newest first, grouped by day.
 *
 * Caregivers asked for two things this page solves:
 *   1. "Show me the photo I took" — we render the data URL we now persist
 *      on each MealRecord (compressed to ~800px on save).
 *   2. "Show the exact date and time" — we drop the Breakfast/Lunch/Dinner
 *      label in favor of literal date + 24-hour clock, locale-formatted.
 *
 * Delete is supported in-place; edit isn't yet (re-running AI on a saved
 * meal would change the food list — out of scope for the MVP).
 */

export default function MealHistoryPage() {
  const locale = useLocale() as "zh-TW" | "en";
  const t = useTranslations("Scan");
  const tCommon = useTranslations("Common");

  const loadChildren = useChildProfileStore((s) => s.loadFromStorage);
  const childLoaded = useChildProfileStore((s) => s.loaded);
  const activeChild = useChildProfileStore((s) => s.getActiveChild());

  const loadMeals = useMealStore((s) => s.loadFromStorage);
  const mealsLoaded = useMealStore((s) => s.loaded);
  const allMeals = useMealStore((s) => s.meals);
  const removeMeal = useMealStore((s) => s.removeMeal);

  useEffect(() => {
    loadChildren();
    loadMeals();
  }, [loadChildren, loadMeals]);

  const entries = useMemo(
    () =>
      activeChild
        ? allMeals
            .filter((m) => m.childId === activeChild.id)
            .sort((a, b) =>
              `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`),
            )
        : [],
    [activeChild, allMeals],
  );

  const grouped = useMemo(() => groupByDate(entries), [entries]);

  if (!childLoaded || !mealsLoaded) {
    return (
      <main className="min-h-screen flex items-center justify-center text-ink-faded">
        {tCommon("loading")}
      </main>
    );
  }

  return (
    <main className="min-h-screen pb-24">
      <header className="sticky top-0 z-20 bg-cream/90 backdrop-blur-md border-b border-border px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <Link href="/app" className="text-ink-soft hover:text-ink">
            ←
          </Link>
          <h1 className="font-display text-lg font-semibold text-ink flex-1">
            {t("historyTitle")}
          </h1>
          <Link
            href="/app/scan"
            className="rounded-full bg-peach-deep text-white text-xs font-semibold px-3 py-1.5"
          >
            + 📸
          </Link>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-6 pt-6 space-y-8">
        {entries.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-3">🥣</div>
            <p className="text-ink-soft mb-6">{t("historyEmpty")}</p>
            <Link
              href="/app/scan"
              className="inline-flex rounded-full bg-peach-deep text-white font-semibold px-6 py-3 bubble-shadow"
            >
              {t("choosePhoto")} →
            </Link>
          </div>
        ) : (
          grouped.map(([date, items]) => (
            <section key={date}>
              <p className="text-xs font-medium text-ink-faded tabular-nums mb-3 px-1">
                {formatDateHeader(date, locale)}
              </p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {items.map((m) => (
                  <MealCard
                    key={m.id}
                    record={m}
                    locale={locale}
                    onDelete={() => {
                      if (confirm(t("deleteMealConfirm"))) removeMeal(m.id);
                    }}
                    deleteLabel={tCommon("delete")}
                    noPhotoLabel={t("noPhoto")}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </main>
  );
}

function MealCard({
  record,
  locale,
  onDelete,
  deleteLabel,
  noPhotoLabel,
}: {
  record: MealRecord;
  locale: "zh-TW" | "en";
  onDelete: () => void;
  deleteLabel: string;
  noPhotoLabel: string;
}) {
  // Pick the top 4 nutrients with non-trivial values for a quick chip-strip.
  // Filter to KNOWN nutrients only — stale localStorage data may carry keys
  // that no longer have a NUTRIENT_LABELS entry, which would crash the chip.
  const topNutrients = (Object.keys(record.totals) as Nutrient[])
    .filter((n) => {
      if (!NUTRIENT_LABELS[n]) return false;
      const v = record.totals[n];
      return typeof v === "number" && v > 0;
    })
    .sort((a, b) => (record.totals[b] ?? 0) - (record.totals[a] ?? 0))
    .slice(0, 4);

  return (
    <li className="rounded-bubble bg-white border border-border overflow-hidden card-pop flex flex-col">
      <Link href={`/app/scan/${record.id}` as "/app/scan/history"} className="block">
        <div className="relative aspect-[4/3] bg-cream/60">
          {record.photoDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={record.photoDataUrl}
              alt={record.foods.map((f) => f.name).join(", ")}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-ink-faded">
              <span className="text-3xl mb-1">🍽️</span>
              <span className="text-xs">{noPhotoLabel}</span>
            </div>
          )}
          <div className="absolute top-2 right-2" onClick={(e) => e.preventDefault()}>
            <button
              type="button"
              onClick={onDelete}
              className="size-7 rounded-full bg-white/90 text-ink-faded hover:text-peach-deep flex items-center justify-center text-base leading-none backdrop-blur"
              aria-label={deleteLabel}
            >
              ×
            </button>
          </div>
        </div>
      </Link>
      <Link href={`/app/scan/${record.id}` as "/app/scan/history"} className="p-4 flex-1 flex flex-col">
        <p className="text-xs font-medium text-ink-faded tabular-nums">
          {formatTime(record.date, record.time, locale)}
        </p>
        <p className="mt-1 font-display font-semibold text-ink leading-tight line-clamp-2">
          {record.foods.map((f) => f.name).join(" · ")}
        </p>
        {topNutrients.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
            {topNutrients.map((n) => {
              const value = record.totals[n] ?? 0;
              const unit = NUTRIENT_LABELS[n];
              return (
                <span
                  key={n}
                  className="inline-flex items-center gap-1 rounded-full bg-cream border border-border px-2 py-0.5"
                  title={unit[locale]}
                >
                  <span>{unit.emoji}</span>
                  <span className="text-ink tabular-nums font-medium">
                    {Math.round(value * 10) / 10}
                  </span>
                </span>
              );
            })}
          </div>
        )}
      </Link>
    </li>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────

function groupByDate(records: MealRecord[]): Array<[string, MealRecord[]]> {
  const map = new Map<string, MealRecord[]>();
  for (const r of records) {
    const arr = map.get(r.date) ?? [];
    arr.push(r);
    map.set(r.date, arr);
  }
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, items]) => [
      date,
      [...items].sort((a, b) => b.time.localeCompare(a.time)),
    ]);
}

function formatDateHeader(date: string, locale: "zh-TW" | "en"): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(locale === "en" ? "en-US" : "zh-TW", {
    year: "numeric",
    month: "short",
    day: "numeric",
    weekday: "short",
  });
}

function formatTime(
  date: string,
  time: string,
  locale: "zh-TW" | "en",
): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const dt = new Date(y, m - 1, d, hh, mm);
  return dt.toLocaleString(locale === "en" ? "en-US" : "zh-TW", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: locale === "en",
  });
}
