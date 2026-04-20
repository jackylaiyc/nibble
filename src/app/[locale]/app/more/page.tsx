"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuthStore } from "@/stores/authStore";

/**
 * "More" page — secondary features that aren't part of the main scan flow,
 * plus the account section (sign-out) at the bottom.
 */

const FEATURES = [
  { emoji: "💬", href: "/app/chat" as const, en: "Ask Nibble", zh: "問 Nibble", subEn: "AI feeding assistant", subZh: "AI 餵養助手" },
  { emoji: "🤱", href: "/app/baby-feed/log" as const, en: "Baby feed log", zh: "寶寶餵食", subEn: "Breastfeeds, formula, diapers (0-6mo)", subZh: "哺乳、配方奶、尿布（0-6 個月）" },
  { emoji: "📋", href: "/app/baby-feed/history" as const, en: "Baby feed history", zh: "寶寶餵食紀錄", subEn: "Past feeds grouped by day", subZh: "過去餵食紀錄依日期分組" },
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
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
      // signOut() does a full window.location = "/" itself; this is just
      // defensive in case it's ever changed to be non-redirecting.
    } catch (err) {
      console.error("[more] sign-out failed:", err);
      setSigningOut(false);
    }
  }

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

        {/* Account section — only rendered once we know who's signed in.
            Middleware gates /app/* behind auth so we always expect a user
            here, but we guard anyway in case auth is disabled for local dev. */}
        {user && (
          <section className="mt-10 pt-6 border-t border-border">
            <h2 className="font-display font-semibold text-ink text-sm mb-3 px-1">
              {locale === "en" ? "Account" : "帳戶"}
            </h2>
            <div className="rounded-card bg-white border border-border p-4 space-y-3">
              <div>
                <p className="text-xs text-ink-faded">
                  {locale === "en" ? "Signed in as" : "目前登入"}
                </p>
                <p className="text-sm font-medium text-ink truncate">
                  {user.email ?? user.id}
                </p>
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                disabled={signingOut}
                className="w-full py-2.5 rounded-full border border-border hover:border-peach-deep text-sm font-medium text-ink transition disabled:opacity-60"
              >
                {signingOut
                  ? locale === "en"
                    ? "Signing out…"
                    : "登出中…"
                  : locale === "en"
                    ? "Sign out"
                    : "登出"}
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
