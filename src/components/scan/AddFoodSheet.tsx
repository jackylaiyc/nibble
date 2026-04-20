"use client";

import { useEffect, useMemo, useState } from "react";
import type { FoodItem, PortionUnit } from "@/stores/mealStore";
import {
  resultToFoodItem,
  searchAllFoods,
  type FoodSearchResult,
} from "@/lib/nutrition/foodSearch";
import {
  deriveNewGrams,
  PORTION_UNITS,
} from "@/lib/nutrition/scalePortion";

/**
 * Bottom-sheet to add a food the AI missed (or the user ate on top of what
 * was scanned). Two paths:
 *
 *   1. Search existing foods — reuses the local China + Japan DB via
 *      searchAllFoods(). Pick a match, set an amount, done.
 *   2. Quick custom — name + amount + unit, nutrients stay empty. Good for
 *      "a small bite of X" when we don't have or need precise nutrition.
 *
 * Mirrors the shape of the search flow (/app/scan/search) but inline so
 * the user doesn't lose their review context when adding one extra item.
 */

interface Props {
  locale: "zh-TW" | "en";
  onCancel: () => void;
  onAdd: (food: FoodItem) => void;
}

type Mode = "search" | "portion" | "custom";

const UNIT_LABEL: Record<PortionUnit, { en: string; "zh-TW": string }> = {
  g: { en: "g", "zh-TW": "克" },
  ml: { en: "ml", "zh-TW": "毫升" },
  tsp: { en: "tsp", "zh-TW": "茶匙" },
  tbsp: { en: "tbsp", "zh-TW": "湯匙" },
  piece: { en: "pc", "zh-TW": "份" },
};

const DEFAULT_GRAMS_PER_UNIT: Record<PortionUnit, number> = {
  g: 1,
  ml: 1,
  tsp: 5,
  tbsp: 15,
  piece: 50,
};

