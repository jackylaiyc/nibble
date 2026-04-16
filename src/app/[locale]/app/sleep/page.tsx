"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useChildProfileStore } from "@/stores/childProfileStore";
import {
  useSleepStore,
  sleepDurationMinutes,
  type SleepKind,
  type SleepRecord,
} from "@/stores/sleepStore";

/**
 * Sleep log — combined quick-entry form + reverse-chrono list on one page.
 *
 * Form defaults:
 *   start = 1h before now, end = now → gives the caregiver a sensible
 *   baseline for "just woke up from a nap" and they only need to tweak
 *   whichever knob matters. Datetime-local is used so mobile keyboards
 *   are the right flavor.
 */

export default function SleepPage() {
  const locale = useLocale() as "zh-TW" | "en";
  const t = useTranslations("Sleep");
  const tCommon = useTranslations("Common");
  const router = useRouter();

  const loadChildren = useChildProfileStore((s) => s.loadFromStorage);
  const childLoaded = useChildProfileStore((s) => s.loaded);
  const activeChild = useChildProfileStore((s) => s.getActiveChild());

  const loadSleeps = useSleepStore((s) => s.loadFromStorage);
  const sleepsLoaded = useSleepStore((s) => s.loaded);
  const addSleep = useSleepStore((s) => s.addSleep);
  const removeSleep = useSleepStore((s) => s.removeSleep);
  const getSleepsForChild = useSleepStore((s) => s.getSleepsForChild);

  useEffect(() => {
    loadChildren();
    loadSleeps();
  }, [loadChildren, loadSleeps]);

  const [kind, setKind] = useState<SleepKind>("nap");
  const [startAt, setStartAt] = useState<string>(() => hourAgoLocalString());
  const [endAt, setEndAt] = useState<string>(() => nowLocalString());
  const [wakeEvents, setWakeEvents] = useState<number>(0);
  const [notes, setNotes] = useState<string>("");

  const entries = useMemo(
    () => (activeChild ? getSleepsForChild(activeChild.id) : []),
    [activeChild, getSleepsForChild],
  );

  const totals = useMemo(() => computeTotals(entries), [entries]);

  if (!childLoaded || !sleepsLoaded) {
    return (
      <main className="min-h-screen flex items-center justify-center text-ink-faded">
        {tCommon("loading")}
      </main>
    );
  }

  if (!activeChild) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-8 text-center">
        <div className="text-6xl mb-4">😴</div>
        <p className="text-ink-soft mb-6">{t("noChildWarning")}</p>
        <Link
          href="/onboarding"
          className="rounded-full bg-peach-deep text-white font-semibold px-8 py-3 bubble-shadow"
        >
          {t("goToOnboarding")} →
        </Link>
      </main>
    );
  }

  function save() {
    if (!activeChild) return;
    const startIso = parseLocalDatetime(startAt);
    const endIso = parseLocalDatetime(endAt);
    if (!startIso || !endIso || Date.parse(endIso) <= Date.parse(startIso)) {
      alert(t("invalidRange"));
      return;
    }
    addSleep({
      childId: activeChild.id,
      kind,
      startAt: startIso,
      endAt: endIso,
      wakeEvents,
      notes,
    });
    // Reset form defaults to encourage the next entry.
    setStartAt(hourAgoLocalString());
    setEndAt(nowLocalString());
    setWakeEvents(0);
    setNotes("");
    // Visual confirmation: bump the scroll so the new entry surfaces.
    router.refresh();
  }

  return (
    <main className="min-h-screen pb-24">
      <header className="sticky top-0 z-20 bg-cream/90 backdrop-blur-md border-b border-border px-6 py-4">
        <div className="max-w-xl mx-auto flex items-center gap-3">
          <Link href="/app" className="text-ink-soft hover:text-ink">
            ←
          </Link>
          <h1 className="font-display text-lg font-semibold text-ink flex-1">
            {t("title")}
          </h1>
        </div>
      </header>

      <div className="max-w-xl mx-auto px-6 pt-6 space-y-8">
        {/* Today's summary */}
        <section className="rounded-bubble bg-white card-pop p-5">
          <p className="text-xs font-medium text-ink-faded">
            {t("todayTotals")}
          </p>
          <div className="mt-2 grid grid-cols-3 gap-3 text-center">
            <SummaryCell
              label={t("napsCount")}
              value={totals.napsCount.toString()}
            />
            <SummaryCell
              label={t("totalHours")}
              value={formatHoursMinutes(totals.totalMinutes, locale)}
            />
            <SummaryCell
              label={t("wakeups")}
              value={totals.wakeEventsToday.toString()}
            />
          </div>
        </section>

        {/* Entry form */}
        <section className="space-y-4">
          <h2 className="font-display font-semibold text-ink">
            {t("newEntry")}
          </h2>

          {/* Kind toggle */}
          <div className="grid grid-cols-2 gap-2">
            {(["nap", "night"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`px-4 py-3 rounded-card font-medium transition-all ${
                  kind === k
                    ? "bg-sage/40 ring-2 ring-sage-deep text-ink"
                    : "bg-white border border-border text-ink-soft hover:border-sage-deep"
                }`}
              >
                {k === "nap" ? `☀️ ${t("nap")}` : `🌙 ${t("night")}`}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-sm font-medium text-ink mb-1">
                {t("startLabel")}
              </span>
              <input
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                className="w-full rounded-card bg-white border border-border px-3 py-2 text-ink tabular-nums"
              />
            </label>
            <label className="block">
              <span className="block text-sm font-medium text-ink mb-1">
                {t("endLabel")}
              </span>
              <input
                type="datetime-local"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
                className="w-full rounded-card bg-white border border-border px-3 py-2 text-ink tabular-nums"
              />
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-ink mb-1">
              {t("wakeupsLabel")}
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setWakeEvents((v) => Math.max(0, v - 1))}
                className="size-10 rounded-full bg-white border border-border text-xl font-semibold text-ink-soft"
                aria-label="−"
              >
                −
              </button>
              <span className="flex-1 text-center font-display text-2xl font-bold tabular-nums">
                {wakeEvents}
              </span>
              <button
                type="button"
                onClick={() => setWakeEvents((v) => v + 1)}
                className="size-10 rounded-full bg-white border border-border text-xl font-semibold text-ink-soft"
                aria-label="+"
              >
                +
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-ink mb-1">
              {t("notesLabel")}{" "}
              <span className="text-ink-faded text-xs">
                {tCommon("optional")}
              </span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("notesPlaceholder")}
              rows={2}
              className="w-full rounded-card bg-white border border-border px-3 py-2 text-ink resize-none"
            />
          </div>

          <button
            type="button"
            onClick={save}
            className="w-full px-8 py-4 rounded-full bg-sage-deep text-white font-semibold text-lg bubble-shadow hover:bg-sage-deep/90 transition"
          >
            {t("save")}
          </button>
        </section>

        {/* Recent */}
        <section>
          <h2 className="font-display font-semibold text-ink mb-3">
            {t("recentTitle")}
          </h2>
          {entries.length === 0 ? (
            <p className="text-sm text-ink-faded text-center py-6">
              {t("emptyList")}
            </p>
          ) : (
            <ul className="space-y-2">
              {entries.slice(0, 20).map((s) => (
                <SleepRow
                  key={s.id}
                  record={s}
                  locale={locale}
                  onDelete={() => {
                    if (confirm(tCommon("delete") + "?")) removeSleep(s.id);
                  }}
                  tLabels={{
                    nap: t("nap"),
                    night: t("night"),
                    wakeups: t("wakeupsShort"),
                  }}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

function SleepRow({
  record,
  locale,
  onDelete,
  tLabels,
}: {
  record: SleepRecord;
  locale: "zh-TW" | "en";
  onDelete: () => void;
  tLabels: { nap: string; night: string; wakeups: string };
}) {
  const minutes = sleepDurationMinutes(record);
  const kindEmoji = record.kind === "nap" ? "☀️" : "🌙";
  return (
    <li className="flex items-center gap-3 p-4 rounded-card bg-white border border-border">
      <div className="size-10 rounded-2xl bg-butter/60 flex items-center justify-center text-lg shrink-0">
        {kindEmoji}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-ink">
          {record.kind === "nap" ? tLabels.nap : tLabels.night} ·{" "}
          {formatHoursMinutes(minutes, locale)}
        </p>
        <p className="text-xs text-ink-faded tabular-nums">
          {formatTimeRange(record.startAt, record.endAt, locale)}
          {record.wakeEvents > 0 &&
            ` · ${record.wakeEvents} ${tLabels.wakeups}`}
        </p>
        {record.notes && (
          <p className="mt-1 text-xs text-ink-soft line-clamp-2">
            {record.notes}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onDelete}
        className="text-xs text-ink-faded hover:text-peach-deep px-2 py-1"
        aria-label="delete"
      >
        ×
      </button>
    </li>
  );
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-display text-2xl font-bold text-ink tabular-nums">
        {value}
      </p>
      <p className="text-[11px] text-ink-faded mt-0.5">{label}</p>
    </div>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** datetime-local format: "2026-04-16T13:30". Uses the local TZ. */
function nowLocalString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function hourAgoLocalString(): string {
  const d = new Date(Date.now() - 60 * 60 * 1000);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Parse "2026-04-16T13:30" local → ISO string. */
function parseLocalDatetime(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

function formatHoursMinutes(total: number, locale: "zh-TW" | "en"): string {
  if (total <= 0) return locale === "en" ? "0m" : "0 分";
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (locale === "en") {
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }
  return h > 0 ? `${h}小時 ${m}分` : `${m}分`;
}

function formatTimeRange(
  startIso: string,
  endIso: string,
  locale: "zh-TW" | "en",
): string {
  try {
    const s = new Date(startIso);
    const e = new Date(endIso);
    const opts: Intl.DateTimeFormatOptions = {
      hour: "2-digit",
      minute: "2-digit",
    };
    const startLbl = s.toLocaleTimeString(
      locale === "en" ? "en-US" : "zh-TW",
      opts,
    );
    const endLbl = e.toLocaleTimeString(
      locale === "en" ? "en-US" : "zh-TW",
      opts,
    );
    return `${startLbl} → ${endLbl}`;
  } catch {
    return "—";
  }
}

function computeTotals(entries: SleepRecord[]): {
  napsCount: number;
  totalMinutes: number;
  wakeEventsToday: number;
} {
  const todayKey = dateKey(new Date());
  let napsCount = 0;
  let totalMinutes = 0;
  let wakeEventsToday = 0;
  for (const entry of entries) {
    const d = new Date(entry.startAt);
    if (dateKey(d) !== todayKey) continue;
    if (entry.kind === "nap") napsCount += 1;
    totalMinutes += sleepDurationMinutes(entry);
    wakeEventsToday += entry.wakeEvents;
  }
  return { napsCount, totalMinutes, wakeEventsToday };
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
