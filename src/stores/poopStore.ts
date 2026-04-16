"use client";

import { create } from "zustand";
import type { BristolType, PoopColor } from "@/lib/pediatric/bristolScale";

/**
 * Diaper/potty log.
 *
 * We store the caregiver's observations verbatim — never their interpretation.
 * Red-flag logic (black/red/white stool or persistent Type 7) is derived
 * lazily in the UI via shouldReferToPediatrician(), not cached here, so we
 * can tune referral rules without migrating the data.
 */

export interface PoopRecord {
  id: string;
  childId: string;
  /** "YYYY-MM-DD" of the event (not of entry). */
  date: string;
  /** "HH:MM" of the event. */
  time: string;
  bristolType: BristolType;
  color: PoopColor;
  /** Any allergen reactions or notes the caregiver wants to attach. */
  notes: string;
  createdAt: string;
}

interface PoopState {
  poops: PoopRecord[];
  loaded: boolean;
  loadFromStorage: () => void;
  addPoop: (record: Omit<PoopRecord, "id" | "createdAt">) => string;
  removePoop: (id: string) => void;
  getPoopsForChild: (childId: string) => PoopRecord[];
  getPoopsForDate: (childId: string, date: Date) => PoopRecord[];
}

const STORAGE_KEY = "nibble_poops";

function loadPoops(): PoopRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored) as PoopRecord[];
  } catch {
    /* ignore malformed storage */
  }
  return [];
}

function savePoops(poops: PoopRecord[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(poops));
  } catch {
    /* storage full — best-effort; we'll reconcile against Supabase later */
  }
}

function formatDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const usePoopStore = create<PoopState>((set, get) => ({
  poops: [],
  loaded: false,

  loadFromStorage: () => {
    set({ poops: loadPoops(), loaded: true });
  },

  addPoop: (record) => {
    const id = `p_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const poop: PoopRecord = {
      ...record,
      id,
      createdAt: new Date().toISOString(),
    };
    const updated = [...get().poops, poop];
    set({ poops: updated });
    savePoops(updated);
    return id;
  },

  removePoop: (id) => {
    const updated = get().poops.filter((p) => p.id !== id);
    set({ poops: updated });
    savePoops(updated);
  },

  getPoopsForChild: (childId) => {
    return get()
      .poops.filter((p) => p.childId === childId)
      .sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`));
  },

  getPoopsForDate: (childId, date) => {
    const key = formatDateKey(date);
    return get()
      .poops.filter((p) => p.childId === childId && p.date === key)
      .sort((a, b) => a.time.localeCompare(b.time));
  },
}));
