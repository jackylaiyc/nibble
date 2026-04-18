"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useChildProfileStore } from "@/stores/childProfileStore";
import { useMealStore } from "@/stores/mealStore";
import { useScanIntakeStore } from "@/stores/scanIntakeStore";
import { ageInfoFromDob } from "@/lib/pediatric/ageBucket";
import {
  PRIORITY_NUTRIENTS,
  NUTRIENT_LABELS,
  RDA,
  type Nutrient,
} from "@/lib/pediatric/rdaTables";
import { computeCoverage, sumMeals } from "@/lib/pediatric/rdaGapAnalysis";
import {
  buildDailySummary,
  dateToSummarize,
} from "@/lib/pediatric/dailySummary";
import { RDARing } from "@/components/pediatric/RDARing";
import { DailySummaryCard } from "@/components/nutrition/DailySummaryCard";
import {
  fireLocalNotification,
  getNotificationSupport,
  requestNotificationPermission,
  type NotificationSupport,
} from "@/lib/notifications";

/**
 * Dashboard — Today's nutrition is the hero.
 *
 * Layout: header → daily RDA rings → scan CTA → today's meals → quick links.
 * Everything centres on "did baby eat enough today?"
 */

const QUICK_LINKS = [
  { emoji: "💬", href: "/app/chat" as const, en: "Ask Nibble", zh: "問 Nibble" },
  { emoji: "💩", href: "/app/poop/log" as const, en: "Poop log", zh: "便便紀錄" },
  { emoji: "📏", href: "/app/growth" as const, en: "Growth", zh: "生長紀錄" },
  { emoji: "⭐", href: "/app/milestones" as const, en: "Milestones", zh: "里程碑" },
];

