"use client";

import { useEffect, useMemo } from "react";
import { useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useChildProfileStore } from "@/stores/childProfileStore";
import {
  useBabyFeedStore,
  type BabyFeedEntry,
} from "@/stores/babyFeedStore";

/**
 * /app/baby-feed/history
 *
 * Grouped-by-day feed log for the active profile. Each day shows counts
 * per type + individual entries. Deletions are in-place with a confirm.
 */

export default function BabyFeedHistoryPage() {
  const locale = useLocale() as "zh-TW" | "en";
  const L = (en: string, zh: string) => (locale === "en" ? en : zh);

  const loadChildren = useChildProfileStore((s) => s.loadFromStorage);
  const activeChild = useChildProfileStore((s) => s.getActiveChild());
  const loadFeeds = useBabyFeedStore((s) => s.loadFromStorage);
  const getEntriesForProfile = useBabyFeedStore((s) => s.getEntriesForProfile);
  const removeEntry = useBabyFeedStore((s) => s.removeEntry);

  useEffect(() => {
    loadChildren();
    loadFeeds();
  }, [loadChildren, loadFeeds]);

  const grouped = useMemo(() => {
    if (!activeChild) return [] as Array<[string, BabyFeedEntry[]]>;
    const entries = getEntriesForProfile(activeChild.id);
    const map = new Map<string, BabyFeedEntry[]>();
    for (const e of entries) {
      const key = e.timestamp.slice(0, 10); // YYYY-MM-DD
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [activeChild, getEntriesForProfile]);

  return (
    <main className="min-h-screen bg-cream pb-28">
      <header className="sticky top-0 z-20 bg-cream/95 backdrop-blur-md border-b border-border">
        <div className="max-w-xl mx-auto px-5 py-4 flex items-center gap-3">
          <Link href="/app" className="text-ink-faded hover:text-ink -ml-1" aria-label="Back">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </Link>
          <h1 className="font-display font-bold text-ink text-lg flex-1">
            {L("Baby feed log", "寶寶餵食紀錄")}
          </h1>
          <Link
            href="/app/baby-feed/log"
            className="bg-peach-deep text-white px-3 py-1.5 rounded-full text-sm font-medium"
          >
            + {L("Log", "記錄")}
          </Link>
        </div>
      </header>

      <div className="max-w-xl mx-auto px-5 py-6 space-y-6">
        {grouped.length === 0 && (
          <div className="text-center py-16 text-ink-faded">
            <div className="text-5xl mb-4">🤱</div>
            <p className="text-sm mb-1">
              {L("No feeds logged yet.", "還沒有餵食紀錄。")}
            </p>
            <p className="text-xs mb-6">
              {L(
                "Tap 'Log' to start tracking breastfeeds, formula bottles, and diapers.",
                "點「記錄」開始追蹤哺乳、配方奶與尿布。",
              )}
            </p>
            <Link
              href="/app/baby-feed/log"
              className="inline-block bg-peach-deep text-white px-5 py-2.5 rounded-full text-sm font-semibold"
            >
              + {L("Add first entry", "新增第一筆")}
            </Link>
          </div>
        )}

        {grouped.map(([date, entries]) => (
          <DayGroup
            key={date}
            date={date}
            entries={entries}
            locale={locale}
            onDelete={(id) => {
              if (
                typeof window !== "undefined" &&
                window.confirm(L("Delete this entry?", "刪除這筆紀錄？"))
              ) {
                removeEntry(id);
              }
            }}
          />
        ))}
      </div>
    </main>
  );
}

function DayGroup({
  date,
  entries,
  locale,
  onDelete,
}: {
  date: string;
  entries: BabyFeedEntry[];
  locale: "zh-TW" | "en";
  onDelete: (id: string) => void;
}) {
  const L = (en: string, zh: string) => (locale === "en" ? en : zh);
  const [y, m, d] = date.split("-").map(Number);
  const dateLabel = (() => {
    if (!y || !m || !d) return date;
    const obj = new Date(y, m - 1, d);
    return obj.toLocaleDateString(locale === "en" ? "en-US" : "zh-TW", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  })();

  const counts = {
    breastfeeding: entries.filter((e) => e.type === "breastfeeding").length,
    formulaML: entries
      .filter((e) => e.type === "formula")
      .reduce((sum, e) => sum + (e.volumeML ?? 0), 0),
    wet: entries.filter((e) => e.type === "diaper" && e.diaperKind === "wet").length,
    dirty: entries.filter((e) => e.type === "diaper" && e.diaperKind === "dirty").length,
    mixed: entries.filter((e) => e.type === "diaper" && e.diaperKind === "mixed").length,
  };

  return (
    <section>
      <div className="flex items-baseline justify-between mb-2 px-1">
        <p className="text-xs font-medium text-ink-faded tabular-nums">
          {dateLabel}
        </p>
        <p className="text-[11px] text-ink-faded tabular-nums">
          {L(
            `${counts.breastfeeding} feeds · ${counts.formulaML} ml formula · ${counts.wet}💧 ${counts.dirty}💩`,
            `${counts.breastfeeding} 次哺乳 · ${counts.formulaML} ml 配方奶 · ${counts.wet}💧 ${counts.dirty}💩`,
          )}
        </p>
      </div>
      <ul className="space-y-2">
        {entries.map((e) => (
          <EntryRow key={e.id} entry={e} locale={locale} onDelete={() => onDelete(e.id)} />
        ))}
      </ul>
    </section>
  );
}

function EntryRow({
  entry,
  locale,
  onDelete,
}: {
  entry: BabyFeedEntry;
  locale: "zh-TW" | "en";
  onDelete: () => void;
}) {
  const L = (en: string, zh: string) => (locale === "en" ? en : zh);
  const time = new Date(entry.timestamp).toLocaleTimeString(
    locale === "en" ? "en-US" : "zh-TW",
    { hour: "2-digit", minute: "2-digit", hour12: true },
  );

  let emoji = "🤱";
  let primaryEn = "";
  let primaryZh = "";
  if (entry.type === "breastfeeding") {
    emoji = "🤱";
    const sideEn =
      entry.side === "left" ? "L" : entry.side === "right" ? "R" : "L+R";
    const sideZh =
      entry.side === "left" ? "左" : entry.side === "right" ? "右" : "雙邊";
    primaryEn = `${entry.durationMinutes ?? 0} min · ${sideEn}`;
    primaryZh = `${entry.durationMinutes ?? 0} 分鐘 · ${sideZh}`;
  } else if (entry.type === "formula") {
    emoji = "🍼";
    primaryEn = `${entry.volumeML ?? 0} ml formula`;
    primaryZh = `${entry.volumeML ?? 0} ml 配方奶`;
  } else {
    emoji =
      entry.diaperKind === "dirty"
        ? "💩"
        : entry.diaperKind === "mixed"
          ? "💧💩"
          : "💧";
    const kindEn =
      entry.diaperKind === "wet"
        ? "Wet diaper"
        : entry.diaperKind === "dirty"
          ? "Dirty diaper"
          : "Wet + dirty";
    const kindZh =
      entry.diaperKind === "wet"
        ? "濕尿布"
        : entry.diaperKind === "dirty"
          ? "有便便"
          : "尿 + 便";
    primaryEn = kindEn;
    primaryZh = kindZh;
  }

  return (
    <li className="flex items-center gap-3 p-3 rounded-card bg-white border border-border">
      <span className="text-xl">{emoji}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink">
          {L(primaryEn, primaryZh)}
        </p>
        <p className="text-[11px] text-ink-faded tabular-nums">{time}</p>
        {entry.notes && (
          <p className="text-xs text-ink-faded mt-0.5 line-clamp-1">
            {entry.notes}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onDelete}
        className="size-7 rounded-full text-ink-faded hover:bg-red-50 hover:text-red-500 flex items-center justify-center text-base leading-none"
        aria-label={L("Delete", "刪除")}
      >
        ×
      </button>
    </li>
  );
}
