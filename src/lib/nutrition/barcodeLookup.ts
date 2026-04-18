import type { FoodItem, PortionUnit } from "@/stores/mealStore";

/**
 * OpenFoodFacts lookup + field-mapping to our FoodItem shape.
 *
 * Why OpenFoodFacts:
 *   - Free, no API key, CORS-enabled → works from the browser directly
 *   - Broad coverage for Gerber / Nestle / Wakodo / Kewpie baby food lines
 *   - Decent coverage for Asian brands via community-contributed entries
 *
 * Returns null when the product isn't in the DB (status 0) or the response
 * lacks useful nutrient data. Callers should show a friendly "not found"
 * empty state and offer to scan again / fall back to photo scan.
 */

const OFF_ENDPOINT = "https://world.openfoodfacts.org/api/v2/product/";

// The subset of OFF nutriments fields we actually use. Per-100g unless suffixed _serving.
interface OffNutriments {
  "energy-kcal_100g"?: number;
  "proteins_100g"?: number;
  "fat_100g"?: number;
  "carbohydrates_100g"?: number;
  "fiber_100g"?: number;
  "sugars_100g"?: number;
  "sodium_100g"?: number;              // grams
  "salt_100g"?: number;                // grams
  "iron_100g"?: number;                // grams (usually ~0.00X)
  "zinc_100g"?: number;                // grams
  "calcium_100g"?: number;             // grams
  "vitamin-d_100g"?: number;           // grams (micrograms when * 1e6)
  "vitamin-a_100g"?: number;           // grams (micrograms when * 1e6)
  "vitamin-c_100g"?: number;           // grams
}

interface OffProduct {
  product_name?: string;
  product_name_en?: string;
  product_name_zh?: string;
  brands?: string;
  serving_size?: string;            // e.g. "28g", "1 pouch (113g)"
  serving_quantity?: number;        // numeric grams per serving if present
  nutriments?: OffNutriments;
  allergens_tags?: string[];        // e.g. ["en:milk", "en:gluten"]
  nutriscore_grade?: string;
}

interface OffResponse {
  status: 0 | 1;
  code: string;
  product?: OffProduct;
}

export interface BarcodeLookupResult {
  /** Parsed food item at the "per serving" portion, ready to hand to the scan review flow. */
  food: FoodItem;
  /** Original barcode that produced this hit. */
  barcode: string;
  /** Brand name if OFF had one, for the UI to display. */
  brand?: string;
  /** Raw serving size text (e.g. "1 pouch (113g)") for display. */
  servingText?: string;
}

/**
 * Look up a barcode. Returns null if not found or nutrient data is absent.
 * Throws only on network-level failures.
 */
export async function lookupBarcode(barcode: string): Promise<BarcodeLookupResult | null> {
  const url = `${OFF_ENDPOINT}${encodeURIComponent(barcode)}.json`;
  const res = await fetch(url, {
    // OpenFoodFacts asks all clients to identify themselves — this is a polite
    // UA string and is harmless in the browser.
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return null;

  const data = (await res.json()) as OffResponse;
  if (data.status !== 1 || !data.product) return null;

  const p = data.product;
  const n = p.nutriments ?? {};

  // Pick a portion: prefer OFF's numeric serving_quantity (grams), else default
  // to 100g (matches the per-100g numbers we get back exactly).
  const servingGrams =
    typeof p.serving_quantity === "number" && p.serving_quantity > 0
      ? p.serving_quantity
      : 100;
  const scale = servingGrams / 100;

  // Helper to read + scale a nutrient value that's in per-100g units.
  const per = (v?: number) => (typeof v === "number" ? round(v * scale) : undefined);

  // OFF reports iron/zinc/calcium in GRAMS per 100g → convert to mg.
  const mg = (v?: number) => (typeof v === "number" ? round(v * scale * 1000) : undefined);

  // Vitamin A / D: OFF reports in grams per 100g. Convert grams → mcg (×1e6),
  // then mcg → IU using standard factors (Vit A: 1 mcg RAE ≈ 3.33 IU; Vit D: 1 mcg = 40 IU).
  const vitaminA_IU =
    typeof n["vitamin-a_100g"] === "number"
      ? round(n["vitamin-a_100g"]! * scale * 1_000_000 * 3.33)
      : undefined;
  const vitaminD_IU =
    typeof n["vitamin-d_100g"] === "number"
      ? round(n["vitamin-d_100g"]! * scale * 1_000_000 * 40)
      : undefined;

  // Sodium: OFF gives grams. Our nutrient vector uses mg.
  const sodium_mg = (() => {
    if (typeof n.sodium_100g === "number") return round(n.sodium_100g * scale * 1000);
    if (typeof n.salt_100g === "number") {
      // salt → sodium: Na = salt / 2.5 (approx)
      return round((n.salt_100g! / 2.5) * scale * 1000);
    }
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

  // If there's effectively no usable nutrition data, treat as not found.
  const hasAnyNutrient = Object.values(nutrients).some((v) => typeof v === "number");
  if (!hasAnyNutrient) return null;

  const displayName =
    p.product_name_zh ||
    p.product_name ||
    p.product_name_en ||
    `Barcode ${barcode}`;
  const nameEn =
    p.product_name_en || p.product_name || `Barcode ${barcode}`;

  const allergens = mapAllergenTags(p.allergens_tags ?? []);

  const food: FoodItem = {
    name: displayName,
    nameEn,
    portionAmount: 1,
    portionUnit: "piece" as PortionUnit,
    gramsEstimate: servingGrams,
    nutrients,
    allergensPresent: allergens,
    source: "usda", // closest existing source tag; OFF isn't in the union
  };

  return {
    food,
    barcode,
    brand: p.brands?.split(",")[0]?.trim(),
    servingText: p.serving_size,
  };
}

// OFF uses tags like "en:milk", "en:peanuts", "en:gluten". Map them to our
// AllergenKey union. Best-effort — unknown tags are dropped.
function mapAllergenTags(tags: string[]): FoodItem["allergensPresent"] {
  const out: NonNullable<FoodItem["allergensPresent"]> = [];
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
  // Dedupe
  return Array.from(new Set(out));
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
