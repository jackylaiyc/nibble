"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useChildProfileStore } from "@/stores/childProfileStore";
import { useMilestoneStore } from "@/stores/milestoneStore";
import {
  milestonesSorted,
  type MilestoneInfo,
  type MilestoneKey,
} from "@/lib/pediatric/milestonePresets";
import {
  AGE_BUCKET_LABELS,
  ageInfoFromDob,
  type AgeBucket,
} from "@/lib/pediatric/ageBucket";

/**
 * Milestone grid — one tile per preset milestone, grouped by age bucket.
 *
 * Tiles for the child's current bucket are highlighted so the caregiver
 * knows what to watch for now. Older buckets remain visible (peek-ahead)
 * but de-emphasised. Tapping a tile unlocks/edits it via a modal that
 * lets the caregiver pick the date + add a note.
 */

export default function MilestonesPage() {
  const locale = useLocale() as "zh-TW" | "en";
  const t = useTranslations("Milestones");
  const tCommon = useTranslations("Common");

  const loadChildren = useChildProfileStore((s) => s.loadFromStorage);
  const childLoaded = useChildProfileStore((s) => s.loaded);
  const activeChild = useChildProfileStore((s) => s.getActiveChild());

  const loadMs = useMilestoneStore((s) => s.loadFromStorage);
  const msLoaded = useMilestoneStore((s) => s.loaded);
  const upsert = useMilestoneStore((s) => s.upsertMilestone);
  const remove = useMilestoneStore((s) => s.removeMilestone);
  const getForChild = useMilestoneStore((s) => s.getMilestoneForChild);

  useEffect(() => {
    loadChildren();
    loadMs();
  }, [loadChildren, loadMs]);

  const [editing, setEditing] = useState<MilestoneKey | null>(null);

  const currentBucket = activeChild
    ? ageInfoFromDob(activeChild.dob).bucket
    : null;

  const grouped = useMemo(() => groupByBucket(milestonesSorted()), []);

  if (!childLoaded || !msLoaded) {
    return (
      <main className="min-h-screen flex items-center justify-center text-ink-faded">
        {tCommon("loading")}
      </main>
    );
  }

  if (!activeChild) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-8 text-center">
        <div className="text-6xl mb-4">🎉</div>
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

  const activeMilestone = editing
    ? milestonesSorted().find((m) => m.key === editing)
    : null;
  const activeRecord =
    editing ? getForChild(activeChild.id, editing) : undefined;

  return (
    <main className="min-h-screen pb-16">
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
        {grouped.map(([bucket, items]) => {
          const isCurrent = bucket === currentBucket;
          return (
            <section key={bucket}>
              <div className="flex items-center gap-2 mb-3 px-1">
                <p className="text-xs font-medium text-ink-faded">
                  {AGE_BUCKET_LABELS[bucket][locale]}
                </p>
                {isCurrent && (
                  <span className="text-[11px] font-semibold text-sage-deep bg-sage/30 rounded-full px-2 py-0.5">
                    {t("currentBadge")}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {items.map((m) => {
                  const record = getForChild(activeChild.id, m.key);
                  const unlocked = !!record;
                  return (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => setEditing(m.key)}
                      className={`text-left p-4 rounded-card transition-all ${
                        unlocked
                          ? "bg-sage/30 border-2 border-sage-deep"
                          : isCurrent
                            ? "bg-white border border-border hover:border-peach-deep"
                            : "bg-white border border-border opacity-70 hover:opacity-100 hover:border-peach-deep"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <div className="text-2xl">{m.emoji}</div>
                        {unlocked && (
                          <span className="ml-auto text-xs font-semibold text-sage-deep">
                            ✓
                          </span>
                        )}
                      </div>
                      <p className="mt-2 font-display font-semibold text-sm text-ink leading-tight">
                        {m.label[locale]}
                      </p>
                      {unlocked && record && (
                        <p className="mt-1 text-[11px] text-ink-faded tabular-nums">
                          {record.achievedAt}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {/* Edit modal */}
      {activeMilestone && (
        <EditMilestoneModal
          milestone={activeMilestone}
          existing={activeRecord}
          locale={locale}
          onClose={() => setEditing(null)}
          onSave={(payload) => {
            upsert({
              childId: activeChild.id,
              key: activeMilestone.key,
              achievedAt: payload.achievedAt,
              notes: payload.notes,
            });
            setEditing(null);
          }}
          onRemove={() => {
            remove(activeChild.id, activeMilestone.key);
            setEditing(null);
          }}
          labels={{
            today: t("today"),
            achievedOn: t("achievedOn"),
            noteLabel: t("noteLabel"),
            notePlaceholder: t("notePlaceholder"),
            save: tCommon("save"),
            cancel: tCommon("cancel"),
            remove: t("removeMilestone"),
          }}
        />
      )}
    </main>
  );
}

function EditMilestoneModal({
  milestone,
  existing,
  locale,
  onClose,
  onSave,
  onRemove,
  labels,
}: {
  milestone: MilestoneInfo;
  existing?: { achievedAt: string; notes: string };
  locale: "zh-TW" | "en";
  onClose: () => void;
  onSave: (payload: { achievedAt: string; notes: string }) => void;
  onRemove: () => void;
  labels: {
    today: string;
    achievedOn: string;
    noteLabel: string;
    notePlaceholder: string;
    save: string;
    cancel: string;
    remove: string;
  };
}) {
  const [achievedAt, setAchievedAt] = useState(
    existing?.achievedAt ?? todayKey(),
  );
  const [notes, setNotes] = useState(existing?.notes ?? "");

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-6">
      <div className="w-full sm:max-w-md bg-cream rounded-t-bubble sm:rounded-bubble p-6 card-pop">
        <div className="flex items-start gap-3">
          <div className="text-4xl">{milestone.emoji}</div>
          <div className="flex-1">
            <p className="font-display text-lg font-bold text-ink">
              {milestone.label[locale]}
            </p>
            <p className="mt-1 text-sm text-ink-soft leading-relaxed">
              {milestone.note[locale]}
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="block text-sm font-medium text-ink mb-1">
              {labels.achievedOn}
            </span>
            <div className="flex gap-2">
              <input
                type="date"
                value={achievedAt}
                onChange={(e) => setAchievedAt(e.target.value)}
                className="flex-1 rounded-card bg-white border border-border px-3 py-2 text-ink tabular-nums"
              />
              <button
                type="button"
                onClick={() => setAchievedAt(todayKey())}
                className="px-3 rounded-card bg-white border border-border text-sm text-ink-soft hover:border-sage-deep"
              >
                {labels.today}
              </button>
            </div>
          </label>

          <label className="block">
            <span className="block text-sm font-medium text-ink mb-1">
              {labels.noteLabel}
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={labels.notePlaceholder}
              rows={2}
              className="w-full rounded-card bg-white border border-border px-3 py-2 text-ink resize-none"
            />
          </label>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-3 rounded-full border border-border text-ink-soft"
          >
            {labels.cancel}
          </button>
          {existing && (
            <button
              type="button"
              onClick={onRemove}
              className="text-sm text-peach-deep font-medium hover:underline"
            >
              {labels.remove}
            </button>
          )}
          <button
            type="button"
            onClick={() => onSave({ achievedAt, notes })}
            className="ml-auto px-6 py-3 rounded-full bg-sage-deep text-white font-semibold bubble-shadow hover:bg-sage-deep/90"
          >
            {labels.save}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────

function groupByBucket(
  list: MilestoneInfo[],
): Array<[AgeBucket, MilestoneInfo[]]> {
  const map = new Map<AgeBucket, MilestoneInfo[]>();
  for (const m of list) {
    const arr = map.get(m.typicalBucket) ?? [];
    arr.push(m);
    map.set(m.typicalBucket, arr);
  }
  return [...map.entries()];
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
