"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useChildProfileStore } from "@/stores/childProfileStore";
import {
  useBabyFeedStore,
  type BabyFeedType,
  type BreastSide,
  type DiaperKind,
} from "@/stores/babyFeedStore";

/**
 * /app/baby-feed/log
 *
 * Quick-add screen for breastfeeding mothers tracking a 0–6mo baby.
 * Tabbed into three entry types: breastfeeding session, formula bottle,
 * diaper. Each tab is its own minimal form so logging takes ≤10 seconds.
 *
 * Timestamp defaults to "now" so a tired parent can just tap the right
 * tab → set the relevant field → Save. Advanced cases (backdating after
 * a sleep-through, etc.) edit the datetime field.
 */

type Tab = BabyFeedType;

export default function BabyFeedLogPage() {
  const locale = useLocale() as "zh-TW" | "en";
  const router = useRouter();
  const L = (en: string, zh: string) => (locale === "en" ? en : zh);

  // Stores
  const loadChildren = useChildProfileStore((s) => s.loadFromStorage);
  const activeChild = useChildProfileStore((s) => s.getActiveChild());
  const loadFeeds = useBabyFeedStore((s) => s.loadFromStorage);
  const addEntry = useBabyFeedStore((s) => s.addEntry);

  useEffect(() => {
    loadChildren();
    loadFeeds();
  }, [loadChildren, loadFeeds]);

  const [tab, setTab] = useState<Tab>("breastfeeding");
  const [timestamp, setTimestamp] = useState<string>(() => nowDatetimeLocal());

  // Breastfeeding form state
  const [side, setSide] = useState<BreastSide>("left");
  const [durationMinutes, setDurationMinutes] = useState<number>(15);

  // Formula form state
  const [volumeML, setVolumeML] = useState<number>(90);

  // Diaper form state
  const [diaperKind, setDiaperKind] = useState<DiaperKind>("wet");

  const [notes, setNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);

  if (!activeChild) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-8 text-center">
        <p className="text-ink-faded mb-4">
          {L("No profile selected.", "尚未選擇檔案。")}
        </p>
        <Link href="/app" className="text-peach-deep font-semibold">
          ← {L("Back to home", "回首頁")}
        </Link>
      </main>
    );
  }

  const isBreastfeedingProfile = activeChild.kind === "breastfeeding";

  function handleSave() {
    if (!activeChild) return;
    setSaving(true);
    // The datetime-local input yields "YYYY-MM-DDTHH:MM" — append :00 for
    // proper ISO. Convert through Date to normalize timezone.
    const iso = new Date(timestamp).toISOString();
    addEntry({
      profileId: activeChild.id,
      type: tab,
      timestamp: iso,
      side: tab === "breastfeeding" ? side : undefined,
      durationMinutes: tab === "breastfeeding" ? durationMinutes : undefined,
      volumeML: tab === "formula" ? volumeML : undefined,
      diaperKind: tab === "diaper" ? diaperKind : undefined,
      notes: notes.trim() || undefined,
    });
    router.push("/app/baby-feed/history");
  }

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
            {L("Log baby feed", "記錄寶寶餵食")}
          </h1>
          <Link href="/app/baby-feed/history" className="text-sm text-peach-deep font-medium">
            {L("History", "紀錄")}
          </Link>
        </div>
      </header>

      <div className="max-w-xl mx-auto px-5 py-6 space-y-6">
        {!isBreastfeedingProfile && (
          <div className="rounded-card bg-butter/40 border border-butter-deep/30 p-4 text-sm">
            <p className="font-semibold text-ink mb-1">
              {L("Tip", "提示")}
            </p>
            <p className="text-ink-soft">
              {L(
                "Baby feed tracking is designed for breastfeeding profiles. You can still log here — it's tied to the active profile.",
                "寶寶餵食紀錄是為哺乳中的媽媽設計，不過你仍可以記錄。資料會連結到目前使用中的檔案。",
              )}
            </p>
          </div>
        )}

        {/* Type tabs */}
        <div className="grid grid-cols-3 gap-2">
          {([
            { key: "breastfeeding" as const, emoji: "🤱", en: "Breastfeed", zh: "哺乳" },
            { key: "formula" as const, emoji: "🍼", en: "Formula", zh: "配方奶" },
            { key: "diaper" as const, emoji: "👶", en: "Diaper", zh: "尿布" },
          ]).map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setTab(opt.key)}
              className={`flex flex-col items-center gap-1 py-4 rounded-card transition-all ${
                tab === opt.key
                  ? "bg-peach/30 ring-2 ring-peach-deep"
                  : "bg-white border border-border hover:border-peach-deep"
              }`}
            >
              <span className="text-2xl">{opt.emoji}</span>
              <span className="text-sm font-medium text-ink">
                {L(opt.en, opt.zh)}
              </span>
            </button>
          ))}
        </div>

        {/* Timestamp — shared across tabs */}
        <div>
          <label className="block text-xs text-ink-faded mb-1" htmlFor="bf-when">
            {L("When", "時間")}
          </label>
          <input
            id="bf-when"
            type="datetime-local"
            value={timestamp}
            max={nowDatetimeLocal()}
            onChange={(e) => setTimestamp(e.target.value)}
            className="w-full px-4 py-3 rounded-card border border-border bg-white text-ink text-base"
          />
        </div>

        {/* Tab-specific fields */}
        {tab === "breastfeeding" && (
          <div className="space-y-4 rounded-bubble bg-white card-pop p-5">
            <div>
              <span className="block text-sm font-medium text-ink mb-2">
                {L("Side", "哪一邊")}
              </span>
              <div className="grid grid-cols-3 gap-2">
                {(["left", "right", "both"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSide(s)}
                    className={`px-3 py-3 rounded-card text-sm font-medium transition-all ${
                      side === s
                        ? "bg-sage/40 ring-2 ring-sage-deep text-ink"
                        : "bg-white border border-border text-ink-soft hover:border-sage-deep"
                    }`}
                  >
                    {s === "left" ? L("Left", "左") : s === "right" ? L("Right", "右") : L("Both", "雙邊")}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-2" htmlFor="bf-duration">
                {L("Duration (minutes)", "時長（分鐘）")}
              </label>
              <input
                id="bf-duration"
                type="number"
                min={1}
                max={120}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value) || 0)}
                className="w-full px-4 py-3 rounded-card border border-border bg-white text-ink text-base"
              />
            </div>
          </div>
        )}

        {tab === "formula" && (
          <div className="space-y-4 rounded-bubble bg-white card-pop p-5">
            <div>
              <label className="block text-sm font-medium text-ink mb-2" htmlFor="bf-volume">
                {L("Volume", "容量")}
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="bf-volume"
                  type="number"
                  min={0}
                  step={5}
                  value={volumeML}
                  onChange={(e) => setVolumeML(Number(e.target.value) || 0)}
                  className="flex-1 px-4 py-3 rounded-card border border-border bg-white text-ink text-base tabular-nums"
                />
                <span className="text-ink-soft font-medium">
                  ml <span className="text-ink-faded text-xs">(≈ {Math.round(volumeML / 30)} oz)</span>
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {[60, 90, 120, 150, 180].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setVolumeML(v)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
                      volumeML === v
                        ? "bg-sage/40 ring-1 ring-sage-deep text-ink"
                        : "bg-white border border-border text-ink-soft"
                    }`}
                  >
                    {v} ml
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "diaper" && (
          <div className="space-y-4 rounded-bubble bg-white card-pop p-5">
            <span className="block text-sm font-medium text-ink mb-2">
              {L("Kind", "類型")}
            </span>
            <div className="grid grid-cols-3 gap-2">
              {(["wet", "dirty", "mixed"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setDiaperKind(k)}
                  className={`px-3 py-3 rounded-card text-sm font-medium transition-all ${
                    diaperKind === k
                      ? "bg-sage/40 ring-2 ring-sage-deep text-ink"
                      : "bg-white border border-border text-ink-soft hover:border-sage-deep"
                  }`}
                >
                  {k === "wet"
                    ? L("💧 Wet", "💧 尿")
                    : k === "dirty"
                      ? L("💩 Dirty", "💩 便")
                      : L("💧💩 Mixed", "💧💩 混合")}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Notes (optional) */}
        <div>
          <label className="block text-xs text-ink-faded mb-1" htmlFor="bf-notes">
            {L("Notes (optional)", "備註（選填）")}
          </label>
          <textarea
            id="bf-notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={L("e.g. fussier than usual", "例如：比平常躁動")}
            className="w-full px-4 py-3 rounded-card border border-border bg-white text-ink text-base resize-none"
          />
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full py-4 rounded-full bg-peach-deep text-white font-semibold text-lg bubble-shadow hover:bg-peach-deep/90 transition disabled:opacity-60"
        >
          {saving ? L("Saving…", "儲存中…") : L("Save entry", "儲存紀錄")}
        </button>
      </div>
    </main>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────

function nowDatetimeLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
