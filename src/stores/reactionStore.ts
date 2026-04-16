"use client";

import { create } from "zustand";
import type { AllergenKey } from "@/lib/pediatric/allergenRegistry";

/**
 * Allergic-reaction log.
 *
 * Caregivers record suspected or confirmed reactions so we can surface
 * them next to the food in future scans. Severity drives a pediatrician-
 * referral card in the UI; the store just holds the raw observation.
 */

export type ReactionSeverity = "mild" | "moderate" | "severe";

export type ReactionSymptom =
  | "rash"
  | "hives"
  | "swelling"
  | "vomiting"
  | "diarrhea"
  | "cough"
  | "wheezing"
  | "runny_nose"
  | "fussy"
  | "other";

export interface ReactionRecord {
  id: string;
  childId: string;
  /** "YYYY-MM-DD" of the reaction. */
  date: string;
  /** "HH:MM" of the reaction. */
  time: string;
  /** Free-text food name — caregivers know the specifics better than any picker. */
  food: string;
  /** Optional top-9/regional allergen tag for quick intersection with Gemini output. */
  allergen: AllergenKey | null;
  symptoms: ReactionSymptom[];
  severity: ReactionSeverity;
  notes: string;
  createdAt: string;
}

interface ReactionState {
  reactions: ReactionRecord[];
  loaded: boolean;
  loadFromStorage: () => void;
  addReaction: (r: Omit<ReactionRecord, "id" | "createdAt">) => string;
  removeReaction: (id: string) => void;
  getReactionsForChild: (childId: string) => ReactionRecord[];
}

const STORAGE_KEY = "nibble_reactions";

function load(): ReactionRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored) as ReactionRecord[];
  } catch {
    /* ignore */
  }
  return [];
}

function persist(records: ReactionRecord[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    /* ignore */
  }
}

export const useReactionStore = create<ReactionState>((set, get) => ({
  reactions: [],
  loaded: false,

  loadFromStorage: () => {
    set({ reactions: load(), loaded: true });
  },

  addReaction: (r) => {
    const id = `r_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const next: ReactionRecord = {
      ...r,
      id,
      createdAt: new Date().toISOString(),
    };
    const updated = [...get().reactions, next];
    set({ reactions: updated });
    persist(updated);
    return id;
  },

  removeReaction: (id) => {
    const updated = get().reactions.filter((r) => r.id !== id);
    set({ reactions: updated });
    persist(updated);
  },

  getReactionsForChild: (childId) => {
    return get()
      .reactions.filter((r) => r.childId === childId)
      .sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`));
  },
}));