export function AddFoodSheet({ locale, onCancel, onAdd }: Props) {
  const L = (en: string, zh: string) => (locale === "en" ? en : zh);

  const [mode, setMode] = useState<Mode>("search");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [picked, setPicked] = useState<FoodSearchResult | null>(null);

  const [amount, setAmount] = useState<number>(30);
  const [unit, setUnit] = useState<PortionUnit>("g");

  // Custom mode fields
  const [customName, setCustomName] = useState("");

  useEffect(() => {
    const h = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(h);
  }, [query]);

  const results = useMemo(() => searchAllFoods(debounced, 12), [debounced]);

  function pickResult(r: FoodSearchResult) {
    setPicked(r);
    setAmount(30);
    setUnit("g");
    setMode("portion");
  }

  function confirmSearchPick() {
    if (!picked) return;
    const grams = Math.max(
      1,
      Math.round(amount * DEFAULT_GRAMS_PER_UNIT[unit]),
    );
    const food = resultToFoodItem(picked, amount, unit, grams);
    onAdd(food);
  }

  function confirmCustom() {
    const name = customName.trim();
    if (!name || !Number.isFinite(amount) || amount <= 0) return;

    // No nutrient data for custom adds — better than making numbers up.
    // The food still shows on the list and contributes zero to totals.
    const food: FoodItem = {
      name,
      nameEn: name,
      portionAmount: amount,
      portionUnit: unit,
      gramsEstimate: deriveNewGrams(
        {
          name,
          nameEn: name,
          portionAmount: 1,
          portionUnit: unit,
          gramsEstimate: DEFAULT_GRAMS_PER_UNIT[unit],
          nutrients: {},
        } as FoodItem,
        amount,
        unit,
      ),
      nutrients: {},
      allergensPresent: [],
      source: "local-db",
    };
    onAdd(food);
  }

  const saveDisabled =
    (mode === "portion" && (!picked || amount <= 0)) ||
    (mode === "custom" && (!customName.trim() || amount <= 0));

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 p-0 sm:p-6"
      onClick={onCancel}
    >
      <div
        className="w-full sm:max-w-md bg-cream rounded-t-bubble sm:rounded-bubble p-5 card-pop flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with back + title */}
        <div className="mb-3 flex items-center gap-2">
          {mode !== "search" && (
            <button
              type="button"
              onClick={() => {
                setMode("search");
                setPicked(null);
              }}
              className="text-ink-faded hover:text-ink"
              aria-label={L("Back", "返回")}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          )}
          <p className="font-display font-semibold text-ink text-lg flex-1">
            {mode === "search" && L("Add a food", "新增食物")}
            {mode === "portion" && L("How much?", "份量多少？")}
            {mode === "custom" && L("Custom food", "自訂食物")}
          </p>
        </div>

        {mode === "search" && (
          <>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={L(
                "e.g. rice, yogurt, egg…",
                "例：白飯、優格、蛋⋯",
              )}
              className="w-full px-4 py-3 rounded-card border border-border bg-white text-ink text-base mb-3"
              autoFocus
            />

            <div className="flex-1 overflow-y-auto -mx-5 px-5">
              {debounced.length === 0 && (
                <p className="text-sm text-ink-faded text-center py-8">
                  {L(
                    "Type to find a food, or create a custom one below.",
                    "輸入名稱搜尋食物，或在下方建立自訂食物。",
                  )}
                </p>
              )}

              {debounced.length > 0 && results.length === 0 && (
                <p className="text-sm text-ink-faded text-center py-8">
                  {L(
                    "No match. Try a different name, or create a custom food.",
                    "找不到相符食物。請換個名字，或建立自訂食物。",
                  )}
                </p>
              )}

              {results.length > 0 && (
                <ul className="space-y-1.5">
                  {results.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => pickResult(r)}
                        className="w-full text-left p-3 rounded-card bg-white border border-border hover:border-peach-deep transition"
                      >
                        <p className="font-medium text-ink truncate">{r.name}</p>
                        <p className="text-[11px] text-ink-faded">
                          {r.source === "china"
                            ? L("China food DB", "中國食品成份")
                            : L("Japan food DB", "日本食品成份")}
                          {r.per100g.calories != null && (
                            <span>
                              {" · "}
                              {Math.round(r.per100g.calories)} kcal / 100g
                            </span>
                          )}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                setCustomName(query); // pre-fill with what they typed
                setAmount(30);
                setUnit("g");
                setMode("custom");
              }}
              className="mt-3 w-full py-3 px-4 rounded-card border-2 border-dashed border-border text-ink-soft font-medium hover:border-peach-deep hover:text-peach-deep transition flex items-center justify-center gap-2"
            >
              <span className="text-lg leading-none">+</span>
              {L("Create custom food", "建立自訂食物")}
            </button>
          </>
        )}

        {mode === "portion" && picked && (
          <>
            <div className="rounded-card bg-white border border-border p-3 mb-4">
              <p className="font-medium text-ink">{picked.name}</p>
              <p className="text-[11px] text-ink-faded mt-0.5">
                {picked.source === "china"
                  ? L("China DB", "中國食品成份")
                  : L("Japan DB", "日本食品成份")}
                {picked.per100g.calories != null && (
                  <> · {Math.round(picked.per100g.calories)} kcal / 100g</>
                )}
              </p>
            </div>

            <PortionInputs
              locale={locale}
              amount={amount}
              unit={unit}
              onAmount={setAmount}
              onUnit={setUnit}
            />

            <button
              type="button"
              onClick={confirmSearchPick}
              disabled={saveDisabled}
              className="mt-4 w-full py-3 px-4 rounded-full bg-sage-deep text-white font-semibold hover:bg-sage-deep/90 transition disabled:opacity-50"
            >
              {L("Add to meal", "加入這餐")}
            </button>
          </>
        )}

        {mode === "custom" && (
          <>
            <label className="block mb-3">
              <span className="text-xs text-ink-faded mb-1 block">
                {L("Food name", "食物名稱")}
              </span>
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder={L("e.g. leftover stew", "例：剩的燉菜")}
                className="w-full px-3 py-2.5 rounded-card border border-border bg-white text-ink text-base"
                autoFocus
              />
            </label>

            <PortionInputs
              locale={locale}
              amount={amount}
              unit={unit}
              onAmount={setAmount}
              onUnit={setUnit}
            />

            <p className="mt-3 text-[11px] text-ink-faded leading-snug">
              {L(
                "Nutrients aren't estimated for custom foods — this just appears on the list. Use search above when you want the numbers.",
                "自訂食物不會估算營養素，只會顯示在清單中。若需營養數據，請從上方搜尋。",
              )}
            </p>

            <button
              type="button"
              onClick={confirmCustom}
              disabled={saveDisabled}
              className="mt-4 w-full py-3 px-4 rounded-full bg-sage-deep text-white font-semibold hover:bg-sage-deep/90 transition disabled:opacity-50"
            >
              {L("Add to meal", "加入這餐")}
            </button>
          </>
        )}

        <button
          type="button"
          onClick={onCancel}
          className="mt-2 w-full py-2.5 px-4 rounded-card text-ink-soft font-medium hover:bg-white/60 transition"
        >
          {L("Cancel", "取消")}
        </button>
      </div>
    </div>
  );
}

// ─── small portion-input subcomponent shared by search-pick + custom ──────

function PortionInputs({
  locale,
  amount,
  unit,
  onAmount,
  onUnit,
}: {
  locale: "zh-TW" | "en";
  amount: number;
  unit: PortionUnit;
  onAmount: (v: number) => void;
  onUnit: (u: PortionUnit) => void;
}) {
  const L = (en: string, zh: string) => (locale === "en" ? en : zh);
  return (
    <div className="grid grid-cols-5 gap-3">
      <label className="col-span-2 block">
        <span className="text-xs text-ink-faded mb-1 block">
          {L("Amount", "數量")}
        </span>
        <input
          type="number"
          min="0"
          step="0.1"
          inputMode="decimal"
          value={amount}
          onChange={(e) => onAmount(Number(e.target.value))}
          className="w-full px-3 py-2.5 rounded-card border border-border bg-white text-ink text-base"
        />
      </label>
      <div className="col-span-3">
        <span className="text-xs text-ink-faded mb-1 block">
          {L("Unit", "單位")}
        </span>
        <div className="flex flex-wrap gap-1.5">
          {PORTION_UNITS.map((u) => {
            const active = u === unit;
            return (
              <button
                key={u}
                type="button"
                onClick={() => onUnit(u)}
                className={`px-2.5 py-1.5 rounded-full text-xs font-medium border transition ${
                  active
                    ? "bg-peach-deep text-white border-peach-deep"
                    : "bg-white border-border text-ink-soft hover:border-peach-deep"
                }`}
              >
                {UNIT_LABEL[u][locale]}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
