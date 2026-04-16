/**
 * Pricing & tier definitions — single source of truth.
 *
 * Touch this file to change limits, prices, or feature gates. The pricing
 * page, paywall modal, usage meters, Stripe checkout route, and webhook
 * handler all read from here so we never drift.
 *
 * Prices are anchored in TWD (primary market: TW/HK/SG). We surface an
 * HKD + USD equivalent on the pricing page purely for social proof /
 * familiarity; Stripe still charges TWD.
 */

export type PlanId = "free" | "premium" | "family";

export type BillingCycle = "monthly" | "annual";

export interface PlanLimits {
  /** Number of child profiles the plan allows. Infinity = unlimited. */
  children: number;
  /** Plate-scans allowed per UTC day. Infinity = unlimited. */
  scansPerDay: number;
  /** AI chat messages allowed per UTC day. Infinity = unlimited. */
  chatMessagesPerDay: number;
  /** Growth curve detail — basic shows raw values only, full shows WHO percentiles. */
  growthCurves: "basic" | "full";
  /** Whether share cards carry a "Free" watermark in addition to the brand watermark. */
  watermarkedShareCards: boolean;
  /** Number of caregivers who can share the account (Family plan). */
  caregivers: number;
  /** Download PDF reports for pediatrician visits. */
  pdfReports: boolean;
}

export interface PlanPrice {
  monthly: { twd: number; hkd: number; usd: number };
  annual: { twd: number; hkd: number; usd: number };
}

export interface PlanDefinition {
  id: PlanId;
  /** Stripe price IDs — populated from env at runtime, never hard-coded in repo. */
  stripePriceEnv: {
    monthly: string | null;
    annual: string | null;
  };
  price: PlanPrice | null; // null for free tier
  limits: PlanLimits;
}

/**
 * Free tier is intentionally usable — the goal is habit formation, not
 * artificial scarcity. 3 scans/day gets a family through breakfast +
 * lunch + dinner for one child; 5 chat messages is enough to ask two
 * real questions with follow-ups. Past that we nudge toward premium.
 */
export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: "free",
    stripePriceEnv: { monthly: null, annual: null },
    price: null,
    limits: {
      children: 1,
      scansPerDay: 3,
      chatMessagesPerDay: 5,
      growthCurves: "basic",
      watermarkedShareCards: true,
      caregivers: 1,
      pdfReports: false,
    },
  },
  premium: {
    id: "premium",
    stripePriceEnv: {
      monthly: "STRIPE_PRICE_PREMIUM_MONTHLY",
      annual: "STRIPE_PRICE_PREMIUM_ANNUAL",
    },
    price: {
      monthly: { twd: 299, hkd: 78, usd: 10 },
      annual: { twd: 2388, hkd: 628, usd: 79 },
    },
    limits: {
      children: Infinity,
      scansPerDay: Infinity,
      chatMessagesPerDay: Infinity,
      growthCurves: "full",
      watermarkedShareCards: false,
      caregivers: 1,
      pdfReports: true,
    },
  },
  family: {
    id: "family",
    stripePriceEnv: {
      monthly: "STRIPE_PRICE_FAMILY_MONTHLY",
      annual: "STRIPE_PRICE_FAMILY_ANNUAL",
    },
    price: {
      monthly: { twd: 499, hkd: 129, usd: 16 },
      annual: { twd: 3988, hkd: 1049, usd: 129 },
    },
    limits: {
      children: Infinity,
      scansPerDay: Infinity,
      chatMessagesPerDay: Infinity,
      growthCurves: "full",
      watermarkedShareCards: false,
      caregivers: 4,
      pdfReports: true,
    },
  },
};

/**
 * Founding-member lifetime deal — capped at 200 seats. Surfaced as a
 * pinned banner above the regular plan cards during launch week and
 * retired automatically when the counter flips in the admin panel.
 */
export const FOUNDING_MEMBER = {
  priceTwd: 2888,
  priceHkd: 749,
  priceUsd: 95,
  seatsCap: 200,
  stripePriceEnv: "STRIPE_PRICE_FOUNDING_MEMBER",
};

export const TRIAL_DAYS = 7;

/** Paid tiers that grant unlimited usage — handy for feature gates. */
export const PAID_PLAN_IDS = ["premium", "family"] as const;

export function isPaidPlan(id: PlanId): boolean {
  return (PAID_PLAN_IDS as readonly string[]).includes(id);
}

export function limitsFor(id: PlanId): PlanLimits {
  return PLANS[id].limits;
}
