"use client";

import { create } from "zustand";
import type { MilestoneKey } from "@/lib/pediatric/milestonePresets";

/**
 * Milestone achievements — one row per (child, milestone-key).
 * A child can only unlock a given milestone once; toggling off removes it.
 * The date is user-editable so caregivers can backfill after realizing
 * they forgot to log "first tooth" three weeks ago.
 */

export interface MilestoneRecord {
  id: string;
  childId: string;
  key: MilestoneKey;
  /** "YYYY-MM-DD" — when the milestone was reached. */
  achievedAt: string;
  notes: string;
  /** Optional photo data URL if the caregiver snapped the moment. */
  photoDataUrl?: string;
  createdAt: string;
}

interface MilestoneState {
  milestones: MilestoneRecord[];
  loaded: boolean;
  loadFromStorage: () => void;
  upsertMilestone: (
    record: Omit<MilestoneRecord, "id" | "createdAt">,
  ) => string;
  removeMilestone: (childId: string, key: MilestoneKey) => void;
  getMilestoneForChild: (
    childId: string,
    key: MilestoneKey,
  ) => MilestoneRecord | undefined;
  getMilestonesForChild: (childId: string) => MilestoneRecord[];
}

const STORAGE_KEY = "nibble_milestones";

function load(): MilestoneRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored) as MilestoneRecord[];
  } catch {
    /* ignore */
  }
  return [];
}

function persist(records: MilestoneRecord[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    /* ignore */
  }
}

export const useMilestoneStore = create<MilestoneState>((set, get) => ({
  milestones: [],
  loaded: false,

  loadFromStorage: () => {
    set({ milestones: load(), loaded: true });
  },

  // Upsert semantics: if the (childId, key) pair already exists we overwrite
  // in place so the achievement date can be edited without UI-level fetches.
  upsertMilestone: (record) => {
    const existing = get().milestones.find(
      (m) => m.childId === record.childId && m.key === record.key,
    );
    if (existing) {
      const updated = get().milestones.map((m) =>
        m.id === existing.id ? { ...m, ...record } : m,
      );
      set({ milestones: updated });
      persist(updated);
      return existing.id;
    }
    const id = `ms_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const next: MilestoneRecord = {
      ...record,
      id,
      createdAt: new Date().toISOString(),
    };
    const updated = [...get().milestones, next];
    set({ milestones: updated });
    persist(updated);
    return id;
  },

  removeMilestone: (childId, key) => {
    const updated = get().milestones.filter(
      (m) => !(m.childId === childId && m.key === key),
    );
    set({ milestones: updated });
    persist(updated);
  },

  getMilestoneForChild: (childId, key) => {
    return get().milestones.find(
      (m) => m.childId === childId && m.key === key,
    );
  },

  getMilestonesForChild: (childId) => {
    return get()
      .milestones.filter((m) => m.childId === childId)
      .sort((a, b) => b.achievedAt.localeCompare(a.achievedAt));
  },
}));
