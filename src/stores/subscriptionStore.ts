"use client";

import { create } from "zustand";
import { type PlanId, isPaidPlan } from "@/lib/pricing/plans";

/**
 * Client-side view of the user's paid tier.
 *
 * Source of truth is Stripe (and eventually the Supabase `subscriptions`
 * table that our webhook writes into). This store is a local cache so
 * UI can gate features immediately without a round-trip on every render.
 *
 * Hydration paths:
 *   1. On load: read from localStorage (last-known tier).
 *   2. After checkout success redirect: the `/app/paywall/success?session_id=…`
 *      page calls `syncFromSession()` which hits our API and updates this
 *      store + localStorage.
 *   3. On demand: `syncFromSubscription()` hits Stripe via `/api/stripe/status`.
 *
 * Until Supabase is wired, the sync API stubs return the cached value;
 * the Stripe webhook route logs the event and we refresh on next page load.
 */

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "none";

export interface SubscriptionSnapshot {
  plan: PlanId;
  status: SubscriptionStatus;
  /** ISO date string or null. Present only for paid tiers. */
  currentPeriodEnd: string | null;
  /** Stripe customer id — set after first checkout. */
  stripeCustomerId: string | null;
  /** Stripe subscription id — set after first checkout. */
  stripeSubscriptionId: string | null;
  /** Whether the user is in the post-signup 7-day trial. */
  inTrial: boolean;
  /** When this snapshot was last refreshed — for staleness detection. */
  syncedAt: string;
}

interface SubscriptionState extends SubscriptionSnapshot {
  loaded: boolean;
  loadFromStorage: () => void;
  /** Replace the local snapshot and persist — called after Stripe sync. */
  setSnapshot: (snapshot: Partial<SubscriptionSnapshot>) => void;
  /** True when the user has a paid active/trialing tier. */
  isPaid: () => boolean;
  /** Current effective plan (falls back to free). */
  currentPlan: () => PlanId;
}

const STORAGE_KEY = "nibble_subscription";

const DEFAULT_SNAPSHOT: SubscriptionSnapshot = {
  plan: "free",
  status: "none",
  currentPeriodEnd: null,
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  inTrial: false,
  syncedAt: new Date(0).toISOString(),
};

function load(): SubscriptionSnapshot {
  if (typeof window === "undefined") return DEFAULT_SNAPSHOT;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_SNAPSHOT, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return DEFAULT_SNAPSHOT;
}

function save(snapshot: SubscriptionSnapshot) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    /* ignore */
  }
}

export const useSubscriptionStore = create<SubscriptionState>((set, get) => ({
  ...DEFAULT_SNAPSHOT,
  loaded: false,

  loadFromStorage: () => {
    set({ ...load(), loaded: true });
  },

  setSnapshot: (partial) => {
    const merged = { ...get(), ...partial, syncedAt: new Date().toISOString() };
    const snapshot: SubscriptionSnapshot = {
      plan: merged.plan,
      status: merged.status,
      currentPeriodEnd: merged.currentPeriodEnd,
      stripeCustomerId: merged.stripeCustomerId,
      stripeSubscriptionId: merged.stripeSubscriptionId,
      inTrial: merged.inTrial,
      syncedAt: merged.syncedAt,
    };
    save(snapshot);
    set(snapshot);
  },

  isPaid: () => {
    const { plan, status } = get();
    if (!isPaidPlan(plan)) return false;
    return status === "active" || status === "trialing";
  },

  currentPlan: () => {
    const { plan, status } = get();
    if (status === "canceled" || status === "past_due") return "free";
    return plan;
  },
}));
