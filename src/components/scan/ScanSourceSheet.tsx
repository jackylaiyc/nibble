"use client";

import { useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useScanIntakeStore } from "@/stores/scanIntakeStore";
import type { FoodItem } from "@/stores/mealStore";

/**
 * Bottom-sheet offering four ways to start a meal-log:
 *   📸 Photo           — native file picker → scan page runs Gemini vision
 *   🏷️ Nutrition label — OCR on a packaging label (fastest fix when the
 *                         plate scan misidentifies). Same endpoint used by
 *                         the barcode "not found" fallback, now surfaced
 *                         as a first-class option for any plate-scan miss.
 *   📊 Barcode         — fullscreen scanner (/app/scan/barcode)
 *   🔍 Search          — text search & quick-add (/app/scan/search)
 *
 * Used from both the dashboard hero CTA and the bottom-nav Scan tab.
 * Owns the hidden file inputs for the Photo and Label paths so callers
 * don't need to wire them up themselves.
 */

interface ScanSourceSheetProps {
  open: boolean;
  locale: "zh-TW" | "en";
  onClose: () => void;
}

export function ScanSourceSheet({ open, locale, onClose }: ScanSourceSheetProps) {
  const router = useRouter();
  const setPendingFile = useScanIntakeStore((s) => s.setPendingFile);
  const setPendingFoods = useScanIntakeStore((s) => s.setPendingFoods);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const labelInputRef = useRef<HTMLInputElement | null>(null);

  // Label OCR is a server round-trip. Track upload/parse lifecycle so we
  // can show a spinner while it resolves — otherwise the sheet looks frozen.
  const [labelBusy, setLabelBusy] = useState(false);
  const [labelError, setLabelError] = useState<string | null>(null);

  const L = (en: string, zh: string) => (locale === "en" ? en : zh);

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPendingFile(file);
    onClose();
    router.push("/app/scan");
  }

  async function handleLabelChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setLabelError(null);
    setLabelBusy(true);
    try {
      const dataUrl = await compressForLabelOcr(file);
      const commaIdx = dataUrl.indexOf(",");
      const base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;

      const res = await fetch("/api/ai/nutrition-label", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64, mimeType: "image/jpeg" }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`${res.status}: ${txt.slice(0, 120)}`);
      }
      const data = (await res.json()) as {
        found: boolean;
        food?: FoodItem;
        reason?: string;
      };
      if (!data.found || !data.food) {
        throw new Error(
          data.reason ??
            L(
              "Couldn't read the label — try a clearer photo.",
              "無法讀取標籤，請換張清楚的照片。",
            ),
        );
      }
      setPendingFoods([data.food]);
      onClose();
      router.push("/app/scan");
    } catch (err) {
      console.error("[scan-sheet] label OCR failed:", err);
      setLabelError(
        err instanceof Error
          ? err.message
          : L("Label read failed", "標籤辨識失敗"),
      );
    } finally {
      setLabelBusy(false);
    }
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
        ref={photoInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handlePhotoChange}
      />
      <input
        ref={labelInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleLabelChange}
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
              <SheetButton
                emoji="📸"
                title={L("Take a photo", "拍照")}
                sub={L("AI identifies foods + nutrients", "AI 辨識食物與營養")}
                accent="hover:border-peach-deep"
                onClick={() => photoInputRef.current?.click()}
                disabled={labelBusy}
              />
              <SheetButton
                emoji="🏷️"
                title={L("Scan nutrition label", "拍營養標籤")}
                sub={
                  labelBusy
                    ? L("Reading the label…", "正在讀取標籤⋯")
                    : L(
                        "For packaged food when the plate scan isn't right",
                        "包裝食品的最佳選擇，若拍整盤辨識不準可改用這個",
                      )
                }
                accent="hover:border-peach-deep"
                onClick={() => labelInputRef.current?.click()}
                disabled={labelBusy}
                busy={labelBusy}
              />
              <SheetButton
                emoji="📊"
                title={L("Scan barcode", "掃描條碼")}
                sub={L(
                  "For packaged baby food, pouches, formula",
                  "包裝副食品、果泥、奶粉",
                )}
                accent="hover:border-sage-deep"
                onClick={goBarcode}
                disabled={labelBusy}
              />
              <SheetButton
                emoji="🔍"
                title={L("Search & add", "搜尋食物")}
                sub={L(
                  "Type a food name — oatmeal, yogurt, rice…",
                  "輸入食物名稱 — 燕麥、優格、米飯⋯",
                )}
                accent="hover:border-butter-deep"
                onClick={goSearch}
                disabled={labelBusy}
              />
            </div>

            {labelError && (
              <p className="mt-3 text-xs text-peach-deep text-center">
                {labelError}
              </p>
            )}

            <button
              type="button"
              onClick={onClose}
              disabled={labelBusy}
              className="w-full mt-3 py-3 px-4 rounded-card text-ink-soft font-medium hover:bg-white/60 transition disabled:opacity-60"
            >
              {L("Cancel", "取消")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────

function SheetButton({
  emoji,
  title,
  sub,
  accent,
  onClick,
  disabled,
  busy,
}: {
  emoji: string;
  title: string;
  sub: string;
  accent: string;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full py-4 px-4 rounded-card bg-white border border-border flex items-center gap-3 font-medium text-ink transition text-left ${accent} disabled:opacity-60 disabled:cursor-not-allowed`}
    >
      <span className="text-2xl shrink-0">{busy ? "⏳" : emoji}</span>
      <div className="flex-1 min-w-0">
        <p>{title}</p>
        <p className="text-xs text-ink-faded font-normal">{sub}</p>
      </div>
    </button>
  );
}

/** Compress for label OCR: 1200px max edge, 85% quality JPEG. Labels need
 *  enough detail that Gemini can read small-print nutrient numbers, but we
 *  don't want to ship 3 MB+ raw phone photos to the API. */
function compressForLabelOcr(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      if (typeof dataUrl !== "string") {
        reject(new Error("Reader returned non-string"));
        return;
      }
      const img = new Image();
      img.onload = () => {
        const maxEdge = 1200;
        const ratio = Math.min(1, maxEdge / Math.max(img.width, img.height));
        const w = Math.round(img.width * ratio);
        const h = Math.round(img.height * ratio);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        try {
          resolve(canvas.toDataURL("image/jpeg", 0.85));
        } catch {
          resolve(dataUrl);
        }
      };
      img.onerror = () => reject(new Error("Image decode failed"));
      img.src = dataUrl;
    };
    reader.onerror = () => reject(reader.error ?? new Error("Reader error"));
    reader.readAsDataURL(file);
  });
}
