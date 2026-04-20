"use client";

import { useEffect, useState } from "react";
import type { FoodItem, PortionUnit } from "@/stores/mealStore";
import {
  deriveNewGrams,
  PORTION_UNITS,
  scaleFoodPortion,
} from "@/lib/nutrition/scalePortion";

/**
 * Bottom-sheet that lets the caregiver change how much was actually eaten.
 * Amount + unit are the inputs; we derive grams from the original food's
 * density so "2 tbsp" of honey stays heavier than "2 tbsp" of olive oil.
 *
 * Nutrients are re-scaled proportionally by the grams delta — calorie-for-
 * calorie, iron-for-iron, everything — so the dashboard math never drifts
 * from the amount the user says was consumed.
 *
 * Designed as a full-screen modal on mobile, centered sheet on desktop,
 * matching the app's other sheets (ScanSourceSheet, ProfileSwitcher).
 */

interface Props {
  food: FoodItem;
  locale: "zh-TW" | "en";
  onCancel: () => void;
  onSave: (updated: FoodItem) => void;
}

const UNIT_LABEL: Record<PortionUnit, { en: string; "zh-TW": string }> = {
  g: { en: "g", "zh-TW": "克" },
  ml: { en: "ml", "zh-TW": "毫升" },
  tsp: { en: "tsp", "zh-TW": "茶匙" },
  tbsp: { en: "tbsp", "zh-TW": "湯匙" },
  piece: { en: "pc", "zh-TW": "份" },
};

export function PortionEditSheet({ food, locale, onCancel, onSave }: Props) {
  const L = (en: string, zh: string) => (locale === "en" ? en : zh);

  const [amount, setAmount] = useState<string>(String(food.portionAmount));
  const [unit, setUnit] = useState<PortionUnit>(food.portionUnit);

  // Preview grams as the user types — useful when switching units so they
  // see roughly how much they're claiming to have eaten.
  const parsedAmount = Number(amount);
  const newGrams = Number.isFinite(parsedAmount) && parsedAmount >= 0
    ? deriveNewGrams(food, parsedAmount, unit)
    : food.gramsEstimate;

  // Nothing-changed shortcut — disable save when the input matches the
  // current food so users don't accidentally "save" a noop scaling pass.
  const unchanged =
    parsedAmount === food.portionAmount && unit === food.portionUnit;

  // Quick presets for "half", "a bit", "seconds" — most common adjustments
  // users need. Clicking a preset updates the amount input.
  const presetRatios = [
    { label: L("¼", "1/4"), ratio: 0.25 },
    { label: L("½", "1/2"), ratio: 0.5 },
    { label: L("¾", "3/4"), ratio: 0.75 },
    { label: L("1×", "1 份"), ratio: 1 },
    { label: L("1.5×", "1.5 份"), ratio: 1.5 },
    { label: L("2×", "2 份"), ratio: 2 },
  ];

  // Keep the amount field in sync if the caller remounts with a new food —
  // defensive for edit flows that reuse this component for multiple foods.
  useEffect(() => {
    setAmount(String(food.portionAmount));
    setUnit(food.portionUnit);
  }, [food]);

  function applyPreset(ratio: number) {
    const base = food.portionAmount || 1;
    const next = Math.round(base * ratio * 100) / 100;
    setAmount(String(next));
    setUnit(food.portionUnit); // reset unit when picking a preset
  }

  function save() {
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) return;
    const updated = scaleFoodPortion(food, newGrams, parsedAmount, unit);
    onSave(updated);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 p-0 sm:p-6"
      onClick={onCancel}
    >
      <div
        className="w-full sm:max-w-md bg-cream rounded-t-bubble sm:rounded-bubble p-5 card-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4">
          <p className="text-[11px] text-ink-faded font-medium uppercase tracking-wide">
            {L("Edit portion", "調整份量")}
          </p>
          <p className="font-display font-semibold text-ink text-lg truncate">
            {food.name}
          </p>
          <p className="text-xs text-ink-faded">
            {L("Originally", "原本")}: {food.portionAmount}{" "}
            {UNIT_LABEL[food.portionUnit][locale]} (~{Math.round(food.gramsEstimate)}
            g)
          </p>
        </div>

        {/* Presets — quickest path to the common "I ate half of that" case */}
        <div className="mb-4">
          <p className="text-xs text-ink-faded mb-2">
            {L("Quick pick", "快速選擇")}
          </p>
          <div className="grid grid-cols-6 gap-1.5">
            {presetRatios.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p.ratio)}
                className="py-2 px-1 rounded-card bg-white border border-border hover:border-peach-deep text-sm font-medium text-ink"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Manual amount + unit */}
        <div className="grid grid-cols-5 gap-3 mb-3">
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
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-3 py-2.5 rounded-card border border-border bg-white text-ink text-base"
            />
          </label>
          <div className="col-span-3 block">
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
                    onClick={() => setUnit(u)}
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

        {/* Live grams preview */}
        <p className="text-xs text-ink-faded mb-4 text-center">
          {L("Roughly", "約")} <span className="font-semibold text-ink tabular-nums">{Math.round(newGrams)} g</span>
          {food.gramsEstimate > 0 && (
            <span className="ml-2">
              ({Math.round((newGrams / food.gramsEstimate) * 100)}%{" "}
              {L("of original", "原份量")})
            </span>
          )}
        </p>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-3 px-4 rounded-full border border-border text-ink-soft font-medium hover:bg-white transition"
          >
            {L("Cancel", "取消")}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={unchanged || !Number.isFinite(parsedAmount) || parsedAmount < 0}
            className="flex-1 py-3 px-4 rounded-full bg-sage-deep text-white font-semibold hover:bg-sage-deep/90 transition disabled:opacity-50"
          >
            {L("Save", "儲存")}
          </button>
        </div>
      </div>
    </div>
  );
}