export default function AppDashboard() {
  const locale = useLocale() as "zh-TW" | "en";
  const router = useRouter();

  const loadChildren = useChildProfileStore((s) => s.loadFromStorage);
  const childLoaded = useChildProfileStore((s) => s.loaded);
  const activeChild = useChildProfileStore((s) => s.getActiveChild());

  const loadMeals = useMealStore((s) => s.loadFromStorage);
  const getMealsForDate = useMealStore((s) => s.getMealsForDate);

  const setPendingFile = useScanIntakeStore((s) => s.setPendingFile);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Daily summary state — which date are we summarising, and whether the
  // caregiver has dismissed it already. Lazy initializers read the client
  // state exactly once on mount, avoiding cascading renders.
  const [summaryDate] = useState<string>(() =>
    typeof window === "undefined" ? "" : dateToSummarize(),
  );
  const [summaryDismissed, setSummaryDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const d = dateToSummarize();
    try {
      return localStorage.getItem(`nibble_summary_dismissed_${d}`) === "1";
    } catch {
      return false;
    }
  });

  // Notification permission — surfaced via a subtle "Enable reminders" button
  // when default (not yet asked). Hidden if granted or denied.
  const [notifState, setNotifState] = useState<NotificationSupport>(() =>
    typeof window === "undefined" ? "unsupported" : getNotificationSupport(),
  );

  useEffect(() => {
    loadChildren();
    loadMeals();
  }, [loadChildren, loadMeals]);

  function dismissSummary() {
    if (!summaryDate) return;
    try {
      localStorage.setItem(`nibble_summary_dismissed_${summaryDate}`, "1");
    } catch {
      /* ignore quota errors */
    }
    setSummaryDismissed(true);
  }

  async function enableReminders() {
    const result = await requestNotificationPermission();
    setNotifState(result);
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again later
    if (!file) return;
    setPendingFile(file);
    router.push("/app/scan");
  }

  useEffect(() => {
    if (childLoaded && !activeChild) {
      router.replace("/onboarding");
    }
  }, [childLoaded, activeChild, router]);

  // Today's meals
  const todayMeals = useMemo(() => {
    if (!activeChild) return [];
    return getMealsForDate(activeChild.id, new Date());
  }, [activeChild, getMealsForDate]);

  // Daily nutrition progress
  const { dailyCoverage, gapSummary } = useMemo(() => {
    if (!activeChild || todayMeals.length === 0) {
      return { dailyCoverage: [], gapSummary: null };
    }
    const bucket = ageInfoFromDob(activeChild.dob).bucket;
    const totals = sumMeals(todayMeals.map((m) => m.totals));
    const cov = computeCoverage(totals, bucket);

    // Find the biggest gap in priority nutrients
    const priority = PRIORITY_NUTRIENTS[bucket];
    const gaps = cov
      .filter((c) => priority.includes(c.nutrient) && !c.target.isUpperLimit && c.status === "below")
      .sort((a, b) => a.coverage - b.coverage);
    const worst = gaps[0];
    const summary = worst
      ? {
          nutrient: NUTRIENT_LABELS[worst.nutrient][locale],
          pct: Math.round((1 - worst.coverage) * 100),
        }
      : null;

    return { dailyCoverage: cov, gapSummary: summary };
  }, [activeChild, todayMeals, locale]);

  // Build the daily summary for the "reflect on" date (today after 22:00,
  // yesterday otherwise).
  const dailySummary = useMemo(() => {
    if (!activeChild || !summaryDate) return null;
    const [y, m, d] = summaryDate.split("-").map(Number);
    if (!y || !m || !d) return null;
    const targetMeals = getMealsForDate(activeChild.id, new Date(y, m - 1, d));
    if (targetMeals.length === 0) return null;
    const bucket = ageInfoFromDob(activeChild.dob).bucket;
    return buildDailySummary(targetMeals, bucket);
  }, [activeChild, summaryDate, getMealsForDate]);

  // Fire a local browser notification once per target-date, if permission
  // has been granted. No-op on servers and on denied/default permission.
  useEffect(() => {
    if (!dailySummary || !summaryDate) return;
    if (notifState !== "granted") return;
    const notifKey = `nibble_summary_notified_${summaryDate}`;
    if (typeof window === "undefined") return;
    if (localStorage.getItem(notifKey) === "1") return;
    const title = locale === "en" ? dailySummary.titleEn : dailySummary.titleZh;
    const body = locale === "en" ? dailySummary.bodyEn : dailySummary.bodyZh;
    const fired = fireLocalNotification(title, body, `nibble-summary-${summaryDate}`);
    if (fired) {
      try {
        localStorage.setItem(notifKey, "1");
      } catch {
        /* ignore quota errors */
      }
    }
  }, [dailySummary, summaryDate, notifState, locale]);

  const dailyCoverageByNutrient = useMemo(() => {
    const map: Partial<Record<Nutrient, (typeof dailyCoverage)[number]>> = {};
    for (const c of dailyCoverage) map[c.nutrient] = c;
    return map;
  }, [dailyCoverage]);

  // Loading
  if (!childLoaded) {
    return (
      <main className="min-h-screen flex items-center justify-center text-ink-faded">
        Loading...
      </main>
    );
  }

  if (!activeChild) return null; // redirect in effect

  const ageInfo = ageInfoFromDob(activeChild.dob);
  const bucket = ageInfo.bucket;
  const priorityNutrients = PRIORITY_NUTRIENTS[bucket];

  return (
    <main className="min-h-screen bg-cream pb-28">
      <div className="max-w-xl mx-auto px-5 pt-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <span className="text-3xl">{activeChild.avatar || "🍎"}</span>
          <div className="flex-1 min-w-0">
            <h1 className="font-display font-bold text-ink text-lg">
              {activeChild.name}
            </h1>
            <p className="text-sm text-ink-faded">{ageInfo.displayShort}</p>
          </div>
          {notifState === "default" && (
            <button
              type="button"
              onClick={enableReminders}
              className="text-[11px] font-medium text-peach-deep px-3 py-1.5 rounded-full border border-peach-deep/30 hover:bg-peach/10 transition"
            >
              🔔 {locale === "en" ? "Enable reminders" : "開啟提醒"}
            </button>
          )}
        </div>

        {/* Daily summary — shows after 10pm (for today) or next day until dismissed */}
        {dailySummary && !summaryDismissed && (
          <DailySummaryCard
            summary={dailySummary}
            locale={locale}
            onDismiss={dismissSummary}
          />
        )}

        {/* Today's Nutrition Progress (hero) */}
        <section className="rounded-bubble bg-white card-pop p-5">
          <h2 className="font-display font-semibold text-ink mb-1">
            {locale === "en" ? "Today's nutrition" : "今日營養"}
          </h2>

          {todayMeals.length === 0 ? (
            <div className="text-center py-6">
              <div className="text-4xl mb-3">🍽️</div>
              <p className="text-ink-faded text-sm mb-1">
                {locale === "en"
                  ? "No meals logged yet today."
                  : "今天還沒有紀錄。"}
              </p>
              <p className="text-ink-faded text-xs">
                {locale === "en"
                  ? "Scan your baby's plate to start tracking!"
                  : "拍張照開始追蹤寶貝的營養！"}
              </p>
            </div>
          ) : (
            <>
              <p className="text-xs text-ink-faded mb-4">
                {locale === "en"
                  ? `${todayMeals.length} meal${todayMeals.length > 1 ? "s" : ""} logged`
                  : `已記錄 ${todayMeals.length} 餐`}
              </p>
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
                {priorityNutrients.map((nutrient) => {
                  const cell = dailyCoverageByNutrient[nutrient];
                  const target = RDA[bucket]?.[nutrient];
                  if (!target) return null;
                  return (
                    <div key={nutrient} className="shrink-0">
                      <RDARing
                        nutrient={nutrient}
                        coverage={cell?.coverage ?? 0}
                        status={cell?.status ?? "unknown"}
                        actual={cell?.actual ?? 0}
                        unit={target.unit}
                        locale={locale}
                        size="md"
                      />
                    </div>
                  );
                })}
              </div>
              {gapSummary ? (
                <p className="text-sm text-peach-deep mt-3 font-medium">
                  {locale === "en"
                    ? `${gapSummary.nutrient} needs ${gapSummary.pct}% more`
                    : `${gapSummary.nutrient}還需要 ${gapSummary.pct}%`}
                </p>
              ) : (
                <p className="text-sm text-sage-deep mt-3 font-medium">
                  {locale === "en" ? "All on track today!" : "今日營養都達標！"}
                </p>
              )}
            </>
          )}
        </section>

        {/* Scan CTA — tap opens the device's native photo picker immediately */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handlePhotoChange}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center justify-center gap-2 w-full py-4 rounded-full bg-peach-deep text-white font-semibold text-lg bubble-shadow hover:bg-peach-deep/90 transition"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
          {locale === "en" ? "Scan a plate" : "拍下餐盤"}
        </button>

        {/* Today's meals strip */}
        {todayMeals.length > 0 && (
          <section>
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="font-display font-semibold text-ink">
                {locale === "en" ? "Today's meals" : "今日餐點"}
              </h2>
              <Link
                href="/app/scan/history"
                className="text-xs text-peach-deep font-medium"
              >
                {locale === "en" ? "View all" : "查看全部"} →
              </Link>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
              {todayMeals.map((meal) => {
                return (
                  <Link
                    key={meal.id}
                    href={`/app/scan/${meal.id}` as "/app/scan/history"}
                    className="shrink-0 w-28 rounded-card bg-white border border-border overflow-hidden hover:border-peach/50 transition"
                  >
                    {meal.photoDataUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={meal.photoDataUrl}
                        alt=""
                        className="w-full h-20 object-cover"
                      />
                    ) : (
                      <div className="w-full h-20 bg-butter/30 flex items-center justify-center text-2xl">
                        🍽️
                      </div>
                    )}
                    <div className="p-2">
                      <p className="text-sm font-medium text-ink tabular-nums">
                        {meal.time}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* Quick links */}
        <section>
          <h2 className="font-display font-semibold text-ink mb-3">
            {locale === "en" ? "Quick links" : "快速功能"}
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {QUICK_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center gap-3 p-4 rounded-card bg-white border border-border hover:border-peach/40 transition"
              >
                <span className="text-xl">{link.emoji}</span>
                <span className="text-sm font-medium text-ink">
                  {locale === "en" ? link.en : link.zh}
                </span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
