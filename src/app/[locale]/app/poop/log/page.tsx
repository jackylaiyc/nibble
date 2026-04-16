"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useChildProfileStore } from "@/stores/childProfileStore";
import { usePoopStore } from "@/stores/poopStore";
import {
  BRISTOL_SCALE,
  POOP_COLORS,
  shouldReferToPediatrician,
  type BristolType,
  type PoopColor,
} from "@/lib/pediatric/bristolScale";
import { DISCLAIMERS } from "@/lib/pediatric/disclaimers";

/**
 * Poop log entry form.
 *
 * The caregiver picks:
 *   1. Bristol type (1-7, with descriptive sub-label, never a diagnosis)
 *   2. Color (6 swatches; black / red / white surface a referral banner)
 *   3. Time (defaults to now)
 *   4. Optional notes
 *
 * On save → poopStore.addPoop() → bounce to the history page so the entry
 * lands visibly in a list (otherwise it's easy to wonder if save worked).
 */

export default function PoopLogPage() {
  // Wrap the body so useSearchParams doesn't trigger a CSR bailout warning.
  return (
    <Suspense fallback={null}>
      <PoopLogPageInner />
    </Suspense>
  );
}

function PoopLogPageInner() {
  const locale = useLocale() as "zh-TW" | "en";
  const t = useTranslations("Poop");
  const tCommon = useTranslations("Common");
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");

  const loadChildren = useChildProfileStore((s) => s.loadFromStorage);
  const childLoaded = useChildProfileStore((s) => s.loaded);
  const activeChild = useChildProfileStore((s) => s.getActiveChild());

  const loadPoops = usePoopStore((s) => s.loadFromStorage);
  const poopsLoaded = usePoopStore((s) => s.loaded);
  const allPoops = usePoopStore((s) => s.poops);
  const addPoop = usePoopStore((s) => s.addPoop);
  const updatePoop = usePoopStore((s) => s.updatePoop);

  useEffect(() => {
    loadChildren();
    loadPoops();
  }, [loadChildren, loadPoops]);

  // Look up the record we're editing (if any) — null means "new entry".
  const editingRecord = useMemo(
    () => (editId ? allPoops.find((p) => p.id === editId) ?? null : null),
    [editId, allPoops],
  );
  const isEditing = editingRecord !== null;

  const [bristol, setBristol] = useState<BristolType>(4);
  const [color, setColor] = useState<PoopColor>("yellow");
  const [time, setTime] = useState<string>(() => currentHHMM());
  const [date, setDate] = useState<string>(() => todayKey());
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [hydratedFromEdit, setHydratedFromEdit] = useState(false);

  // Once the store has loaded and we have an edit target, prefill the form.
  // We guard with `hydratedFromEdit` so subsequent re-renders don't clobber
  // the caregiver's edits while they're typing. The setState calls here run
  // exactly once (guarded by the flag), so the cascading-render concern
  // flagged by the lint rule does not apply.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!poopsLoaded || hydratedFromEdit) return;
    if (editingRecord) {
      setBristol(editingRecord.bristolType);
      setColor(editingRecord.color);
      setTime(editingRecord.time);
      setDate(editingRecord.date);
      setNotes(editingRecord.notes);
    }
    setHydratedFromEdit(true);
  }, [poopsLoaded, editingRecord, hydratedFromEdit]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const redFlag = useMemo(
    () => shouldReferToPediatrician(bristol, color),
    [bristol, color],
  );

  const currentBristol = BRISTOL_SCALE.find((b) => b.type === bristol)!;

  if (!childLoaded) {
    return (
      <main className="min-h-screen flex items-center justify-center text-ink-faded">
        {tCommon("loading")}
      </main>
    );
  }

  if (!activeChild) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-8 text-center">
        <div className="text-6xl mb-4">🍎</div>
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
    setSaving(true);
    if (isEditing && editingRecord) {
      updatePoop(editingRecord.id, {
        date,
        time,
        bristolType: bristol,
        color,
        notes,
      });
    } else {
      addPoop({
        childId: activeChild.id,
        date,
        time,
        bristolType: bristol,
        color,
        notes,
      });
    }
    // Small delay so the button state is visible before the route change.
    setTimeout(() => router.push("/app/poop/history"), 300);
  }

  return (
    <main className="min-h-screen pb-36">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-cream/90 backdrop-blur-md border-b border-border px-6 py-4">
        <div className="max-w-xl mx-auto flex items-center gap-3">
          <Link href="/app" className="text-ink-soft hover:text-ink">
            ←
          </Link>
          <h1 className="font-display text-lg font-semibold text-ink flex-1">
            {isEditing ? t("editTitle") : t("title")}
          </h1>
          <Link
            href="/app/poop/history"
            className="text-xs font-medium text-ink-soft hover:text-ink"
          >
            {t("historyLink")}
          </Link>
        </div>
      </header>

      <div className="max-w-xl mx-auto px-6 pt-6 space-y-7">
        <p className="text-ink-soft text-sm">{t("sub")}</p>

        {/* Bristol picker */}
        <section>
          <p className="font-display font-semibold text-ink mb-3">
            {t("bristolTitle")}
          </p>
          <div className="grid grid-cols-7 gap-2">
            {BRISTOL_SCALE.map((b) => (
              <button
                key={b.type}
                type="button"
                onClick={() => setBristol(b.type)}
                className={`py-3 rounded-card text-sm font-semibold tabular-nums transition-all ${
                  bristol === b.type
                    ? severityBgClass(b.severity)
                    : "bg-white border border-border text-ink-soft hover:border-sage-deep"
                }`}
                aria-label={`Bristol type ${b.type}`}
              >
                {b.type}
              </button>
            ))}
          </div>
          <div className="mt-3 rounded-card bg-white border border-border p-4">
            <p className="font-display font-medium text-ink">
              {t("bristolLabelPrefix", { n: bristol })} · {currentBristol.label[locale]}
            </p>
            <p className="mt-1 text-sm text-ink-soft leading-relaxed">
              {currentBristol.description[locale]}
            </p>
          </div>
        </section>

        {/* Color picker */}
        <section>
          <p className="font-display font-semibold text-ink mb-3">
            {t("colorTitle")}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(POOP_COLORS) as PoopColor[]).map((c) => {
              const info = POOP_COLORS[c];
              const selected = color === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`p-3 rounded-card flex items-center gap-3 transition-all ${
                    selected
                      ? "bg-sage/30 ring-2 ring-sage-deep"
                      : "bg-white border border-border hover:border-sage-deep"
                  }`}
                >
                  <div
                    className="size-7 rounded-full border border-black/10 shrink-0"
                    style={{ background: info.swatch }}
                  />
                  <span className="text-sm font-medium text-ink text-left leading-tight">
                    {info.label[locale]}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Red-flag banner — lives above Time/Notes so it's impossible to miss. */}
        {redFlag && (
          <div className="rounded-bubble bg-peach/40 border-2 border-peach-deep/40 p-5 card-pop">
            <div className="flex items-start gap-3">
              <div className="text-3xl shrink-0">🚨</div>
              <div>
                <p className="font-display font-semibold text-ink">
                  {t("redFlagTitle")}
                </p>
                <p className="mt-1 text-sm text-ink leading-relaxed">
                  {DISCLAIMERS.pediatricianReferral[locale]}
                </p>
                <p className="mt-2 text-xs text-ink-soft leading-relaxed">
                  {t("redFlagHint")}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Date + Time */}
        <section className="grid grid-cols-2 gap-3">
          <div>
            <label className="block font-display font-semibold text-ink mb-2">
              {locale === "en" ? "Date" : "日期"}
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              max={todayKey()}
              className="w-full rounded-card bg-white border border-border px-4 py-3 text-ink font-medium tabular-nums"
            />
          </div>
          <div>
            <label className="block font-display font-semibold text-ink mb-2">
              {t("timeLabel")}
            </label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full rounded-card bg-white border border-border px-4 py-3 text-ink font-medium tabular-nums"
            />
          </div>
        </section>

        {/* Notes */}
        <section>
          <label className="block font-display font-semibold text-ink mb-2">
            {t("notesLabel")}{" "}
            <span className="text-ink-faded font-normal text-sm">
              {tCommon("optional")}
            </span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t("notesPlaceholder")}
            rows={3}
            className="w-full rounded-card bg-white border border-border px-4 py-3 text-ink resize-none"
          />
        </section>

        <p className="text-[11px] text-ink-faded text-center">
          {DISCLAIMERS.footer[locale]}
        </p>
      </div>

      {/* Sticky save */}
      <nav className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-md border-t border-border px-6 py-4">
        <div className="max-w-xl mx-auto">
          <button
            onClick={save}
            disabled={saving}
            className="w-full px-8 py-4 rounded-full bg-sage-deep text-white font-semibold text-lg bubble-shadow hover:bg-sage-deep/90 transition disabled:opacity-60"
          >
            {saving
              ? isEditing
                ? t("updating")
                : t("saving")
              : isEditing
                ? t("update")
                : t("save")}
          </button>
        </div>
      </nav>
    </main>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────

function currentHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function severityBgClass(
  severity: "constipated" | "ideal" | "loose",
): string {
  switch (severity) {
    case "constipated":
      return "bg-butter ring-2 ring-butter-deep text-ink";
    case "ideal":
      return "bg-sage/50 ring-2 ring-sage-deep text-ink";
    case "loose":
      return "bg-peach/40 ring-2 ring-peach-deep text-ink";
  }
}
