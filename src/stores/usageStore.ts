"use client";

import { create } from "zustand";

/**
 * Daily usage counters for free-tier caps.
 *
 * We key counters by local YYYY-MM-DD so "day" matches the caregiver's
 * experience (a midnight UTC reset would feel random to a parent in
 * Taipei). Counters reset when the date key changes — we never prune
 * history aggressively, just overwrite.
 *
 * Paid users still increment these counters; the paywall just never
 * consults them for premium/family tiers. That gives us analytics later
 * ("avg scans/day per paid user") without a migration.
 */

export type UsageEvent = "scan" | "chat";

interface DailyCounters {
  /** Keyed by local YYYY-MM-DD. */
  scan: Record<string, number>;
  chat: Record<string, number>;
}

interface UsageState extends DailyCounters {
  loaded: boolean;
  loadFromStorage: () => void;
  /** Increment by 1 and persist. Returns the new total for today. */
  record: (event: UsageEvent) => number;
  /** Read today's counter without incrementing. */
  todayCount: (event: UsageEvent) => number;
}

const STORAGE_KEY = "nibble_usage";

function load(): DailyCounters {
  if (typeof window === "undefined") return { scan: {}, chat: {} };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        scan: parsed.scan ?? {},
        chat: parsed.chat ?? {},
      };
    }
  } catch {
    /* ignore */
  }
  return { scan: {}, chat: {} };
}

function save(counters: DailyCounters) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(counters));
  } catch {
    /* ignore */
  }
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const useUsageStore = create<UsageState>((set, get) => ({
  scan: {},
  chat: {},
  loaded: false,

  loadFromStorage: () => {
    set({ ...load(), loaded: true });
  },

  record: (event) => {
    const key = todayKey();
    const current = get()[event];
    const next = { ...current, [key]: (current[key] ?? 0) + 1 };
    const snapshot: DailyCounters = {
      scan: event === "scan" ? next : get().scan,
      chat: event === "chat" ? next : get().chat,
    };
    save(snapshot);
    set(snapshot);
    return next[key];
  },

  todayCount: (event) => {
    const key = todayKey();
    return get()[event][key] ?? 0;
  },
}));
