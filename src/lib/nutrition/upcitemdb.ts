/**
 * UPCitemdb lookup — free tier, ~400 req/day per IP, no auth.
 *
 * Endpoint: https://api.upcitemdb.com/prod/trial/lookup?upc={barcode}
 *
 * Returns product metadata only (title, brand, size, category) — NO nutrition.
 * Used as a cascade step: if OpenFoodFacts doesn't know the barcode, ask
 * UPCitemdb what the product is called, then re-query OFF by that name.
 *
 * Better HK/TW/SG coverage than OFF for common retail barcodes.
 */

const ENDPOINT = "https://api.upcitemdb.com/prod/trial/lookup";

interface UpcItem {
  title?: string;
  brand?: string;
  description?: string;
  category?: string;
  size?: string;
}

interface UpcResponse {
  code: string;        // e.g. "OK", "INVALID_REQ", "EXCEED_LIMIT"
  total?: number;
  items?: UpcItem[];
}

export interface UpcHit {
  name: string;
  brand?: string;
  /** Free-form description (helps the OFF re-query with richer context). */
  description?: string;
}

export async function lookupUpcItemDb(barcode: string): Promise<UpcHit | null> {
  const url = `${ENDPOINT}?upc=${encodeURIComponent(barcode)}`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const data = (await res.json()) as UpcResponse;
    if (data.code !== "OK") return null;
    const first = (data.items ?? [])[0];
    if (!first || !first.title) return null;
    return {
      name: first.title,
      brand: first.brand,
      description: first.description,
    };
  } catch {
    return null;
  }
}
