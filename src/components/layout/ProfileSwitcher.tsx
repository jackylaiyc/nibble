"use client";

import { useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import {
  useChildProfileStore,
  type Child,
  type ProfileKind,
} from "@/stores/childProfileStore";
import { getLifeStage } from "@/lib/pediatric/ageBucket";

/**
 * Profile switcher chip for the dashboard header. Shows the active profile's
 * avatar + name + life-stage label; tap to switch between profiles (e.g. a
 * parent tracking both her pregnancy and her toddler) or add a new one.
 *
 * Kept simple intentionally — one chip, one sheet. No drag-reorder, no
 * archive, no advanced editing. Users edit or remove profiles from the
 * "More" tab (future work).
 */

interface Props {
  locale: "zh-TW" | "en";
}

const KIND_EMOJI: Record<ProfileKind, string> = {
  infant: "👶",
  pregnant: "🤰",
  breastfeeding: "🤱",
};

export function ProfileSwitcher({ locale }: Props) {
  const router = useRouter();
  const children = useChildProfileStore((s) => s.children);
  const activeChildId = useChildProfileStore((s) => s.activeChildId);
  const setActiveChild = useChildProfileStore((s) => s.setActiveChild);
  const [open, setOpen] = useState(false);

  const active =
    children.find((c) => c.id === activeChildId) ?? children[0] ?? null;
  if (!active) return null;

  const L = (en: string, zh: string) => (locale === "en" ? en : zh);

  function stageLabel(child: Child): string {
    const stage = getLifeStage(child);
    return stage.displayShort;
  }

  function pickProfile(id: string) {
    setActiveChild(id);
    setOpen(false);
  }

  function addAnother() {
    setOpen(false);
    router.push("/onboarding");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-full bg-white border border-border hover:border-peach-deep transition max-w-full min-w-0"
      >
        <span className="text-base shrink-0">{active.avatar || KIND_EMOJI[active.kind ?? "infant"]}</span>
        <span className="text-sm font-medium text-ink truncate max-w-[6rem]">
          {active.name}
        </span>
        <span className="text-[11px] text-ink-faded truncate">
          {stageLabel(active)}
        </span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ink-faded shrink-0">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 p-0 sm:p-6"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full sm:max-w-md bg-cream rounded-t-bubble sm:rounded-bubble p-5 card-pop"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-display text-lg font-semibold text-ink mb-3">
              {L("Switch profile", "切換檔案")}
            </p>
            <ul className="space-y-2 mb-3">
              {children.map((c) => {
                const isActive = c.id === activeChildId;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => pickProfile(c.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-card transition ${
                        isActive
                          ? "bg-peach/30 ring-2 ring-peach-deep"
                          : "bg-white border border-border hover:border-peach-deep"
                      }`}
                    >
                      <span className="text-2xl">
                        {c.avatar || KIND_EMOJI[c.kind ?? "infant"]}
                      </span>
                      <div className="flex-1 min-w-0 text-left">
                        <p className="font-medium text-ink truncate">{c.name}</p>
                        <p className="text-[11px] text-ink-faded truncate">
                          {stageLabel(c)}
                        </p>
                      </div>
                      {isActive && (
                        <span className="text-xs text-peach-deep font-semibold shrink-0">
                          {L("Active", "使用中")}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              onClick={addAnother}
              className="w-full py-3 px-4 rounded-card border-2 border-dashed border-border text-ink-soft font-medium hover:border-peach-deep hover:text-peach-deep transition flex items-center justify-center gap-2"
            >
              <span className="text-lg leading-none">+</span>
              {L("Add another profile", "新增檔案")}
            </button>
            <Link
              href="/app/more"
              onClick={() => setOpen(false)}
              className="block w-full mt-2 text-center text-xs text-ink-faded py-2"
            >
              {L("Manage profiles →", "管理所有檔案 →")}
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
