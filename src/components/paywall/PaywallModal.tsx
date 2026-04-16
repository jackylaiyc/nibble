"use client";

import { useRouter } from "next/navigation";
import type { UsageEvent } from "@/stores/usageStore";

/**
 * Paywall bottom-sheet modal.
 *
 * Opened when a free-tier user hits a daily cap (plate scan or AI chat).
 * Purpose: explain what just happened, surface the lift (unlimited
 * everything + percentile growth + PDF reports), and send them to the
 * pricing page with intent preserved so we can preselect the right plan.
 *
 * We keep the copy short — the pricing page does the heavier selling.
 * This modal is the "hmm, should I?" moment, not the full sale.
 */

interface PaywallModalProps {
  open: boolean;
  /** What the user tried to do — drives the headline + microcopy. */
  reason: UsageEvent | null;
  /** Today's count for the reason event (only for copy; not enforced here). */
  usedToday: number;
  /** Daily cap on their current plan. */
  dailyCap: number;
  locale: "zh-TW" | "en";
  onClose: () => void;
}

export function PaywallModal({
  open,
  reason,
  usedToday,
  dailyCap,
  locale,
  onClose,
}: PaywallModalProps) {
  const router = useRouter();
  if (!open || !reason) return null;

  const L = (en: string, zh: string) => (locale === "en" ? en : zh);

  const headline =
    reason === "scan"
      ? L("You've used today's free scans", "今天的免費分析用完了")
      : L("You've used today's free chats", "今天的免費問答用完了");

  const body =
    reason === "scan"
      ? L(
          `Free accounts can analyze ${dailyCap} plates a day. You've analyzed ${usedToday} so far — upgrade to keep tracking every meal.`,
          `免費版每天可以分析 ${dailyCap} 份餐盤，你今天已經用了 ${usedToday} 份。升級即可繼續記錄每一餐。`,
        )
      : L(
          `Free accounts get ${dailyCap} chat messages a day. You've sent ${usedToday} so far — upgrade for unlimited questions.`,
          `免費版每天可以傳 ${dailyCap} 則訊息，你今天已經用了 ${usedToday} 則。升級即可無限提問。`,
        );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 p-0 sm:p-6"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-cream rounded-t-bubble sm:rounded-bubble p-6 card-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="text-4xl">🍎</div>
          <div className="flex-1">
            <p className="font-display text-xl font-bold text-ink leading-tight">
              {headline}
            </p>
            <p className="mt-2 text-sm text-ink-soft leading-relaxed">
              {body}
            </p>
          </div>
        </div>

        <ul className="mt-5 space-y-2 text-sm text-ink">
          <li className="flex items-center gap-2">
            <span className="text-sage-deep font-semibold">✓</span>
            {L("Unlimited plate scans & AI chat", "無限餐盤分析 + AI 問答")}
          </li>
          <li className="flex items-center gap-2">
            <span className="text-sage-deep font-semibold">✓</span>
            {L(
              "Full WHO growth percentiles + PDF reports",
              "完整 WHO 生長百分位 + PDF 報告",
            )}
          </li>
          <li className="flex items-center gap-2">
            <span className="text-sage-deep font-semibold">✓</span>
            {L("Share cards without watermark", "無浮水印的分享卡片")}
          </li>
          <li className="flex items-center gap-2">
            <span className="text-sage-deep font-semibold">✓</span>
            {L("7 days free — cancel anytime", "7 天免費試用，隨時取消")}
          </li>
        </ul>

        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-3 rounded-full border border-border text-ink-soft"
          >
            {L("Maybe later", "下次再說")}
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              router.push("/app/paywall");
            }}
            className="ml-auto px-6 py-3 rounded-full bg-peach-deep text-white font-semibold bubble-shadow hover:bg-peach-deep/90"
          >
            {L("See plans", "查看方案")} →
          </button>
        </div>
      </div>
    </div>
  );
}
