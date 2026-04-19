"use client";

import { useEffect, useMemo } from "react";
import { Link } from "@/i18n/navigation";
import { useBabyFeedStore } from "@/stores/babyFeedStore";
import {
  getBenchmarkForWeeks,
  statusForCount,
  statusForGapMinutes,
  type BenchStatus,
  type InfantBenchmark,
} from "@/lib/pediatric/infantFeedingBenchmarks";
import { weeksPostpartumFromStart } from "@/lib/pediatric/ageBucket";

/**
 * Compact dashboard card showing today's baby-feed summary for a
 * breastfeeding profile. For babies under 6 months we compare today's
 * counts against AAP/LLL benchmark ranges so raw numbers turn into
 * meaningful signals ("4 feeds — low for 3 wks").
 *
 * When the profile has no breastfeedingStartDate (or baby > 6 months),
 * the card gracefully degrades to raw counts without benchmarks.
 */

interface Props {
  profileId: string;
  /** Baby's breastfeeding start date (usually their DOB). Optional — when
   *  missing we skip benchmarks and just show raw counts. */
  breastfeedingStartDate?: string;
  locale: "zh-TW" | "en";
}

export function BabyFeedCard({
  profileId,
  breastfeedingStartDate,
  locale,
}: Props) {
  const loadFeeds = useBabyFeedStore((s) => s.loadFromStorage);
  const getEntriesForDate = useBabyFeedStore((s) => s.getEntriesForDate);

  useEffect(() => {
    loadFeeds();
  }, [loadFeeds]);

  const L = (en: string, zh: string) => (locale === "en" ? en : zh);

  // Derive baby's age in weeks + look up the benchmark band.
  const babyWeeks = breastfeedingStartDate
    ? weeksPostpartumFromStart(breastfeedingStartDate)
    : null;
  const benchmark = babyWeeks !== null ? getBenchmarkForWeeks(babyWeeks) : null;

  // Today's entries.
  const today = new Date();
  const entries = getEntriesForDate(profileId, today);
  const bf = entries.filter((e) => e.type === "breastfeeding");
  const breastfeeds = bf.length;
  const formulaML = entries
    .filter((e) => e.type === "formula")
    .reduce((sum, e) => sum + (e.volumeML ?? 0), 0);
  const wetDiapers = entries.filter(
    (e) =>
      e.type === "diaper" && (e.diaperKind === "wet" || e.diaperKind === "mixed"),
  ).length;
  const dirtyDiapers = entries.filter(
    (e) =>
      e.type === "diaper" && (e.diaperKind === "dirty" || e.diaperKind === "mixed"),
  ).length;
  const lastMilk = [...bf, ...entries.filter((e) => e.type === "formula")].sort(
    (a, b) => b.timestamp.localeCompare(a.timestamp),
  )[0];
  // Compute gap once per mount — comparing `Date.now()` every render is
  // both impure (React 19 flags it) and pointless since the card rerenders
  // infrequently enough that stale-by-a-few-seconds is fine.
  const minutesSinceLastFeed = useMemo(() => {
    if (!lastMilk) return null;
    return Math.max(
      0,
      (Date.now() - new Date(lastMilk.timestamp).getTime()) / 60000,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastMilk?.timestamp]);

  const lastFeedLabel = lastMilk
    ? relativeTime(lastMilk.timestamp, locale)
    : L("No feeds yet today", "今天還沒餵食");

  // Compute status tags when we have a benchmark to compare against.
  // Formula volume is only checked if the baby is getting formula at all —
  // exclusively-breastfed babies log volume as 0 and shouldn't be flagged.
  const feedsStatus = benchmark
    ? statusForCount(breastfeeds + entries.filter((e) => e.type === "formula").length, benchmark.feedsPerDay)
    : null;
  const wetStatus = benchmark
    ? statusForCount(wetDiapers, benchmark.wetDiapers)
    : null;
  const dirtyStatus = benchmark
    ? statusForCount(dirtyDiapers, benchmark.dirtyDiapers)
    : null;
  const gapStatus =
    benchmark && minutesSinceLastFeed !== null
      ? statusForGapMinutes(minutesSinceLastFeed, benchmark.gapMinutes)
      : null;

  return (
    <section className="rounded-bubble bg-white card-pop p-5">
      <div className="flex items-baseline justify-between mb-1">
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
      {benchmark && (
        <p className="text-[11px] text-ink-faded mb-3">
          {L(`${babyWeeks} weeks old · `, `產後 ${babyWeeks} 週 · `)}
          {benchmark.label[locale]}
        </p>
      )}

      {/* Detailed rows with expected ranges (when benchmark available) */}
      {benchmark ? (
        <ul className="space-y-2.5 mb-3">
          <BenchRow
            emoji="🤱"
            labelEn="Feeds"
            labelZh="哺乳次數"
            actual={breastfeeds + entries.filter((e) => e.type === "formula").length}
            range={benchmark.feedsPerDay}
            status={feedsStatus}
            unit=""
            locale={locale}
          />
          {formulaML > 0 && (
            <BenchRow
              emoji="🍼"
              labelEn="Formula"
              labelZh="配方奶"
              actual={formulaML}
              range={benchmark.milkMLPerDay}
              status={statusForCount(formulaML, benchmark.milkMLPerDay)}
              unit="ml"
              locale={locale}
            />
          )}
          <BenchRow
            emoji="💧"
            labelEn="Wet diapers"
            labelZh="濕尿布"
            actual={wetDiapers}
            range={benchmark.wetDiapers}
            status={wetStatus}
            unit=""
            locale={locale}
          />
          <BenchRow
            emoji="💩"
            labelEn="Dirty diapers"
            labelZh="有便便"
            actual={dirtyDiapers}
            range={benchmark.dirtyDiapers}
            status={dirtyStatus}
            unit=""
            locale={locale}
          />
        </ul>
      ) : (
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
      )}

      {/* Last feed + gap warning */}
      <div className="mb-3">
        <p className="text-xs text-ink-faded">
          {L("Last feed:", "最近一次餵食：")} {lastFeedLabel}
          {gapStatus === "above" && benchmark && (
            <span className="text-peach-deep font-medium ml-1">
              {L(
                ` · longer than typical (${benchmark.gapMinutes[1]}min max)`,
                ` · 比平常久（建議 ${benchmark.gapMinutes[1]} 分鐘內一次）`,
              )}
            </span>
          )}
        </p>
        {benchmark && (
          <p className="text-[11px] text-ink-faded mt-1.5 italic">
            💡 {benchmark.note[locale]}
          </p>
        )}
      </div>

      <Link
        href="/app/baby-feed/log"
        className="flex items-center justify-center gap-1.5 w-full py-3 rounded-full bg-peach-deep text-white font-semibold hover:bg-peach-deep/90 transition"
      >
        + {L("Log feed", "記錄")}
      </Link>
    </section>
  );
}

/** Row with count, expected range, and a colored status badge. */
function BenchRow({
  emoji,
  labelEn,
  labelZh,
  actual,
  range,
  status,
  unit,
  locale,
}: {
  emoji: string;
  labelEn: string;
  labelZh: string;
  actual: number;
  range: [number, number];
  status: BenchStatus | null;
  unit: string;
  locale: "zh-TW" | "en";
}) {
  const L = (en: string, zh: string) => (locale === "en" ? en : zh);
  const [min, max] = range;
  const statusDot =
    status === "normal"
      ? { bg: "bg-sage/30", text: "text-sage-deep", symbol: "✓" }
      : status === "below"
        ? { bg: "bg-peach/30", text: "text-peach-deep", symbol: "↓" }
        : status === "above"
          ? { bg: "bg-butter/50", text: "text-ink", symbol: "↑" }
          : null;

  return (
    <li className="flex items-center gap-3">
      <span className="text-lg w-6 text-center shrink-0">{emoji}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm text-ink">{L(labelEn, labelZh)}</span>
          <span className="text-[11px] text-ink-faded tabular-nums">
            {L(`expected ${min}–${max}${unit}`, `建議 ${min}–${max}${unit}`)}
          </span>
        </div>
      </div>
      <div className="shrink-0 flex items-center gap-1.5">
        <span className="font-display font-bold text-ink tabular-nums">
          {actual}
          {unit && <span className="text-xs font-normal text-ink-faded">{unit}</span>}
        </span>
        {statusDot && (
          <span
            className={`inline-flex items-center justify-center size-5 rounded-full text-xs font-bold ${statusDot.bg} ${statusDot.text}`}
            aria-label={status ?? undefined}
          >
            {statusDot.symbol}
          </span>
        )}
      </div>
    </li>
  );
}

/** Fallback compact stat tile when we don't have a benchmark to compare against. */
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

// Silence the unused-import lint when consumers don't use InfantBenchmark.
export type { InfantBenchmark };
