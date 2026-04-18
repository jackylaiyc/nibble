import type { FoodItem } from "@/stores/mealStore";

/**
 * Client-side barcode lookup. Thin wrapper over POST /api/barcode, which
 * runs the full free cascade server-side (OpenFoodFacts → UPCitemDB →
 * Rakuten → OFF text-search). See src/lib/nutrition/barcodeCascade.ts for
 * the source-of-truth logic.
 *
 * We keep this wrapper so the scanner page has a single typed import and
 * we can swap the server implementation (add paid sources, cache, etc.)
 * without touching the UI.
 */

export interface BarcodeLookupResult {
  food: FoodItem;
  barcode: string;
  brand?: string;
  servingText?: string;
  /** Which cascade tier produced the hit. UI uses this as a debug hint. */
  source?: string;
  /** If a metadata-only source bridged to OFF, the recovered product name. */
  resolvedName?: string;
}

interface ApiSuccess {
  found: true;
  food: FoodItem;
  barcode: string;
  brand?: string;
  servingText?: string;
  source?: string;
  resolvedName?: string;
}
interface ApiMiss {
  found: false;
}
type ApiResponse = ApiSuccess | ApiMiss;

/**
 * Look up a barcode. Returns null if every cascade tier missed (caller
 * should surface the "snap nutrition label" fallback UI). Throws only on
 * network-level failures.
 */
export async function lookupBarcode(barcode: string): Promise<BarcodeLookupResult | null> {
  const res = await fetch("/api/barcode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ barcode }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as ApiResponse;
  if (!data.found) return null;
  return {
    food: data.food,
    barcode: data.barcode,
    brand: data.brand,
    servingText: data.servingText,
    source: data.source,
    resolvedName: data.resolvedName,
  };
}
