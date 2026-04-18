"use client";

import { create } from "zustand";

/**
 * In-memory handoff for a picked photo file between routes.
 *
 * Used when the user opens the PhotoActionSheet from somewhere other than
 * the scan page (the dashboard hero CTA, the bottom nav Scan tab) — we stash
 * the picked File here, navigate to /app/scan, and the scan page consumes it
 * on mount and clears it.
 *
 * Intentionally NOT persisted to localStorage:
 *   - File objects aren't serializable
 *   - Stale data on refresh would re-trigger an unwanted scan
 */

interface ScanIntakeState {
  pendingFile: File | null;
  setPendingFile: (file: File | null) => void;
}

export const useScanIntakeStore = create<ScanIntakeState>((set) => ({
  pendingFile: null,
  setPendingFile: (file) => set({ pendingFile: file }),
}));
