"use client";

import { useEffect, useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useChildProfileStore } from "@/stores/childProfileStore";
import { usePoopStore, type PoopRecord } from "@/stores/poopStore";
import {
  BRISTOL_SCALE,
  POOP_COLORS,
  shouldReferToPediatrician,
} from "@/lib/pediatric/bristolScale";

/**
 * Poop history — reverse-chronological list grouped by date.
 *
 * Minimal for MVP: no filters, no charts yet. Each row shows swatch +
 * Bristol type + time + notes. Red-flagged entries get a peach stripe
 * on the left so they're scannable from a quick glance.
 */

export default function PoopHistoryPage() {
  const locale = useLocale() as "zh-TW" | "en";
  const t = useTranslations("Poop");
  const tCommon = useTranslations("Common");

  const loadChildren = useChildProfileStore((s) => s.loadFromStorage);
  const childLoaded = useChildProfileStore((s) => s.loaded);
  const activeChild = useChildProfileStore((s) => s.getActiveChild());

  const loadPoops = usePoopStore((s) => s.loadFromStorage);
  const poopsLoaded = usePoopStore((s) => s.loaded);
  // Subscribe to the array directly so the list re-renders after addPoop —
  // selecting only the function gave a stable reference and missed updates.
  const allPoops = usePoopStore((s) => s.poops);
  const removePoop = usePoopStore((s) => s.removePoop);

  useEffect(() => {
    loadChildren();
    loadPoops();
  }, [loadChildren, loadPoops]);

  const entries = useMemo(
    () =>
      activeChild
        ? allPoops
            .filter((p) => p.childId === activeChild.id)
            .sort((a, b) =>
              `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`),
            )
        : [],
    [activeChild, allPoops],
  );

  const grouped = useMemo(() => groupByDate(entries), [entries]);

  if (!childLoaded || !poopsLoaded) {
    return (
      <main className="min-h-screen flex items-center justify-center text-ink-faded">
        {tCommon("loading")}
      </main>
    );
  }

  return (
    <main className="min-h-screen pb-24">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-cream/90 backdrop-blur-md border-b border-border px-6 py-4">
        <div className="max-w-xl mx-auto flex items-center gap-3">
          <Link href="/app" className="text-ink-soft hover:text-ink">
            ←
          </Link>
          <h1 className="font-display text-lg font-semibold text-ink flex-1">
            {t("historyTitle")}
          </h1>
          <Link
            href="/app/poop/log"
            className="rounded-full bg-peach-deep text-white text-xs font-semibold px-3 py-1.5"
          >
            + {t("newEntry")}
          </Link>
        </div>
      </header>

      <div className="max-w-xl mx-auto px-6 pt-6 space-y-6">
        {entries.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-3">💩</div>
            <p className="text-ink-soft mb-6">{t("emptyHistory")}</p>
            <Link
              href="/app/poop/log"
              className="inline-flex rounded-full bg-peach-deep text-white font-semibold px-6 py-3 bubble-shadow"
            >
              {t("newEntry")} →
            </Link>
          </div>
        ) : (
          grouped.map(([date, items]) => (
            <section key={date}>
              <p className="text-xs font-medium text-ink-faded tabular-nums mb-2 px-1">
                {formatDateHeader(date, locale)}
              </p>
              <ul className="space-y-2">
                {items.map((p) => (
                  <PoopRow
                    key={p.id}
                    record={p}
                    locale={locale}
                    onDelete={() => removePoop(p.id)}
                    deleteLabel={tCommon("delete")}
                    editLabel={tCommon("edit")}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </main>
  );
}

function PoopRow({
  record,
  locale,
  onDelete,
  deleteLabel,
  editLabel,
}: {
  record: PoopRecord;
  locale: "zh-TW" | "en";
  onDelete: () => void;
  deleteLabel: string;
  editLabel: string;
}) {
  const bristol = BRISTOL_SCALE.find((b) => b.type === record.bristolType)!;
  const colorInfo = POOP_COLORS[record.color];
  const redFlag = shouldReferToPediatrician(record.bristolType, record.color);

  return (
    <li
      className={`relative flex items-center gap-3 p-4 rounded-card bg-white border border-border overflow-hidden ${
        redFlag ? "before:absolute before:inset-y-0 before:left-0 before:w-1.5 before:bg-peach-deep" : ""
      }`}
    >
      <div
        className="size-10 rounded-full border border-black/10 shrink-0"
        style={{ background: colorInfo.swatch }}
        aria-label={colorInfo.label[locale]}
      />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-ink truncate">
          #{record.bristolType} · {bristol.label[locale]}
        </p>
        <p className="text-xs text-ink-faded tabular-nums">
          {record.time} · {colorInfo.label[locale]}
        </p>
        {record.notes && (
          <p className="mt-1 text-xs text-ink-soft line-clamp-2">
            {record.notes}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Link
          href={{ pathname: "/app/poop/log", query: { edit: record.id } }}
          className="text-xs text-ink-soft hover:text-sage-deep px-2 py-1"
          aria-label={editLabel}
        >
          ✎
        </Link>
        <button
          type="button"
          onClick={() => {
            if (confirm(deleteLabel + "?")) onDelete();
          }}
          className="text-base text-ink-faded hover:text-peach-deep px-2 py-1 leading-none"
          aria-label={deleteLabel}
        >
          ×
        </button>
      </div>
    </li>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────

/** Group poop records by YYYY-MM-DD, preserving descending order. */
function groupByDate(records: PoopRecord[]): Array<[string, PoopRecord[]]> {
  const map = new Map<string, PoopRecord[]>();
  for (const r of records) {
    const arr = map.get(r.date) ?? [];
    arr.push(r);
    map.set(r.date, arr);
  }
  // Within each date, sort by time descending so the freshest entry is on top.
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, items]) => [
      date,
      [...items].sort((a, b) => b.time.localeCompare(a.time)),
    ]);
}

function formatDateHeader(date: string, locale: "zh-TW" | "en"): string {
  // `date` is always "YYYY-MM-DD". Render an absolute, locale-formatted
  // date string — caregivers asked for the literal date so they can refer
  // back to specific days when chatting with their pediatrician.
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(locale === "en" ? "en-US" : "zh-TW", {
    year: "numeric",
    month: "short",
    day: "numeric",
    weekday: "short",
  });
}
