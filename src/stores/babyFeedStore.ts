"use client";

import { create } from "zustand";

/**
 * Baby-feed tracker — three entry types in one store so a breastfeeding
 * mother's newborn (0–6 months) can be tracked without plate-scanning.
 *
 *   - breastfeeding: session timer + side
 *   - formula:       volume per bottle
 *   - diaper:        wet / dirty / mixed
 *
 * All entries are keyed by the mother's profile id (the breastfeeding
 * profile's `Child.id`). The baby is implicit — if the mother has twins
 * or multiple children being tracked separately, they'd have separate
 * breastfeeding profiles, and each profile has its own feed log.
 *
 * Persistence: localStorage under `nibble_baby_feeds`. Same pattern as
 * mealStore/poopStore so loading is uniform across the app.
 */

export type BabyFeedType = "breastfeeding" | "formula" | "diaper";
export type BreastSide = "left" | "right" | "both";
export type DiaperKind = "wet" | "dirty" | "mixed";

export interface BabyFeedEntry {
  id: string;
  /** Which maternal profile this entry belongs to. */
  profileId: string;
  type: BabyFeedType;
  /** ISO timestamp of the event (for breastfeeding this is the START time). */
  timestamp: string;

  // ─── breastfeeding-specific ─────────────────────────────────────────
  side?: BreastSide;
  durationMinutes?: number;

  // ─── formula-specific ──────────────────────────────────────────────
  /** Bottle volume in millilitres. 30 ml ≈ 1 oz. */
  volumeML?: number;

  // ─── diaper-specific ───────────────────────────────────────────────
  diaperKind?: DiaperKind;

  notes?: string;
  createdAt: string;
}

interface BabyFeedState {
  entries: BabyFeedEntry[];
  loaded: boolean;

  loadFromStorage: () => void;
  addEntry: (entry: Omit<BabyFeedEntry, "id" | "createdAt">) => string;
  updateEntry: (
    id: string,
    updates: Partial<Omit<BabyFeedEntry, "id" | "createdAt" | "profileId">>,
  ) => void;
  removeEntry: (id: string) => void;

  /** All entries for a profile, newest-first. */
  getEntriesForProfile: (profileId: string) => BabyFeedEntry[];
  /** Entries for a profile on a given local-day, newest-first. */
  getEntriesForDate: (profileId: string, date: Date) => BabyFeedEntry[];
}

const STORAGE_KEY = "nibble_baby_feeds";

function generateId(): string {
  return `bf_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
}

function saveToStorage(entries: BabyFeedEntry[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // storage full / unavailable — silently drop, caller won't notice
  }
}

function isSameLocalDay(iso: string, target: Date): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === target.getFullYear() &&
    d.getMonth() === target.getMonth() &&
    d.getDate() === target.getDate()
  );
}

export const useBabyFeedStore = create<BabyFeedState>((set, get) => ({
  entries: [],
  loaded: false,

  loadFromStorage: () => {
    if (typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as BabyFeedEntry[];
        set({ entries: parsed, loaded: true });
        return;
      }
    } catch {
      // corrupted storage
    }
    set({ entries: [], loaded: true });
  },

  addEntry: (data) => {
    const id = generateId();
    const entry: BabyFeedEntry = {
      ...data,
      id,
      createdAt: new Date().toISOString(),
    };
    const updated = [entry, ...get().entries];
    set({ entries: updated });
    saveToStorage(updated);
    return id;
  },

  updateEntry: (id, updates) => {
    const updated = get().entries.map((e) =>
      e.id === id ? { ...e, ...updates } : e,
    );
    set({ entries: updated });
    saveToStorage(updated);
  },

  removeEntry: (id) => {
    const updated = get().entries.filter((e) => e.id !== id);
    set({ entries: updated });
    saveToStorage(updated);
  },

  getEntriesForProfile: (profileId) => {
    return get()
      .entries.filter((e) => e.profileId === profileId)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  },

  getEntriesForDate: (profileId, date) => {
    return get()
      .entries.filter(
        (e) => e.profileId === profileId && isSameLocalDay(e.timestamp, date),
      )
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  },
}));
