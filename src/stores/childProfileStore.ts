"use client";

import { create } from "zustand";
import {
  ageInfoFromDob,
  getLifeStage,
  type AgeBucket,
  type LifeStage,
} from "@/lib/pediatric/ageBucket";
import type { AllergenKey } from "@/lib/pediatric/allergenRegistry";

export type FeedingStyle = "blw" | "puree" | "mixed";

/** Discriminator for which kind of nutrition profile this is. */
export type ProfileKind = "infant" | "pregnant" | "breastfeeding";

/**
 * A nutrition profile. Originally only "Child" (infants/toddlers) but now
 * generalized to include pregnant women and breastfeeding mothers via the
 * `kind` discriminator. Type name kept as `Child` for back-compat with the
 * 19 call sites that import it; rename can come later as a mechanical pass.
 *
 * Records created before the multi-kind expansion are missing `kind` and
 * are treated as "infant" by `getLifeStage()` — graceful fallback.
 */
export interface Child {
  id: string;
  name: string;
  avatar: string;            // emoji or image URL
  allergens: AllergenKey[];  // known allergens (or for adults: ones to avoid)
  notes: string;
  createdAt: string;

  /** Discriminator. Defaults to "infant" when missing (back-compat). */
  kind?: ProfileKind;

  // ─── Infant fields ────────────────────────────────────────────────────
  /** ISO date string "YYYY-MM-DD".
   *  - Infant: baby's date of birth (used for age bucket).
   *  - Pregnant / breastfeeding: unused — we store today's ISO so the shape
   *    stays stable; downstream code must NOT call `ageInfoFromDob` on it
   *    unless `kind === "infant"` or `kind` is undefined. */
  dob: string;
  sex?: "female" | "male" | "unspecified";
  feedingStyle?: FeedingStyle;

  // ─── Pregnancy fields ─────────────────────────────────────────────────
  /** ISO date string "YYYY-MM-DD" — estimated due date. Used to compute
   *  trimester via standard 40-week obstetric convention. */
  pregnancyDueDate?: string;

  // ─── Breastfeeding fields ─────────────────────────────────────────────
  /** ISO date string "YYYY-MM-DD" — when nursing started (typically baby's
   *  birth). Used to compute weeks postpartum. */
  breastfeedingStartDate?: string;
}

interface ChildState {
  children: Child[];
  activeChildId: string | null;
  loaded: boolean;

  getActiveChild: () => Child | null;
  /** Active profile's RDA-table key. Returns null if no profile is active. */
  getActiveBucket: () => AgeBucket | null;
  /** Active profile's full life-stage object — preferred over getActiveBucket
   *  because it carries kind + derived display data (trimester, weeksPregnant,
   *  weeksPostpartum). Returns null if no profile is active. */
  getActiveLifeStage: () => LifeStage | null;
  setActiveChild: (id: string) => void;
  addChild: (child: Omit<Child, "id" | "createdAt">) => string;
  updateChild: (id: string, updates: Partial<Omit<Child, "id" | "createdAt">>) => void;
  removeChild: (id: string) => void;
  loadFromStorage: () => void;
}

const STORAGE_KEY = "nibble_children";
const ACTIVE_KEY = "nibble_active_child";

function generateId(): string {
  return `c_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

function saveToStorage(children: Child[], activeId: string | null) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(children));
    if (activeId) localStorage.setItem(ACTIVE_KEY, activeId);
  } catch {
    // storage full or unavailable
  }
}

export const useChildProfileStore = create<ChildState>((set, get) => ({
  children: [],
  activeChildId: null,
  loaded: false,

  getActiveChild: () => {
    const state = get();
    return state.children.find((c) => c.id === state.activeChildId) || state.children[0] || null;
  },

  getActiveBucket: () => {
    const child = get().getActiveChild();
    if (!child) return null;
    // For infant profiles (default when kind missing), use the legacy DOB
    // helper so behaviour is identical to before. For other kinds, derive
    // through the unified life-stage resolver.
    if (!child.kind || child.kind === "infant") {
      if (!child.dob) return null;
      return ageInfoFromDob(child.dob).bucket;
    }
    return getLifeStage(child).key;
  },

  getActiveLifeStage: () => {
    const child = get().getActiveChild();
    if (!child) return null;
    // Defensive: missing-DOB infant records would crash getLifeStage; bail
    // to null so callers can show a "complete your profile" CTA.
    if ((child.kind ?? "infant") === "infant" && !child.dob) return null;
    return getLifeStage(child);
  },

  setActiveChild: (id) => {
    set({ activeChildId: id });
    saveToStorage(get().children, id);
  },

  addChild: (childData) => {
    const id = generateId();
    const child: Child = {
      ...childData,
      id,
      createdAt: new Date().toISOString(),
    };
    const updated = [...get().children, child];
    const newActive = get().activeChildId ?? id;
    set({ children: updated, activeChildId: newActive });
    saveToStorage(updated, newActive);
    return id;
  },

  updateChild: (id, updates) => {
    const updated = get().children.map((c) => (c.id === id ? { ...c, ...updates } : c));
    set({ children: updated });
    saveToStorage(updated, get().activeChildId);
  },

  removeChild: (id) => {
    const state = get();
    const updated = state.children.filter((c) => c.id !== id);
    const newActiveId =
      state.activeChildId === id ? (updated[0]?.id ?? null) : state.activeChildId;
    set({ children: updated, activeChildId: newActiveId });
    saveToStorage(updated, newActiveId);
  },

  loadFromStorage: () => {
    if (typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const activeId = localStorage.getItem(ACTIVE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Child[];
        set({
          children: parsed,
          activeChildId:
            activeId && parsed.some((c) => c.id === activeId)
              ? activeId
              : parsed[0]?.id ?? null,
          loaded: true,
        });
        return;
      }
    } catch {
      // corrupted storage
    }
    set({ children: [], activeChildId: null, loaded: true });
  },
}));
