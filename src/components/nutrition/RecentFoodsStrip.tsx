"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import type { RecentFood } from "@/lib/nutrition/recentFoods";
import { useScanIntakeStore } from "@/stores/scanIntakeStore";

/**
 * Horizontal strip of the caregiver's most-recently-logged foods.
 *
 * Tap a chip → small confirm sheet asking "Log [food] now?" with the
 * remembered portion pre-filled. Save → stash the FoodItem in scanIntakeStore
 * and navigate to /app/scan, which will skip Gemini (pendingFoods branch)
 * and show the usual review + time picker + save flow.
 */

interface Props {
  recents: RecentFood[];
  locale: "zh-TW" | "en";
}

export function RecentFoodsStrip({ recents, locale }: Props) {
  const router = useRouter();
  const setPendingFoods = useScanIntakeStore((s) => s.setPendingFoods);
  const [active, setActive] = useState<RecentFood | null>(null);

  if (recents.length === 0) return null;

  const L = (en: string, zh: string) => (locale === "en" ? en : zh);

  function confirm(r: RecentFood) {
    setActive(r);
  }

  function logNow() {
    if (!active) return;
    setPendingFoods([active.food]);
    setActive(null);
    router.push("/app/scan");
  }

  return (
    <>
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-display font-semibold text-ink">
            {L("Recent foods", "最近吃過")}
          </h2>
          <p className="text-[11px] text-ink-faded">
            {L("Tap to log again", "點一下再次記錄")}
          </p>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
          {recents.map((r, i) => (
            <button
              key={`${r.food.nameEn || r.food.name}-${i}`}
              type="button"
              onClick={() => confirm(r)}
              className="shrink-0 rounded-full bg-white border border-border px-3 py-2 text-sm font-medium text-ink hover:border-peach-deep transition flex items-center gap-2"
            >
              <span>🍴</span>
              <span className="max-w-[10rem] truncate">{r.food.name}</span>
              <span className="text-[11px] text-ink-faded tabular-nums">
                {r.food.portionAmount} {r.food.portionUnit}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Confirm sheet */}
      {active && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 p-0 sm:p-6"
          onClick={() => setActive(null)}
        >
          <div
            className="w-full sm:max-w-md bg-cream rounded-t-bubble sm:rounded-bubble p-6 card-pop"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-display text-base font-semibold text-ink mb-1">
              {L(`Log ${active.food.name} now?`, `現在記錄 ${active.food.name}？`)}
            </p>
            <p className="text-sm text-ink-soft mb-4">
              {L(
                `Same portion as last time: ${active.food.portionAmount} ${active.food.portionUnit} (~${Math.round(active.food.gramsEstimate)}g).`,
                `跟上次一樣：${active.food.portionAmount} ${active.food.portionUnit}（約 ${Math.round(active.food.gramsEstimate)}g）。`,
              )}
            </p>
            <p className="text-[11px] text-ink-faded mb-4">
              {L(
                "You can adjust the time on the next screen.",
                "時間可以在下一頁調整。",
              )}
            </p>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActive(null)}
                className="flex-1 px-4 py-3 rounded-full border border-border text-ink-soft font-medium"
              >
                {L("Cancel", "取消")}
              </button>
              <button
                type="button"
                onClick={logNow}
                className="flex-1 px-4 py-3 rounded-full bg-peach-deep text-white font-semibold hover:bg-peach-deep/90 transition"
              >
                {L("Log it", "記錄")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
