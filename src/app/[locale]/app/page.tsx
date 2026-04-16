"use client";

import { useEffect } from "react";
import { useLocale } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useChildProfileStore } from "@/stores/childProfileStore";
import { AGE_BUCKET_LABELS, ageInfoFromDob } from "@/lib/pediatric/ageBucket";
import { getAllergen } from "@/lib/pediatric/allergenRegistry";

/**
 * Post-onboarding landing — minimal "hello Nibble" shell.
 *
 * Real tabs (Scan / Chat / Log / Growth) come in Day 5-7. For now we show
 * the active child's summary so the caregiver has confirmation their profile
 * was saved, plus Coming-Soon teasers for the main modules so the CTAs
 * already surface in the right spots.
 */

export default function AppDashboard() {
  const locale = useLocale() as "zh-TW" | "en";
  const router = useRouter();
  const loadFromStorage = useChildProfileStore((s) => s.loadFromStorage);
  const loaded = useChildProfileStore((s) => s.loaded);
  const activeChild = useChildProfileStore((s) => s.getActiveChild());

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  // Once the store has hydrated, if there's no child the caregiver has
  // skipped onboarding (or wiped storage) — redirect them there.
  useEffect(() => {
    if (loaded && !activeChild) {
      router.replace("/onboarding");
    }
  }, [loaded, activeChild, router]);

  if (!loaded || !activeChild) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-ink-faded">
          {locale === "en" ? "Loading…" : "載入中⋯⋯"}
        </div>
      </main>
    );
  }

  const ageInfo = ageInfoFromDob(activeChild.dob);
  const bucketLabel = AGE_BUCKET_LABELS[ageInfo.bucket][locale];

  return (
    <main className="min-h-screen pb-20">
      {/* Child card */}
      <section className="px-6 pt-10 pb-8">
        <div className="max-w-xl mx-auto rounded-bubble bg-white card-pop p-6">
          <div className="flex items-center gap-4">
            <div className="size-16 rounded-2xl bg-butter flex items-center justify-center text-4xl">
              {activeChild.avatar || "🍎"}
            </div>
            <div>
              <p className="font-display text-2xl font-bold text-ink">
                {activeChild.name}
              </p>
              <p className="text-sm text-ink-soft">
                {ageInfo.displayShort} · {bucketLabel}
              </p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
            <InfoCell
              label={locale === "en" ? "Feeding style" : "餵養方式"}
              value={
                activeChild.feedingStyle === "blw"
                  ? "BLW"
                  : activeChild.feedingStyle === "puree"
                    ? locale === "en"
                      ? "Purée"
                      : "泥狀"
                    : locale === "en"
                      ? "Mixed"
                      : "混合"
              }
            />
            <InfoCell
              label={locale === "en" ? "Known allergens" : "已知過敏原"}
              value={
                activeChild.allergens.length === 0
                  ? locale === "en"
                    ? "None yet"
                    : "尚未填寫"
                  : activeChild.allergens
                      .map((k) => getAllergen(k)?.label[locale] ?? k)
                      .join(" · ")
              }
            />
          </div>
        </div>
      </section>

      {/* Module list — Day 5-7 lit up the first six; chat comes Day 8+. */}
      <section className="px-6">
        <div className="max-w-xl mx-auto space-y-3">
          <FeatureRow
            href="/app/scan"
            emoji="📸"
            title={locale === "en" ? "Plate scan" : "餐盤分析"}
            sub={
              locale === "en"
                ? "Snap a photo, see iron + zinc + calcium coverage"
                : "拍照看鐵、鋅、鈣的覆蓋率"
            }
          />
          <FeatureRow
            href="/app/scan/history"
            emoji="🥣"
            title={locale === "en" ? "Meal history" : "餐點紀錄"}
            sub={
              locale === "en"
                ? "Every plate you've scanned, with photos and nutrients"
                : "歷次餐盤紀錄，含照片與營養素"
            }
          />
          <FeatureRow
            href="/app/chat"
            emoji="💬"
            title={locale === "en" ? "Ask Nibble" : "問 Nibble"}
            sub={
              locale === "en"
                ? "Feeding, allergens, picky eaters — we've got you"
                : "副食品、過敏、挑食問題都能問"
            }
          />
          <FeatureRow
            href="/app/poop/log"
            emoji="💩"
            title={locale === "en" ? "Poop log" : "便便紀錄"}
            sub={
              locale === "en"
                ? "Bristol scale + color, flag red/white/black"
                : "Bristol 量表 + 顏色，警示紅/白/黑"
            }
          />
          <FeatureRow
            href="/app/sleep"
            emoji="😴"
            title={locale === "en" ? "Sleep log" : "睡眠紀錄"}
            sub={
              locale === "en"
                ? "Naps + nights with wake events and totals"
                : "小睡 + 夜晚，含夜醒次數與總時數"
            }
          />
          <FeatureRow
            href="/app/milestones"
            emoji="🎉"
            title={locale === "en" ? "Milestones" : "里程碑"}
            sub={
              locale === "en"
                ? "Preset checklist tuned to baby's age"
                : "依月齡推薦的里程碑清單"
            }
          />
          <FeatureRow
            href="/app/reactions"
            emoji="⚠️"
            title={locale === "en" ? "Reaction log" : "過敏反應紀錄"}
            sub={
              locale === "en"
                ? "Food, symptoms, severity — with a referral cue"
                : "食物、症狀、嚴重度——附就醫提示"
            }
          />
          <FeatureRow
            href="/app/growth"
            emoji="📈"
            title={locale === "en" ? "Growth" : "生長曲線"}
            sub={
              locale === "en"
                ? "Weight / height / head trend chart"
                : "體重 / 身高 / 頭圍 趨勢圖"
            }
          />
        </div>
      </section>

      {/* Back-to-onboarding debug link (remove once auth is wired). */}
      <div className="max-w-xl mx-auto px-6 mt-10 text-center">
        <Link href="/onboarding" className="text-xs text-ink-faded underline">
          {locale === "en" ? "Start over (debug)" : "重新開始（偵錯）"}
        </Link>
      </div>
    </main>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card bg-cream border border-border p-3">
      <p className="text-xs text-ink-faded mb-1">{label}</p>
      <p className="font-medium text-ink">{value}</p>
    </div>
  );
}

function FeatureRow({
  href,
  emoji,
  title,
  sub,
}: {
  href:
    | "/app/scan"
    | "/app/scan/history"
    | "/app/chat"
    | "/app/poop/log"
    | "/app/poop/history"
    | "/app/sleep"
    | "/app/milestones"
    | "/app/reactions"
    | "/app/growth";
  emoji: string;
  title: string;
  sub: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-4 p-5 rounded-card bg-white border border-border hover:border-peach-deep hover:bg-peach/10 transition"
    >
      <div className="size-12 rounded-2xl bg-sage/30 flex items-center justify-center text-2xl">
        {emoji}
      </div>
      <div className="flex-1">
        <p className="font-display font-semibold text-ink">{title}</p>
        <p className="mt-0.5 text-sm text-ink-soft">{sub}</p>
      </div>
      <span className="text-ink-soft text-lg">→</span>
    </Link>
  );
}

