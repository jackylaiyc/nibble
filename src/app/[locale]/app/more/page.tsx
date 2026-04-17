"use client";

import { useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";

/**
 * "More" page — secondary features that aren't part of the main scan flow.
 */

const FEATURES = [
  { emoji: "💬", href: "/app/chat" as const, en: "Ask Nibble", zh: "問 Nibble", subEn: "AI feeding assistant", subZh: "AI 餵養助手" },
  { emoji: "💩", href: "/app/poop/log" as const, en: "Poop log", zh: "便便紀錄", subEn: "Track color & consistency", subZh: "追蹤顏色與形狀" },
  { emoji: "📋", href: "/app/poop/history" as const, en: "Poop history", zh: "便便歷史", subEn: "Browse past logs", subZh: "瀏覽過去紀錄" },
  { emoji: "😴", href: "/app/sleep" as const, en: "Sleep log", zh: "睡眠紀錄", subEn: "Naps & night sleep", subZh: "午睡與夜間睡眠" },
  { emoji: "⭐", href: "/app/milestones" as const, en: "Milestones", zh: "里程碑", subEn: "Track firsts & celebrations", subZh: "追蹤寶貝的第一次" },
  { emoji: "⚠️", href: "/app/reactions" as const, en: "Reaction log", zh: "過敏紀錄", subEn: "Food allergy tracking", subZh: "食物過敏追蹤" },
  { emoji: "📏", href: "/app/growth" as const, en: "Growth", zh: "生長紀錄", subEn: "Weight, height & head", subZh: "體重、身高與頭圍" },
  { emoji: "💰", href: "/app/paywall" as const, en: "Subscription", zh: "訂閱方案", subEn: "Manage your plan", subZh: "管理你的方案" },
];

export default function MorePage() {
  const locale = useLocale() as "zh-TW" | "en";

  return (
    <main className="min-h-screen bg-cream pb-28">
      <div className="max-w-xl mx-auto px-5 pt-6">
        <h1 className="font-display font-bold text-ink text-xl mb-6">
          {locale === "en" ? "More" : "更多功能"}
        </h1>

        <ul className="space-y-2">
          {FEATURES.map((f) => (
            <li key={f.href}>
              <Link
                href={f.href}
                className="flex items-center gap-4 p-4 rounded-card bg-white border border-border hover:border-peach/40 transition"
              >
                <span className="text-2xl">{f.emoji}</span>
                <div>
                  <p className="font-medium text-ink">
                    {locale === "en" ? f.en : f.zh}
                  </p>
                  <p className="text-xs text-ink-faded">
                    {locale === "en" ? f.subEn : f.subZh}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
