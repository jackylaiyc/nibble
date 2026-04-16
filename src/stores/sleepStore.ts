"use client";

import { create } from "zustand";

/**
 * Sleep log (naps + nights).
 *
 * We store start + end as ISO strings — duration is derived, never stored,
 * so edits to start/end always reflect in the chart without a backfill step.
 * Wake events are a simple count for the MVP; later we can upgrade to
 * timestamps when we plot night-by-night patterns.
 */

export type SleepKind = "nap" | "night";

export interface SleepRecord {
  id: string;
  childId: string;
  kind: SleepKind;
  /** ISO datetime ("2026-04-16T13:00:00.000Z"). */
  startAt: string;
  /** ISO datetime. Must be >= startAt. */
  endAt: string;
  /** Times the baby woke up between start and end (approximate). */
  wakeEvents: number;
  notes: string;
  createdAt: string;
}

interface SleepState {
  sleeps: SleepRecord[];
  loaded: boolean;
  loadFromStorage: () => void;
  addSleep: (record: Omit<SleepRecord, "id" | "createdAt">) => string;
  removeSleep: (id: string) => void;
  getSleepsForChild: (childId: string) => SleepRecord[];
}

const STORAGE_KEY = "nibble_sleeps";

function loadSleeps(): SleepRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored) as SleepRecord[];
  } catch {
    /* ignore */
  }
  return [];
}

function saveSleeps(sleeps: SleepRecord[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sleeps));
  } catch {
    /* ignore */
  }
}

export const useSleepStore = create<SleepState>((set, get) => ({
  sleeps: [],
  loaded: false,

  loadFromStorage: () => {
    set({ sleeps: loadSleeps(), loaded: true });
  },

  addSleep: (record) => {
    const id = `s_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const sleep: SleepRecord = {
      ...record,
      id,
      createdAt: new Date().toISOString(),
    };
    const updated = [...get().sleeps, sleep];
    set({ sleeps: updated });
    saveSleeps(updated);
    return id;
  },

  removeSleep: (id) => {
    const updated = get().sleeps.filter((s) => s.id !== id);
    set({ sleeps: updated });
    saveSleeps(updated);
  },

  getSleepsForChild: (childId) => {
    return get()
      .sleeps.filter((s) => s.childId === childId)
      .sort((a, b) => b.startAt.localeCompare(a.startAt));
  },
}));

/**
 * Minutes between start and end. Returns 0 for malformed input so we can
 * render without defensive checks upstream.
 */
export function sleepDurationMinutes(record: {
  startAt: string;
  endAt: string;
}): number {
  const s = Date.parse(record.startAt);
  const e = Date.parse(record.endAt);
  if (isNaN(s) || isNaN(e) || e <= s) return 0;
  return Math.round((e - s) / 60000);
}
