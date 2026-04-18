/**
 * OpenFoodFacts lookups + parsing. Supports two lookup modes:
 *
 *   1. lookupByBarcode(code)     — direct product lookup via /api/v2/product
 *   2. lookupByName(query)       — text search via /cgi/search.pl
 *
 * Both return the same `OffHit` shape (FoodItem + brand metadata) or null.
 *
 * Shared by the server-side barcode cascade and the Gemini nutrient waterfall.
 * Pure fetches + mapping — no secrets needed, CORS-enabled.
 */

import type { AllergenKey } from "@/lib/pediatric/allergenRegistry";
import type { FoodItem, PortionUnit } from "@/stores/mealStore";

const OFF_PRODUCT_ENDPOINT = "https://world.openfoodfacts.org/api/v2/product/";
const OFF_SEARCH_ENDPOINT = "https://world.openfoodfacts.org/cgi/search.pl";

// ─── types ──────────────────────────────────────────────────────────────────

interface OffNutriments {
  "energy-kcal_100g"?: number;
  "proteins_100g"?: number;
  "fat_100g"?: number;
  "carbohydrates_100g"?: number;
  "fiber_100g"?: number;
  "sugars_100g"?: number;
  "sodium_100g"?: number;
  "salt_100g"?: number;
  "iron_100g"?: number;
  "zinc_100g"?: number;
  "calcium_100g"?: number;
  "vitamin-d_100g"?: number;
  "vitamin-a_100g"?: number;
  "vitamin-c_100g"?: number;
}

interface OffProduct {
  product_name?: string;
  product_name_en?: string;
  product_name_zh?: string;
  brands?: string;
  serving_size?: string;
  serving_quantity?: number;
  nutriments?: OffNutriments;
  allergens_tags?: string[];
}

interface OffProductResponse {
  status: 0 | 1;
  code: string;
  product?: OffProduct;
}

interface OffSearchResponse {
  count: number;
  products?: OffProduct[];
}

export interface OffHit {
  food: FoodItem;
  brand?: string;
  servingText?: string;
}

// ─── public API ─────────────────────────────────────────────────────────────

export async function lookupByBarcode(barcode: string): Promise<OffHit | null> {
  const url = `${OFF_PRODUCT_ENDPOINT}${encodeURIComponent(barcode)}.json`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return null;
  const data = (await res.json()) as OffProductResponse;
  if (data.status !== 1 || !data.product) return null;
  return productToHit(data.product);
}

/**
 * Text-search OFF by product name. Returns the first product that carries
 * enough nutrient data to be useful, otherwise null. Used as a fallback when
 * a barcode lookup only recovers the product name (e.g. via Rakuten / UPCitemDB).
 */
export async function lookupByName(query: string): Promise<OffHit | null> {
  const q = query.trim();
  if (!q) return null;
  const url = `${OFF_SEARCH_ENDPOINT}?search_terms=${encodeURIComponent(
    q,
  )}&search_simple=1&action=process&json=1&page_size=5`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return null;
  const data = (await res.json()) as OffSearchResponse;
  const products = data.products ?? [];
  for (const p of products) {
    const hit = productToHit(p);
    if (hit && hasUsefulNutrients(hit.food.nutrients)) return hit;
  }
  return null;
}

// ─── shared mapping ─────────────────────────────────────────────────────────

function productToHit(p: OffProduct): OffHit | null {
  const n = p.nutriments ?? {};
  const servingGrams =
    typeof p.serving_quantity === "number" && p.serving_quantity > 0
      ? p.serving_quantity
      : 100;
  const scale = servingGrams / 100;
  const per = (v?: number) => (typeof v === "number" ? round(v * scale) : undefined);
  const mg = (v?: number) => (typeof v === "number" ? round(v * scale * 1000) : undefined);

  const vitaminA_IU =
    typeof n["vitamin-a_100g"] === "number"
      ? round(n["vitamin-a_100g"]! * scale * 1_000_000 * 3.33)
      : undefined;
  const vitaminD_IU =
    typeof n["vitamin-d_100g"] === "number"
      ? round(n["vitamin-d_100g"]! * scale * 1_000_000 * 40)
      : undefined;
  const sodium_mg = (() => {
    if (typeof n.sodium_100g === "number") return round(n.sodium_100g * scale * 1000);
    if (typeof n.salt_100g === "number")
      return round((n.salt_100g / 2.5) * scale * 1000);
    return undefined;
  })();

  const nutrients: FoodItem["nutrients"] = {
    calories: per(n["energy-kcal_100g"]),
    protein: per(n.proteins_100g),
    fat: per(n.fat_100g),
    carbs: per(n.carbohydrates_100g),
    fiber: per(n.fiber_100g),
    sugar: per(n.sugars_100g),
    sodium: sodium_mg,
    iron: mg(n.iron_100g),
    zinc: mg(n.zinc_100g),
    calcium: mg(n.calcium_100g),
    vitaminA: vitaminA_IU,
    vitaminD: vitaminD_IU,
    vitaminC: mg(n["vitamin-c_100g"]),
  };
  if (!hasUsefulNutrients(nutrients)) return null;

  const displayName =
    p.product_name_zh ||
    p.product_name ||
    p.product_name_en ||
    "Unknown product";
  const nameEn = p.product_name_en || p.product_name || displayName;
  const allergens = mapAllergenTags(p.allergens_tags ?? []);

  const food: FoodItem = {
    name: displayName,
    nameEn,
    portionAmount: 1,
    portionUnit: "piece" as PortionUnit,
    gramsEstimate: servingGrams,
    nutrients,
    allergensPresent: allergens,
    // Closest tag in the current source union — OFF isn't a member.
    source: "usda",
  };

  return {
    food,
    brand: p.brands?.split(",")[0]?.trim(),
    servingText: p.serving_size,
  };
}

function hasUsefulNutrients(n: FoodItem["nutrients"]): boolean {
  // At minimum we need calories — everything else can be derived or omitted.
  return typeof n.calories === "number" && n.calories > 0;
}

function mapAllergenTags(tags: string[]): AllergenKey[] {
  const out: AllergenKey[] = [];
  for (const tag of tags) {
    const k = tag.replace(/^en:/, "").toLowerCase();
    if (k === "milk" || k === "dairy") out.push("milk");
    else if (k === "eggs" || k === "egg") out.push("egg");
    else if (k === "peanuts" || k === "peanut") out.push("peanut");
    else if (k === "nuts" || k === "tree-nuts" || k === "tree-nut")
      out.push("treeNut");
    else if (k === "gluten" || k === "wheat") out.push("wheat");
    else if (k === "soybeans" || k === "soy") out.push("soy");
    else if (k === "fish") out.push("fish");
    else if (k === "shellfish" || k === "molluscs" || k === "crustaceans")
      out.push("shellfish");
    else if (k === "sesame-seeds" || k === "sesame") out.push("sesame");
  }
  return Array.from(new Set(out));
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
