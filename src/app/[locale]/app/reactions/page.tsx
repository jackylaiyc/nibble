"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useChildProfileStore } from "@/stores/childProfileStore";
import {
  useReactionStore,
  type ReactionRecord,
  type ReactionSeverity,
  type ReactionSymptom,
} from "@/stores/reactionStore";
import {
  ALLERGENS,
  getAllergen,
  type AllergenKey,
} from "@/lib/pediatric/allergenRegistry";
import { DISCLAIMERS } from "@/lib/pediatric/disclaimers";

/**
 * Reaction log — quick-entry form + reverse-chrono list.
 *
 * Severity = moderate|severe surfaces a pediatrician-referral banner per
 * the three-layer defense. We never assess the reaction; we just amplify
 * the hand-off to a clinician.
 */

const SYMPTOMS: ReactionSymptom[] = [
  "rash",
  "hives",
  "swelling",
  "vomiting",
  "diarrhea",
  "cough",
  "wheezing",
  "runny_nose",
  "fussy",
  "other",
];

const SYMPTOM_EMOJI: Record<ReactionSymptom, string> = {
  rash: "🌡️",
  hives: "🦟",
  swelling: "🫧",
  vomiting: "🤢",
  diarrhea: "💧",
  cough: "😮‍💨",
  wheezing: "🌬️",
  runny_nose: "🤧",
  fussy: "😭",
  other: "❓",
};

