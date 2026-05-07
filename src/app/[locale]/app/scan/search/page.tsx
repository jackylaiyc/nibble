"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import {
  searchAllFoods,
  resultToFoodItem,
  type FoodSearchResult,
} from "@/lib/nutrition/foodSearch";
import { useScanIntakeStore } from "@/stores/scanIntakeStore";
import type { PortionUnit } from "@/stores/mealStore";

/**
 * Text-search & quick-add page.
 *
 * Flow:
 *   1. User types a food name → debounced search against the local
 *      China + Japan DBs via searchAllFoods().
 *   2. User picks a result → portion modal (amount + unit).
 *   3. Save → resultToFoodItem() scales to the chosen grams; we stash it
 *      in scanIntakeStore and route to /app/scan for the normal review +
 *      time picker + save-to-meal-store flow.
 */

type Step = "search" | "portion";

const UNIT_OPTIONS: { value: PortionUnit; grams: number }[] = [
  { value: "g", grams: 1 },
  { value: "tsp", grams: 5 },
  { value: "tbsp", grams: 15 },
  { value: "ml", grams: 1 },
  { value: "piece", grams: 30 },
];

export default function SearchFoodPage() {
  const locale = useLocale() as "zh-TW" | "en";
  const router = useRouter();
  const setPendingFoods = useScanIntakeStore((s) => s.setPendingFoods);

  const [step, setStep] = useState<Step>("search");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selected, setSelected] = useState<FoodSearchResult | null>(null);
  const [portionAmount, setPortionAmount] = useState<number>(30);
  const [portionUnit, setPortionUnit] = useState<PortionUnit>("g");

  const L = (en: string, zh: string) => (locale === "en" ? en : zh);

  // Debounce the query (250ms) so we don't re-scan the full DB per keystroke.
  useEffect(() => {
    const h = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(h);
  }, [query]);

  // Cap at 10 results — a longer list buries the right answer in
  // similarly-named compounds and makes the page noisy.
  const results = useMemo(
    () => searchAllFoods(debounced, 10),
    [debounced],
  );

  function pick(r: FoodSearchResult) {
    setSelected(r);
    // Sensible default: 30g, adjustable in the portion modal.
    setPortionAmount(30);
    setPortionUnit("g");
    setStep("portion");
  }

  function saveAndReview() {
    if (!selected) return;
    const perUnitGrams =
      UNIT_OPTIONS.find((u) => u.value === portionUnit)?.grams ?? 1;
    const grams = Math.max(1, Math.round(portionAmount * perUnitGrams));
    const food = resultToFoodItem(selected, portionAmount, portionUnit, grams);
    setPendingFoods([food]);
    router.push("/app/scan");
  }

  if (step === "portion" && selected) {
    return (
      <main className="min-h-screen bg-cream pb-28">
        <header className="sticky top-0 z-20 bg-cream/95 backdrop-blur-md border-b border-border">
          <div className="max-w-xl mx-auto px-5 py-4 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setStep("search")}
              className="text-ink-faded hover:text-ink -ml-1"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <p className="font-display font-semibold text-ink flex-1 min-w-0 truncate">
              {L("How much?", "份量多少？")}
            </p>
          </div>
        </header>

        <div className="max-w-xl mx-auto px-5 py-6 space-y-6">
          <div className="rounded-bubble bg-white card-pop p-5">
            <p className="text-xs text-ink-faded uppercase tracking-wide mb-1">
              {L("Selected food", "選擇的食物")}
            </p>
            <p className="font-display font-semibold text-ink text-lg">
              {selected.name}
            </p>
            <p className="text-xs text-ink-faded mt-1">
              {selected.source === "china" ? L("China DB", "中國食品成份") : L("Japan DB", "日本食品成份")}
            </p>
          </div>

          <div className="rounded-bubble bg-white card-pop p-5 space-y-4">
            <div>
              <label className="block">
                <span className="text-xs text-ink-faded mb-1 block">
                  {L("Amount", "數量")}
                </span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  inputMode="decimal"
                  value={portionAmount}
                  onChange={(e) => setPortionAmount(Number(e.target.value) || 0)}
                  className="w-full px-3 py-3 rounded-card border border-border bg-white text-ink text-base"
                />
              </label>
            </div>

            <div>
              <span className="text-xs text-ink-faded mb-2 block">
                {L("Unit", "單位")}
              </span>
              <div className="grid grid-cols-5 gap-2">
                {UNIT_OPTIONS.map((u) => (
                  <button
                    key={u.value}
                    type="button"
                    onClick={() => setPortionUnit(u.value)}
                    className={`py-2 rounded-card text-sm font-medium transition-all ${
                      portionUnit === u.value
                        ? "bg-sage/40 ring-2 ring-sage-deep text-ink"
                        : "bg-white border border-border text-ink-soft hover:border-sage-deep"
                    }`}
                  >
                    {u.value}
                  </button>
                ))}
              </div>
            </div>

            <p className="text-[11px] text-ink-faded">
              {L(
                `≈ ${Math.round(portionAmount * (UNIT_OPTIONS.find((u) => u.value === portionUnit)?.grams ?? 1))} g`,
                `約 ${Math.round(portionAmount * (UNIT_OPTIONS.find((u) => u.value === portionUnit)?.grams ?? 1))} 克`,
              )}
            </p>
          </div>

          <button
            type="button"
            onClick={saveAndReview}
            disabled={portionAmount <= 0}
            className="w-full px-8 py-4 rounded-full bg-peach-deep text-white font-semibold text-lg bubble-shadow hover:bg-peach-deep/90 transition disabled:opacity-50"
          >
            {L("Continue →", "下一步 →")}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-cream pb-28">
      <header className="sticky top-0 z-20 bg-cream/95 backdrop-blur-md border-b border-border">
        <div className="max-w-xl mx-auto px-5 py-4 flex items-center gap-3">
          <Link
            href="/app"
            className="text-ink-faded hover:text-ink -ml-1"
            aria-label={L("Back", "返回")}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </Link>
          <p className="font-display font-semibold text-ink flex-1 min-w-0">
            {L("Search food", "搜尋食物")}
          </p>
        </div>
        <div className="max-w-xl mx-auto px-5 pb-4">
          <input
            type="search"
            autoFocus
            placeholder={L(
              "e.g. oatmeal, yogurt, banana…",
              "例如：燕麥、優格、香蕉⋯",
            )}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full px-4 py-3 rounded-full border border-border bg-white text-ink placeholder:text-ink-faded focus:outline-none focus:border-peach-deep"
          />
        </div>
      </header>

      <div className="max-w-xl mx-auto px-5 py-6">
        {debounced.trim() === "" && (
          <div className="text-center text-ink-faded py-10">
            <div className="text-4xl mb-3">🔍</div>
            <p className="text-sm">
              {L(
                "Type a food name to start searching.",
                "輸入食物名稱開始搜尋。",
              )}
            </p>
          </div>
        )}

        {debounced.trim() !== "" && results.length === 0 && (
          <div className="text-center text-ink-faded py-10">
            <p className="text-sm">
              {L(
                "No matches. Try a shorter or simpler name.",
                "找不到。試試更簡短或常見的名稱。",
              )}
            </p>
          </div>
        )}

        <ul className="space-y-2">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => pick(r)}
                className="w-full p-4 rounded-card bg-white border border-border hover:border-peach-deep text-left flex items-center gap-3 transition"
              >
                <span className="text-xl">🥣</span>
                <div className="flex-1 min-w-0">
                  {/* When the result rode in on a synonym-group match,
                      surface its English label up front so the user
                      doesn't have to read the Chinese to identify it.
                      The DB name follows in muted text. */}
                  {r.englishLabel ? (
                    <p className="font-medium text-ink truncate">
                      <span className="capitalize">{r.englishLabel}</span>
                      <span className="text-ink-faded mx-1.5">·</span>
                      <span className="text-ink-soft">{r.name}</span>
                    </p>
                  ) : (
                    <p className="font-medium text-ink truncate">{r.name}</p>
                  )}
                  <p className="text-xs text-ink-faded">
                    {r.source === "china" ? L("China DB", "中國食品成份") : L("Japan DB", "日本食品成份")}
                    {typeof r.per100g.calories === "number" && (
                      <> · {Math.round(r.per100g.calories)} kcal / 100g</>
                    )}
                  </p>
                </div>
                <span className="text-ink-faded">→</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
