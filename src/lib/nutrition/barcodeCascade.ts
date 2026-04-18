/**
 * Barcode lookup cascade — chains free sources until one returns enough
 * nutrient data to save a meal. Server-only because Rakuten isn't CORS-
 * enabled and we want to hide API keys.
 *
 * Cascade (all free):
 *   1. OpenFoodFacts by barcode             — direct nutrition
 *   2. UPCitemDB by barcode                 — name only, then:
 *   3. Rakuten Ichiba by JAN                — name only (JP-heavy), then:
 *   4. OpenFoodFacts text-search by recovered name — nutrition fallback
 *
 * Returns:
 *   - { food, source, ... }  on hit (food has enough nutrients to be useful)
 *   - null                    when every tier missed — caller should offer the
 *                             Gemini label-OCR fallback.
 */

import { lookupByBarcode, lookupByName, type OffHit } from "./openFoodFacts";
import { lookupUpcItemDb, type UpcHit } from "./upcitemdb";
import { lookupRakuten, type RakutenHit } from "./rakuten";

export type CascadeSource =
  | "off-barcode"
  | "off-name-via-upcitemdb"
  | "off-name-via-rakuten";

export interface CascadeHit extends OffHit {
  /** Which tier of the cascade produced the hit — useful for logging. */
  source: CascadeSource;
  /** The barcode that was looked up. */
  barcode: string;
  /** Resolved name from whichever metadata-only source bridged to OFF, if any. */
  resolvedName?: string;
}

export async function runBarcodeCascade(
  barcode: string,
): Promise<CascadeHit | null> {
  // Tier 1 — direct OFF. Fast path.
  const direct = await safe(() => lookupByBarcode(barcode));
  if (direct) {
    return { ...direct, source: "off-barcode", barcode };
  }

  // Tier 2 — UPCitemDB (global metadata) + Tier 3 — Rakuten (JP metadata).
  // Run these in parallel; they're cheap and don't depend on each other.
  const [upcHit, rakutenHit] = await Promise.all([
    safe(() => lookupUpcItemDb(barcode)),
    safe(() => lookupRakuten(barcode)),
  ]);

  // Tier 4 — re-query OFF by name from whichever metadata source resolved.
  // Prefer UPCitemDB's name (shorter/cleaner) for non-JP; fall back to Rakuten.
  const candidates: Array<{ hit: UpcHit | RakutenHit; via: CascadeSource }> = [];
  if (upcHit) candidates.push({ hit: upcHit, via: "off-name-via-upcitemdb" });
  if (rakutenHit)
    candidates.push({ hit: rakutenHit, via: "off-name-via-rakuten" });

  for (const c of candidates) {
    const query = buildQuery(c.hit);
    const byName = await safe(() => lookupByName(query));
    if (byName) {
      return {
        ...byName,
        source: c.via,
        barcode,
        resolvedName: c.hit.name,
      };
    }
  }

  return null;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function buildQuery(hit: UpcHit | RakutenHit): string {
  const parts: string[] = [];
  if (hit.brand) parts.push(hit.brand);
  parts.push(hit.name);
  return parts.join(" ");
}

/**
 * Run a source, swallow any throw. A misbehaving source (network error, rate
 * limit, malformed response) must never abort the whole cascade — the next
 * tier might still succeed.
 */
async function safe<T>(fn: () => Promise<T | null>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    console.warn("[barcode-cascade] source failed:", err);
    return null;
  }
}
