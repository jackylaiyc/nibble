"use client";

import { useEffect, useMemo, useState, use } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useChildProfileStore } from "@/stores/childProfileStore";
import { useMealStore, type FoodItem } from "@/stores/mealStore";
import type { AgeBucket } from "@/lib/pediatric/ageBucket";
import { getAllergen, type AllergenKey } from "@/lib/pediatric/allergenRegistry";
import {
  NUTRIENT_LABELS,
  PRIORITY_NUTRIENTS,
  RDA,
  type Nutrient,
} from "@/lib/pediatric/rdaTables";
import { computeCoverage } from "@/lib/pediatric/rdaGapAnalysis";
import { sumFoodTotals } from "@/lib/nutrition/sumFoodTotals";
import { RDARing } from "@/components/pediatric/RDARing";
import { DISCLAIMERS } from "@/lib/pediatric/disclaimers";

/**
 * Meal detail page — read-only view of a previously saved plate scan.
 * Reached by tapping a meal card in history or from the dashboard.
 */

export default function MealDetailPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id } = use(params);
  const locale = useLocale() as "zh-TW" | "en";
  const t = useTranslations("Scan");
  const router = useRouter();

  const loadChildren = useChildProfileStore((s) => s.loadFromStorage);
  const childLoaded = useChildProfileStore((s) => s.loaded);
  const activeChild = useChildProfileStore((s) => s.getActiveChild());

  const loadMeals = useMealStore((s) => s.loadFromStorage);
  const mealsLoaded = useMealStore((s) => s.loaded);
  const meals = useMealStore((s) => s.meals);
  const updateMeal = useMealStore((s) => s.updateMeal);
  const removeMeal = useMealStore((s) => s.removeMeal);

  useEffect(() => {
    loadChildren();
    loadMeals();
  }, [loadChildren, loadMeals]);

  const meal = useMemo(() => meals.find((m) => m.id === id), [meals, id]);

  const [showAllNutrients, setShowAllNutrients] = useState(false);

  // Edit mode — lets the caregiver amend the time, delete individual foods,
  // or delete the whole meal. Defaults pull from the saved record; changes
  // are local until the Save button commits them via updateMeal().
  const [editMode, setEditMode] = useState(false);
  const [editDate, setEditDate] = useState<string>("");
  const [editTime, setEditTime] = useState<string>("");
  const [editFoods, setEditFoods] = useState<FoodItem[]>([]);

  function enterEditMode() {
    if (!meal) return;
    setEditDate(meal.date);
    setEditTime(meal.time);
    setEditFoods(meal.foods);
    setEditMode(true);
  }

  function cancelEdit() {
    setEditMode(false);
  }

  function deleteFoodAt(idx: number) {
    setEditFoods((prev) => prev.filter((_, i) => i !== idx));
  }

  function saveEdits() {
    if (!meal) return;
    updateMeal(meal.id, {
      date: editDate,
      time: editTime,
      foods: editFoods,
      totals: sumFoodTotals(editFoods),
    });
    setEditMode(false);
  }

  function deleteMeal() {
    if (!meal) return;
    const msg = locale === "en"
      ? "Delete this meal? This can't be undone."
      : "要刪除這筆餐點紀錄嗎？無法復原。";
    if (!confirm(msg)) return;
    removeMeal(meal.id);
    router.push("/app/scan/history");
  }

  // In edit mode, display the pending (unsaved) list. Otherwise the saved list.
  const displayFoods = editMode ? editFoods : meal?.foods ?? [];
  const displayTotals = editMode ? sumFoodTotals(editFoods) : meal?.totals ?? {};

  // Coverage using the historical age bucket (snapshot at scan time)
  const coverage = useMemo(() => {
    if (!meal) return [];
    return computeCoverage(displayTotals, meal.ageBucketAtMeal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meal, editMode, editFoods]);

  const coverageByNutrient = useMemo(() => {
    const map: Partial<Record<Nutrient, (typeof coverage)[number]>> = {};
    for (const cell of coverage) map[cell.nutrient] = cell;
    return map;
  }, [coverage]);

  // Loading
  if (!childLoaded || !mealsLoaded) {
    return (
      <main className="min-h-screen flex items-center justify-center text-ink-faded">
        Loading...
      </main>
    );
  }

  // Not found
  if (!meal) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-8 text-center">
        <div className="text-5xl mb-4">🔍</div>
        <p className="text-ink-soft mb-4">
          {locale === "en" ? "Meal not found" : "找不到這筆餐點紀錄"}
        </p>
        <Link
          href="/app/scan/history"
          className="text-peach-deep font-semibold underline"
        >
          {locale === "en" ? "Back to history" : "回到紀錄"}
        </Link>
      </main>
    );
  }

  const bucket = meal.ageBucketAtMeal;
  const priorityNutrients = PRIORITY_NUTRIENTS[bucket];

  // Allergen hits against active child's known allergens
  const knownAllergenHits: AllergenKey[] = (() => {
    if (!activeChild) return [];
    const known = new Set(activeChild.allergens);
    const hits = new Set<AllergenKey>();
    for (const food of displayFoods) {
      for (const a of food.allergensPresent ?? []) {
        if (known.has(a)) hits.add(a);
      }
    }
    return [...hits];
  })();

  // Format date/time
  const dateDisplay = (() => {
    try {
      const [y, m, d] = meal.date.split("-").map(Number);
      const date = new Date(y, m - 1, d);
      return date.toLocaleDateString(locale === "en" ? "en-US" : "zh-TW", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
    } catch {
      return meal.date;
    }
  })();

  return (
    <main className="min-h-screen bg-cream pb-40">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-cream/95 backdrop-blur-md border-b border-border">
        <div className="max-w-xl mx-auto px-5 py-4 flex items-center gap-3">
          <Link
            href="/app/scan/history"
            className="text-ink-faded hover:text-ink -ml-1"
            aria-label="Back"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </Link>
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium text-ink tabular-nums">
              {dateDisplay} · {meal.time}
            </span>
          </div>
          {!editMode && (
            <button
              type="button"
              onClick={enterEditMode}
              className="text-xs font-semibold text-peach-deep px-3 py-1.5 rounded-full border border-peach-deep/30 hover:bg-peach/10 transition"
            >
              {locale === "en" ? "Edit" : "編輯"}
            </button>
          )}
        </div>

        {/* Date / time pickers in edit mode */}
        {editMode && (
          <div className="max-w-xl mx-auto px-5 pb-4 grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[11px] text-ink-faded mb-1 block">
                {t("mealDateField")}
              </span>
              <input
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                className="w-full px-3 py-2 rounded-card border border-border bg-white text-ink text-sm"
              />
            </label>
            <label className="block">
              <span className="text-[11px] text-ink-faded mb-1 block">
                {t("mealTimeField")}
              </span>
              <input
                type="time"
                value={editTime}
                onChange={(e) => setEditTime(e.target.value)}
                className="w-full px-3 py-2 rounded-card border border-border bg-white text-ink text-sm"
              />
            </label>
          </div>
        )}
      </header>

      <div className="max-w-xl mx-auto px-5 py-6 space-y-6">
        {/* Photo */}
        {meal.photoDataUrl ? (
          <div className="rounded-card overflow-hidden border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={meal.photoDataUrl}
              alt={locale === "en" ? "Meal photo" : "餐點照片"}
              className="w-full max-h-64 object-cover"
            />
          </div>
        ) : (
          <div className="rounded-card bg-white border border-border flex items-center justify-center py-12">
            <span className="text-4xl">🍽️</span>
          </div>
        )}

        {/* Allergen warning */}
        {knownAllergenHits.length > 0 && (
          <div className="rounded-card bg-peach/30 border border-peach-deep/40 p-4">
            <p className="font-display font-semibold text-ink">
              {t("allergenWarningTitle")}
            </p>
            <p className="mt-1 text-sm text-ink leading-relaxed">
              {t("allergenWarningBody", {
                allergens: knownAllergenHits
                  .map((k) => `${getAllergen(k)?.emoji ?? ""} ${getAllergen(k)?.label[locale] ?? k}`)
                  .join(locale === "en" ? ", " : "、"),
              })}
            </p>
          </div>
        )}

        {/* Food cards with insights */}
        <div>
          <h2 className="font-display font-semibold text-ink mb-3">
            {t("foodsTitle")}
          </h2>
          {displayFoods.length === 0 ? (
            <p className="text-sm text-ink-faded italic">
              {locale === "en"
                ? "All foods removed. Save to update the meal."
                : "所有食物都被移除了，點儲存以更新。"}
            </p>
          ) : (
            <ul className="space-y-3">
              {displayFoods.map((food, i) => (
                <FoodInsightCard
                  key={`${food.name}-${i}`}
                  food={food}
                  locale={locale}
                  t={t}
                  onDelete={editMode ? () => deleteFoodAt(i) : undefined}
                />
              ))}
            </ul>
          )}
        </div>

        {/* Priority nutrient RDA rings */}
        <div>
          <h2 className="font-display font-semibold text-ink mb-1">
            {t("nutrientsTitle")}
          </h2>
          <p className="text-xs text-ink-faded mb-4">
            {t("nutrientsHint")}
          </p>
          <div className="grid grid-cols-3 gap-3 rounded-bubble bg-white card-pop p-5">
            {priorityNutrients.map((nutrient) => {
              const cell = coverageByNutrient[nutrient];
              const target = RDA[bucket]?.[nutrient];
              if (!target) return null;
              return (
                <RDARing
                  key={nutrient}
                  nutrient={nutrient}
                  coverage={cell?.coverage ?? 0}
                  status={cell?.status ?? "unknown"}
                  actual={cell?.actual ?? 0}
                  unit={target.unit}
                  locale={locale}
                  size="sm"
                />
              );
            })}
          </div>

          {/* Expandable all nutrients */}
          <button
            type="button"
            onClick={() => setShowAllNutrients((v) => !v)}
            className="mt-3 w-full text-sm font-medium text-sage-deep hover:text-ink py-2 rounded-card border border-border bg-white"
          >
            {showAllNutrients ? t("hideExtraNutrients") : t("showAllNutrients")}
          </button>
          {showAllNutrients && (
            <div className="mt-3 rounded-bubble bg-white card-pop p-5 space-y-3">
              {coverage
                .filter((c) => !priorityNutrients.includes(c.nutrient))
                .map((cell) => (
                  <NutrientBar
                    key={cell.nutrient}
                    label={NUTRIENT_LABELS[cell.nutrient][locale]}
                    emoji={NUTRIENT_LABELS[cell.nutrient].emoji}
                    actual={cell.actual}
                    target={cell.target.value}
                    unit={cell.target.unit}
                    coverage={cell.coverage}
                    isUpperLimit={!!cell.target.isUpperLimit}
                    locale={locale}
                  />
                ))}
            </div>
          )}

          <p className="mt-3 text-[11px] text-ink-faded text-center">
            {DISCLAIMERS.rdaResults[locale]}
          </p>
        </div>

        {/* Per-food breakdown */}
        <div>
          <h2 className="font-display font-semibold text-ink mb-1">
            {t("perFoodTitle")}
          </h2>
          <p className="text-xs text-ink-faded mb-4">{t("perFoodHint")}</p>
          <ul className="space-y-3">
            {displayFoods.map((food, i) => (
              <PerFoodCard
                key={`pf-${food.name}-${i}`}
                name={food.name}
                portionLabel={`${food.portionAmount} ${food.portionUnit} (~${Math.round(food.gramsEstimate)}g)`}
                nutrients={food.nutrients}
                bucket={bucket}
                priorityNutrients={priorityNutrients}
                locale={locale}
              />
            ))}
          </ul>
        </div>
      </div>

      {/* Edit mode footer: save / cancel / delete whole meal */}
      {editMode && (
        <nav
          className="fixed inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-border px-5 py-3"
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)" }}
        >
          <div className="max-w-xl mx-auto flex items-center gap-2">
            <button
              type="button"
              onClick={deleteMeal}
              className="shrink-0 px-4 py-3 rounded-full border border-red-300 text-red-600 font-medium hover:bg-red-50 transition"
              aria-label={locale === "en" ? "Delete meal" : "刪除餐點"}
            >
              🗑️
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              className="flex-1 px-4 py-3 rounded-full border border-border text-ink-soft font-medium hover:bg-cream transition"
            >
              {locale === "en" ? "Cancel" : "取消"}
            </button>
            <button
              type="button"
              onClick={saveEdits}
              className="flex-1 px-4 py-3 rounded-full bg-sage-deep text-white font-semibold hover:bg-sage-deep/90 transition"
            >
              {locale === "en" ? "Save" : "儲存"}
            </button>
          </div>
        </nav>
      )}
    </main>
  );
}

