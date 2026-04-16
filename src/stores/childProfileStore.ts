"use client";

import { create } from "zustand";
import { ageInfoFromDob, type AgeBucket } from "@/lib/pediatric/ageBucket";
import type { AllergenKey } from "@/lib/pediatric/allergenRegistry";

export type FeedingStyle = "blw" | "puree" | "mixed";

export interface Child {
  id: string;
  name: string;
  /** ISO date string "YYYY-MM-DD" */
  dob: string;
  sex: "female" | "male" | "unspecified";
  avatar: string;            // emoji or image URL
  feedingStyle: FeedingStyle;
  allergens: AllergenKey[];  // known allergens (pediatrician-confirmed or suspected)
  notes: string;
  createdAt: string;
}

interface ChildState {
  children: Child[];
  activeChildId: string | null;
  loaded: boolean;

  getActiveChild: () => Child | null;
  getActiveBucket: () => AgeBucket | null;
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
    if (!child || !child.dob) return null;
    return ageInfoFromDob(child.dob).bucket;
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
