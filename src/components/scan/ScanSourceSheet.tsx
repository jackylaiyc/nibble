"use client";

import { useRef } from "react";
import { useRouter } from "@/i18n/navigation";
import { useScanIntakeStore } from "@/stores/scanIntakeStore";

/**
 * Bottom-sheet offering the three ways to start a meal-log:
 *   📸 Photo   → native file picker → scan page runs Gemini
 *   📊 Barcode → fullscreen scanner (/app/scan/barcode)
 *   🔍 Search  → text search & quick-add (/app/scan/search)
 *
 * Used from both the dashboard hero CTA and the bottom-nav Scan tab.
 * Owns the hidden file input for the Photo path so callers don't need
 * to wire that up themselves.
 */

interface ScanSourceSheetProps {
  open: boolean;
  locale: "zh-TW" | "en";
  onClose: () => void;
}

export function ScanSourceSheet({ open, locale, onClose }: ScanSourceSheetProps) {
  const router = useRouter();
  const setPendingFile = useScanIntakeStore((s) => s.setPendingFile);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const L = (en: string, zh: string) => (locale === "en" ? en : zh);

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPendingFile(file);
    onClose();
    router.push("/app/scan");
  }

  function goBarcode() {
    onClose();
    router.push("/app/scan/barcode");
  }

  function goSearch() {
    onClose();
    router.push("/app/scan/search");
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handlePhotoChange}
      />

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 p-0 sm:p-6"
          onClick={onClose}
        >
          <div
            className="w-full sm:max-w-md bg-cream rounded-t-bubble sm:rounded-bubble p-6 card-pop"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-display text-lg font-semibold text-ink mb-4 text-center">
              {L("How are you logging this meal?", "怎麼記錄這一餐？")}
            </p>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-4 px-4 rounded-card bg-white border border-border flex items-center gap-3 font-medium text-ink hover:border-peach-deep transition text-left"
              >
                <span className="text-2xl">📸</span>
                <div className="flex-1 min-w-0">
                  <p>{L("Take a photo", "拍照")}</p>
                  <p className="text-xs text-ink-faded font-normal">
                    {L("AI identifies foods + nutrients", "AI 辨識食物與營養")}
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={goBarcode}
                className="w-full py-4 px-4 rounded-card bg-white border border-border flex items-center gap-3 font-medium text-ink hover:border-sage-deep transition text-left"
              >
                <span className="text-2xl">📊</span>
                <div className="flex-1 min-w-0">
                  <p>{L("Scan barcode", "掃描條碼")}</p>
                  <p className="text-xs text-ink-faded font-normal">
                    {L("For packaged baby food, pouches, formula", "包裝副食品、果泥、奶粉")}
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={goSearch}
                className="w-full py-4 px-4 rounded-card bg-white border border-border flex items-center gap-3 font-medium text-ink hover:border-butter-deep transition text-left"
              >
                <span className="text-2xl">🔍</span>
                <div className="flex-1 min-w-0">
                  <p>{L("Search & add", "搜尋食物")}</p>
                  <p className="text-xs text-ink-faded font-normal">
                    {L("Type a food name — oatmeal, yogurt, rice…", "輸入食物名稱 — 燕麥、優格、米飯⋯")}
                  </p>
                </div>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-full mt-3 py-3 px-4 rounded-card text-ink-soft font-medium hover:bg-white/60 transition"
            >
              {L("Cancel", "取消")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
