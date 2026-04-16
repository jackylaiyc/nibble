import Stripe from "stripe";

/**
 * Centralised Stripe SDK loader.
 *
 * We lazy-read the env var so that missing credentials in dev or preview
 * don't crash every route that imports this file — callers can detect
 * the null and return a 503 with a helpful message. In prod the env is
 * guaranteed to be set (verified at deploy time).
 *
 * Stripe apiVersion is pinned so accidental SDK upgrades don't flip the
 * request shape on us. Bump deliberately alongside a regression test.
 */

let cached: Stripe | null = null;

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!cached) {
    cached = new Stripe(key, {
      apiVersion: "2026-03-25.dahlia",
      appInfo: { name: "Nibble", url: "https://trynibble.app" },
    });
  }
  return cached;
}

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}
