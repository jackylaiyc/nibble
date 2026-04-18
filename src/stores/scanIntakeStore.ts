"use client";

import { create } from "zustand";
import type { FoodItem } from "@/stores/mealStore";

/**
 * In-memory handoff between routes when the user starts a meal-log flow
 * from somewhere other than the scan page (dashboard CTA, bottom nav).
 *
 * Two payloads:
 *   - pendingFile: a picked photo → scan page runs Gemini on mount.
 *   - pendingFoods: pre-identified food items (from the barcode scanner or
 *     the text-search flow) → scan page skips Gemini and shows the review
 *     state directly.
 *
 * Intentionally NOT persisted to localStorage:
 *   - File / FoodItem references in memory are fine for same-tab navigation
 *   - Stale data on refresh would re-trigger an unwanted scan
 */

interface ScanIntakeState {
  pendingFile: File | null;
  pendingFoods: FoodItem[] | null;
  setPendingFile: (file: File | null) => void;
  setPendingFoods: (foods: FoodItem[] | null) => void;
  clear: () => void;
}

export const useScanIntakeStore = create<ScanIntakeState>((set) => ({
  pendingFile: null,
  pendingFoods: null,
  setPendingFile: (file) => set({ pendingFile: file, pendingFoods: null }),
  setPendingFoods: (foods) => set({ pendingFoods: foods, pendingFile: null }),
  clear: () => set({ pendingFile: null, pendingFoods: null }),
}));