export default function ReactionsPage() {
  const locale = useLocale() as "zh-TW" | "en";
  const t = useTranslations("Reactions");
  const tCommon = useTranslations("Common");

  const loadChildren = useChildProfileStore((s) => s.loadFromStorage);
  const childLoaded = useChildProfileStore((s) => s.loaded);
  const activeChild = useChildProfileStore((s) => s.getActiveChild());

  const loadR = useReactionStore((s) => s.loadFromStorage);
  const rLoaded = useReactionStore((s) => s.loaded);
  const addReaction = useReactionStore((s) => s.addReaction);
  const removeReaction = useReactionStore((s) => s.removeReaction);
  const getReactionsForChild = useReactionStore((s) => s.getReactionsForChild);

  useEffect(() => {
    loadChildren();
    loadR();
  }, [loadChildren, loadR]);

  const [food, setFood] = useState("");
  const [allergen, setAllergen] = useState<AllergenKey | "">("");
  const [selectedSymptoms, setSelectedSymptoms] = useState<ReactionSymptom[]>(
    [],
  );
  const [severity, setSeverity] = useState<ReactionSeverity>("mild");
  const [date, setDate] = useState(() => todayKey());
  const [time, setTime] = useState(() => currentHHMM());
  const [notes, setNotes] = useState("");

  const entries = useMemo(
    () => (activeChild ? getReactionsForChild(activeChild.id) : []),
    [activeChild, getReactionsForChild],
  );

  const severeOrModerate = severity === "severe" || severity === "moderate";

  if (!childLoaded || !rLoaded) {
    return (
      <main className="min-h-screen flex items-center justify-center text-ink-faded">
        {tCommon("loading")}
      </main>
    );
  }

  if (!activeChild) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-8 text-center">
        <div className="text-6xl mb-4">⚠️</div>
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

  function toggleSymptom(s: ReactionSymptom) {
    setSelectedSymptoms((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
  }

  function save() {
    if (!activeChild || !food.trim()) return;
    addReaction({
      childId: activeChild.id,
      date,
      time,
      food: food.trim(),
      allergen: allergen === "" ? null : allergen,
      symptoms: selectedSymptoms,
      severity,
      notes,
    });
    // Reset so the caregiver can log a second reaction or check history.
    setFood("");
    setAllergen("");
    setSelectedSymptoms([]);
    setSeverity("mild");
    setNotes("");
    setTime(currentHHMM());
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

      <div className="max-w-xl mx-auto px-6 pt-6 space-y-6">
        <p className="text-sm text-ink-soft">{t("sub")}</p>

        {/* Food */}
        <label className="block">
          <span className="block text-sm font-medium text-ink mb-1">
            {t("foodLabel")}
          </span>
          <input
            value={food}
            onChange={(e) => setFood(e.target.value)}
            placeholder={t("foodPlaceholder")}
            className="w-full rounded-card bg-white border border-border px-4 py-3 text-ink"
          />
        </label>

        {/* Optional allergen tag */}
        <label className="block">
          <span className="block text-sm font-medium text-ink mb-1">
            {t("allergenTagLabel")}{" "}
            <span className="text-ink-faded text-xs font-normal">
              {tCommon("optional")}
            </span>
          </span>
          <select
            value={allergen}
            onChange={(e) => setAllergen(e.target.value as AllergenKey | "")}
            className="w-full rounded-card bg-white border border-border px-4 py-3 text-ink"
          >
            <option value="">{t("allergenTagNone")}</option>
            {ALLERGENS.map((a) => (
              <option key={a.key} value={a.key}>
                {a.emoji} {a.label[locale]}
              </option>
            ))}
          </select>
        </label>

        {/* Symptoms */}
        <section>
          <p className="text-sm font-medium text-ink mb-2">
            {t("symptomsLabel")}
          </p>
          <div className="flex flex-wrap gap-2">
            {SYMPTOMS.map((s) => {
              const selected = selectedSymptoms.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleSymptom(s)}
                  className={`px-3 py-2 rounded-full text-sm font-medium transition-all ${
                    selected
                      ? "bg-peach/40 ring-2 ring-peach-deep text-ink"
                      : "bg-white border border-border text-ink-soft hover:border-peach-deep"
                  }`}
                >
                  {SYMPTOM_EMOJI[s]} {t(`symptom_${s}` as "symptom_rash")}
                </button>
              );
            })}
          </div>
        </section>

        {/* Severity */}
        <section>
          <p className="text-sm font-medium text-ink mb-2">
            {t("severityLabel")}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {(["mild", "moderate", "severe"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSeverity(s)}
                className={`px-3 py-3 rounded-card font-medium transition-all ${
                  severity === s
                    ? severityClass(s)
                    : "bg-white border border-border text-ink-soft hover:border-peach-deep"
                }`}
              >
                {t(`severity_${s}` as "severity_mild")}
              </button>
            ))}
          </div>
        </section>

        {severeOrModerate && (
          <div className="rounded-bubble bg-peach/40 border-2 border-peach-deep/40 p-5 card-pop">
            <div className="flex items-start gap-3">
              <div className="text-3xl shrink-0">🚨</div>
              <div>
                <p className="font-display font-semibold text-ink">
                  {t("severeBannerTitle")}
                </p>
                <p className="mt-1 text-sm text-ink leading-relaxed">
                  {DISCLAIMERS.pediatricianReferral[locale]}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* When */}
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-sm font-medium text-ink mb-1">
              {t("dateLabel")}
            </span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-card bg-white border border-border px-3 py-2 text-ink tabular-nums"
            />
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-ink mb-1">
              {t("timeLabel")}
            </span>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full rounded-card bg-white border border-border px-3 py-2 text-ink tabular-nums"
            />
          </label>
        </div>

        <label className="block">
          <span className="block text-sm font-medium text-ink mb-1">
            {t("notesLabel")}{" "}
            <span className="text-ink-faded text-xs font-normal">
              {tCommon("optional")}
            </span>
          </span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t("notesPlaceholder")}
            rows={2}
            className="w-full rounded-card bg-white border border-border px-3 py-2 text-ink resize-none"
          />
        </label>

        <button
          type="button"
          onClick={save}
          disabled={!food.trim()}
          className="w-full px-8 py-4 rounded-full bg-peach-deep text-white font-semibold text-lg bubble-shadow hover:bg-peach-deep/90 transition disabled:opacity-50"
        >
          {t("save")}
        </button>

        {/* Recent */}
        <section className="pt-4">
          <h2 className="font-display font-semibold text-ink mb-3">
            {t("recentTitle")}
          </h2>
          {entries.length === 0 ? (
            <p className="text-sm text-ink-faded text-center py-6">
              {t("emptyList")}
            </p>
          ) : (
            <ul className="space-y-2">
              {entries.slice(0, 10).map((r) => (
                <ReactionRow
                  key={r.id}
                  record={r}
                  locale={locale}
                  onDelete={() => {
                    if (confirm(tCommon("delete") + "?")) removeReaction(r.id);
                  }}
                  tSeverity={(s) =>
                    t(`severity_${s}` as "severity_mild")
                  }
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

function ReactionRow({
  record,
  locale,
  onDelete,
  tSeverity,
}: {
  record: ReactionRecord;
  locale: "zh-TW" | "en";
  onDelete: () => void;
  tSeverity: (s: ReactionSeverity) => string;
}) {
  const allergenInfo = record.allergen ? getAllergen(record.allergen) : null;
  return (
    <li className="p-4 rounded-card bg-white border border-border">
      <div className="flex items-center gap-3">
        <div className="size-10 rounded-2xl bg-peach/40 flex items-center justify-center text-lg shrink-0">
          {allergenInfo?.emoji ?? "⚠️"}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-ink truncate">
            {record.food}
            {allergenInfo && (
              <span className="ml-2 text-xs text-ink-faded">
                · {allergenInfo.label[locale]}
              </span>
            )}
          </p>
          <p className="text-xs text-ink-faded tabular-nums">
            {record.date} {record.time} · {tSeverity(record.severity)}
          </p>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="text-xs text-ink-faded hover:text-peach-deep px-2 py-1"
          aria-label="delete"
        >
          ×
        </button>
      </div>
      {record.symptoms.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {record.symptoms.map((s) => (
            <span
              key={s}
              className="text-[11px] bg-cream border border-border rounded-full px-2 py-0.5"
            >
              {SYMPTOM_EMOJI[s]}
            </span>
          ))}
        </div>
      )}
      {record.notes && (
        <p className="mt-2 text-xs text-ink-soft line-clamp-3">
          {record.notes}
        </p>
      )}
    </li>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────

function severityClass(s: ReactionSeverity): string {
  switch (s) {
    case "mild":
      return "bg-butter ring-2 ring-butter-deep text-ink";
    case "moderate":
      return "bg-peach/40 ring-2 ring-peach-deep text-ink";
    case "severe":
      return "bg-peach-deep ring-2 ring-peach-deep text-white";
  }
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function currentHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