// ─── inline components ─────────────────────────────────────────────────────

function FoodInsightCard({
  food,
  locale,
  t,
  onDelete,
}: {
  food: FoodItem;
  locale: "zh-TW" | "en";
  t: ReturnType<typeof useTranslations>;
  onDelete?: () => void;
}) {
  const benefit = locale === "en" ? food.benefitEn : food.benefit;
  const risk = locale === "en" ? food.riskEn : food.risk;
  const suitability = food.suitability;
  const suitBadge =
    suitability === "excellent"
      ? { bg: "bg-sage/20", text: "text-sage-deep", label: locale === "en" ? "Excellent" : "非常適合" }
      : suitability === "good"
        ? { bg: "bg-butter/30", text: "text-ink", label: locale === "en" ? "Good" : "適合" }
        : suitability === "caution"
          ? { bg: "bg-peach/30", text: "text-peach-deep", label: locale === "en" ? "Caution" : "注意" }
          : suitability === "avoid"
            ? { bg: "bg-red-100", text: "text-red-700", label: locale === "en" ? "Avoid" : "避免" }
            : null;

  const unitKey = `unit_${food.portionUnit}` as "unit_tsp";
  const unitLabel = t(unitKey);

  return (
    <li className="rounded-card bg-white border border-border overflow-hidden">
      <div className="flex items-center gap-3 p-4">
        <div className="size-10 rounded-2xl bg-butter/60 flex items-center justify-center text-lg shrink-0">
          🍴
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-ink truncate">{food.name}</p>
          <p className="text-xs text-ink-faded">
            {t("portionLabel", {
              amount: food.portionAmount,
              unit: unitLabel,
              grams: Math.round(food.gramsEstimate),
            })}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {suitBadge && (
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${suitBadge.bg} ${suitBadge.text}`}>
              {suitBadge.label}
            </span>
          )}
          {(food.allergensPresent ?? []).length > 0 && (
            <div className="flex items-center gap-0.5 text-base">
              {food.allergensPresent!.slice(0, 3).map((k) => (
                <span key={k} title={getAllergen(k)?.label[locale]}>
                  {getAllergen(k)?.emoji}
                </span>
              ))}
            </div>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="size-7 rounded-full bg-red-50 text-red-500 hover:bg-red-100 flex items-center justify-center text-sm"
              aria-label={locale === "en" ? "Remove food" : "移除此食物"}
            >
              ×
            </button>
          )}
        </div>
      </div>

      {(benefit || risk) && (
        <div className="px-4 pb-4 space-y-1.5">
          {benefit && (
            <div className="flex items-start gap-2 text-sm">
              <span className="shrink-0 mt-0.5">💡</span>
              <p className="text-ink-faded leading-snug">{benefit}</p>
            </div>
          )}
          {risk && (
            <div className="flex items-start gap-2 text-sm">
              <span className="shrink-0 mt-0.5">⚠️</span>
              <p className="text-peach-deep leading-snug">{risk}</p>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function NutrientBar({
  label,
  emoji,
  actual,
  target,
  unit,
  coverage,
  isUpperLimit,
  locale,
}: {
  label: string;
  emoji: string;
  actual: number;
  target: number;
  unit: string;
  coverage: number;
  isUpperLimit: boolean;
  locale: "zh-TW" | "en";
}) {
  const pct = Math.min(coverage, 1.5) * 100;
  const color = isUpperLimit
    ? coverage > 1 ? "bg-peach-deep" : "bg-sage-deep"
    : coverage >= 0.9
      ? coverage > 1.5 ? "bg-butter-deep" : "bg-sage-deep"
      : coverage >= 0.5 ? "bg-butter-deep" : "bg-peach";

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-sm font-medium text-ink flex items-center gap-1.5">
          <span>{emoji}</span>
          <span>{label}</span>
        </span>
        <span className="text-xs text-ink-faded tabular-nums">
          {Math.round(actual * 10) / 10}{unit} / {target}{unit}{" "}
          <span className="font-semibold text-ink ml-1">
            {Math.round(coverage * 100)}%
          </span>
        </span>
      </div>
      <div className="h-2.5 rounded-full bg-cream overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all duration-700`}
          style={{ width: `${Math.max(2, pct)}%` }}
          aria-label={`${Math.round(coverage * 100)}% of ${target}${unit} ${locale === "en" ? "daily target" : "每日目標"}`}
        />
      </div>
    </div>
  );
}

function PerFoodCard({
  name,
  portionLabel,
  nutrients,
  bucket,
  priorityNutrients,
  locale,
}: {
  name: string;
  portionLabel: string;
  nutrients: FoodItem["nutrients"];
  bucket: AgeBucket;
  priorityNutrients: Nutrient[];
  locale: "zh-TW" | "en";
}) {
  const targets = RDA[bucket];
  const rows = (Object.keys(targets) as Nutrient[])
    .map((n) => {
      const t = targets[n];
      if (!t) return null;
      const actual = nutrients[n] ?? 0;
      const cvg = t.value > 0 ? actual / t.value : 0;
      return {
        nutrient: n,
        actual,
        target: t.value,
        coverage: cvg,
        unit: t.unit,
        isUpperLimit: !!t.isUpperLimit,
        priority: priorityNutrients.includes(n),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .filter((r) => r.actual > 0 && r.coverage >= 0.01)
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority ? -1 : 1;
      return b.coverage - a.coverage;
    })
    .slice(0, 6);

  return (
    <li className="rounded-bubble bg-white card-pop p-4">
      <div className="flex items-baseline justify-between mb-3">
        <div className="min-w-0">
          <p className="font-display font-semibold text-ink truncate">{name}</p>
          <p className="text-xs text-ink-faded">{portionLabel}</p>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-ink-faded">
          {locale === "en" ? "No significant nutrient contribution." : "對主要營養素貢獻較少。"}
        </p>
      ) : (
        <div className="space-y-2.5">
          {rows.map((r) => (
            <NutrientBar
              key={r.nutrient}
              label={NUTRIENT_LABELS[r.nutrient][locale]}
              emoji={NUTRIENT_LABELS[r.nutrient].emoji}
              actual={r.actual}
              target={r.target}
              unit={r.unit}
              coverage={r.coverage}
              isUpperLimit={r.isUpperLimit}
              locale={locale}
            />
          ))}
        </div>
      )}
    </li>
  );
}
