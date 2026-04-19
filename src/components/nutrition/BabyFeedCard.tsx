"use client";

import { useEffect } from "react";
import { Link } from "@/i18n/navigation";
import { useBabyFeedStore } from "@/stores/babyFeedStore";

/**
 * Compact dashboard card showing today's baby-feed summary for a
 * breastfeeding profile. Rendered conditionally above the nutrition rings
 * so a mom with a newborn sees at a glance: feeds / formula / diapers.
 *
 * Taps through to /app/baby-feed/log (new entry) or
 * /app/baby-feed/history (review).
 */

interface Props {
  profileId: string;
  locale: "zh-TW" | "en";
}

export function BabyFeedCard({ profileId, locale }: Props) {
  const loadFeeds = useBabyFeedStore((s) => s.loadFromStorage);
  const getEntriesForDate = useBabyFeedStore((s) => s.getEntriesForDate);

  useEffect(() => {
    loadFeeds();
  }, [loadFeeds]);

  const L = (en: string, zh: string) => (locale === "en" ? en : zh);

  // Computed per render — entry count per profile is tiny (<50 for a day)
  // so there's no real perf win from memoising.
  const today = new Date();
  const entries = getEntriesForDate(profileId, today);
  const bf = entries.filter((e) => e.type === "breastfeeding");
  const breastfeeds = bf.length;
  const formulaML = entries
    .filter((e) => e.type === "formula")
    .reduce((sum, e) => sum + (e.volumeML ?? 0), 0);
  const wetDiapers = entries.filter(
    (e) => e.type === "diaper" && (e.diaperKind === "wet" || e.diaperKind === "mixed"),
  ).length;
  const dirtyDiapers = entries.filter(
    (e) => e.type === "diaper" && (e.diaperKind === "dirty" || e.diaperKind === "mixed"),
  ).length;
  const lastMilk = [...bf, ...entries.filter((e) => e.type === "formula")].sort(
    (a, b) => b.timestamp.localeCompare(a.timestamp),
  )[0];
  const lastFeedLabel = lastMilk
    ? relativeTime(lastMilk.timestamp, locale)
    : L("No feeds yet today", "今天還沒餵食");

  return (
    <section className="rounded-bubble bg-white card-pop p-5">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-display font-semibold text-ink">
          {L("Baby's day", "寶寶今日")}
        </h2>
        <Link
          href="/app/baby-feed/history"
          className="text-xs text-peach-deep font-medium"
        >
          {L("History", "紀錄")} →
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <Stat emoji="🤱" value={`${breastfeeds}`} label={L("feeds", "哺乳")} />
        <Stat
          emoji="🍼"
          value={`${formulaML}`}
          label={L("ml formula", "ml 配方奶")}
        />
        <Stat
          emoji="💧💩"
          value={`${wetDiapers}/${dirtyDiapers}`}
          label={L("wet / dirty", "尿 / 便")}
        />
      </div>

      <p className="text-xs text-ink-faded mb-3">
        {L("Last feed:", "最近一次餵食：")} {lastFeedLabel}
      </p>

      <Link
        href="/app/baby-feed/log"
        className="flex items-center justify-center gap-1.5 w-full py-3 rounded-full bg-peach-deep text-white font-semibold hover:bg-peach-deep/90 transition"
      >
        + {L("Log feed", "記錄")}
      </Link>
    </section>
  );
}

function Stat({ emoji, value, label }: { emoji: string; value: string; label: string }) {
  return (
    <div className="bg-cream/60 rounded-card p-3 text-center">
      <div className="text-xl leading-none mb-1">{emoji}</div>
      <div className="font-display font-bold text-ink text-lg tabular-nums leading-none">
        {value}
      </div>
      <div className="text-[10px] text-ink-faded mt-1">{label}</div>
    </div>
  );
}

function relativeTime(iso: string, locale: "zh-TW" | "en"): string {
  const L = (en: string, zh: string) => (locale === "en" ? en : zh);
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMin = Math.max(0, Math.round((now - then) / 60000));
  if (diffMin < 1) return L("just now", "剛剛");
  if (diffMin < 60) return L(`${diffMin} min ago`, `${diffMin} 分鐘前`);
  const hrs = Math.floor(diffMin / 60);
  const mins = diffMin % 60;
  if (hrs < 24)
    return L(
      mins === 0 ? `${hrs} hr ago` : `${hrs}h ${mins}m ago`,
      mins === 0 ? `${hrs} 小時前` : `${hrs} 小時 ${mins} 分鐘前`,
    );
  const days = Math.floor(hrs / 24);
  return L(`${days}d ago`, `${days} 天前`);
}
