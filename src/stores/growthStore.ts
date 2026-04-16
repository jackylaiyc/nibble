"use client";

import { create } from "zustand";

/**
 * Growth measurements (weight / height / head circumference).
 *
 * We store exactly what the caregiver entered, never derived values.
 * Percentiles are computed on demand from the WHO LMS tables so
 * updates to the tables propagate without needing a migration.
 */

export interface GrowthRecord {
  id: string;
  childId: string;
  /** "YYYY-MM-DD" of the measurement. */
  date: string;
  /** kg — undefined if not measured. */
  weightKg?: number;
  /** cm — undefined if not measured. */
  heightCm?: number;
  /** cm — undefined if not measured. */
  headCm?: number;
  notes: string;
  createdAt: string;
}

interface GrowthState {
  measurements: GrowthRecord[];
  loaded: boolean;
  loadFromStorage: () => void;
  addMeasurement: (r: Omit<GrowthRecord, "id" | "createdAt">) => string;
  removeMeasurement: (id: string) => void;
  getMeasurementsForChild: (childId: string) => GrowthRecord[];
}

const STORAGE_KEY = "nibble_growth";

function load(): GrowthRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored) as GrowthRecord[];
  } catch {
    /* ignore */
  }
  return [];
}

function persist(records: GrowthRecord[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    /* ignore */
  }
}

export const useGrowthStore = create<GrowthState>((set, get) => ({
  measurements: [],
  loaded: false,

  loadFromStorage: () => {
    set({ measurements: load(), loaded: true });
  },

  addMeasurement: (r) => {
    const id = `g_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const next: GrowthRecord = {
      ...r,
      id,
      createdAt: new Date().toISOString(),
    };
    const updated = [...get().measurements, next];
    set({ measurements: updated });
    persist(updated);
    return id;
  },

  removeMeasurement: (id) => {
    const updated = get().measurements.filter((m) => m.id !== id);
    set({ measurements: updated });
    persist(updated);
  },

  getMeasurementsForChild: (childId) => {
    return get()
      .measurements.filter((m) => m.childId === childId)
      .sort((a, b) => a.date.localeCompare(b.date));
  },
}));
