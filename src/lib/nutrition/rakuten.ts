/**
 * Rakuten Ichiba Item Search — free with a Rakuten Developer account.
 *
 * Endpoint: https://app.rakuten.co.jp/services/api/IchibaItem/Search/20220601
 * Docs:     https://webservice.rakuten.co.jp/documentation/ichiba-item-search
 *
 * Returns product metadata only (itemName, itemCaption, shopName, etc.) —
 * NO nutrition. We use it as a cascade step for Japanese JAN-13 barcodes
 * that other databases miss: Rakuten tells us the product name, then we
 * re-query OpenFoodFacts by that name to get nutrients.
 *
 * Rate limit: 1 request / second per app. Free tier is generous.
 * Skipped gracefully if RAKUTEN_APPLICATION_ID env var is not set.
 */

const ENDPOINT = "https://app.rakuten.co.jp/services/api/IchibaItem/Search/20220601";

interface RakutenItem {
  itemName?: string;
  itemCaption?: string;
  shopName?: string;
  genreId?: string;
  catchcopy?: string;
  reviewCount?: number;
}

interface RakutenItemWrapper {
  Item?: RakutenItem;
}

interface RakutenSearchResponse {
  count?: number;
  Items?: RakutenItemWrapper[];
  error?: string;
  error_description?: string;
}

export interface RakutenHit {
  name: string;
  brand?: string;
  /** Product description — helps the OFF re-query disambiguate. */
  description?: string;
}

export async function lookupRakuten(barcode: string): Promise<RakutenHit | null> {
  const appId = process.env.RAKUTEN_APPLICATION_ID;
  if (!appId) return null; // Opt-in: skip silently if not configured.

  const url =
    `${ENDPOINT}?applicationId=${encodeURIComponent(appId)}` +
    `&keyword=${encodeURIComponent(barcode)}` +
    `&format=json&hits=1`;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      // Rakuten can be slow occasionally — cap the wait so the whole cascade
      // doesn't hang the user.
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as RakutenSearchResponse;
    if (data.error) return null;
    const wrapper = (data.Items ?? [])[0];
    const item = wrapper?.Item;
    if (!item || !item.itemName) return null;
    // Rakuten item names are verbose ("【送料無料】和光堂 手作り応援 だし詰合せ 5種")
    // The cleaned name works better as an OFF search query.
    return {
      name: cleanItemName(item.itemName),
      brand: item.shopName,
      description: item.itemCaption || item.catchcopy,
    };
  } catch {
    return null;
  }
}

function cleanItemName(raw: string): string {
  // Strip common Rakuten listing decorations: shipping-free labels, promo tags,
  // bracketed marketing copy. Keep the actual product name.
  return raw
    .replace(/【[^】]*】/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/（送料無料[^）]*）/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
