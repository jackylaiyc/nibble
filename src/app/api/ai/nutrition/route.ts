import { NextRequest, NextResponse } from "next/server";
import { searchLocalFoodDb } from "@/lib/nutrition/localFoodDb";
import type { AgeBucket } from "@/lib/pediatric/ageBucket";
import type { AllergenKey } from "@/lib/pediatric/allergenRegistry";

/**
 * POST /api/ai/nutrition — baby plate-scan endpoint.
 *
 * Takes a plate photo + child context (age bucket, known allergens) and returns
 * an array of FoodItem-shaped results plus cached totals ready to drop into
 * mealStore. Pipeline:
 *
 *   1. Gemini 2.5 Flash vision:
 *      - identifies foods + estimates portions in infant-appropriate units
 *      - flags any top-9 / HK-TW-regional allergens present
 *      - refuses photos with visible human faces (COPPA mitigation)
 *   2. Nutrient waterfall per food (cheapest→dearest):
 *      local China/Japan DB → CalorieNinjas → USDA → Gemini's own estimate
 *   3. Scale to portion grams, sum totals, return.
 */

// ─── request / response types ─────────────────────────────────────────────

type Unit = "tsp" | "tbsp" | "piece" | "ml" | "g";

interface NutritionRequest {
  image: string;          // base64, no data: prefix
  mimeType: string;       // e.g. "image/jpeg"
  ageBucket: AgeBucket;
  knownAllergens?: AllergenKey[];
}

interface GeminiPlateItem {
  name: string;
  name_en: string;
  portion_amount: number;
  portion_unit: Unit;
  portion_grams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
  allergens_present: AllergenKey[];
  /** AI-guess micros per portion — overridden by waterfall if a better source wins. */
  iron_mg?: number;
  zinc_mg?: number;
  calcium_mg?: number;
  vitaminD_iu?: number;
  vitaminA_iu?: number;
  vitaminC_mg?: number;
  dha_mg?: number;
}

interface GeminiPlateResponse {
  face_detected?: boolean;
  foods?: GeminiPlateItem[];
}

interface NutrientVector {
  calories?: number;
  protein?: number;
  fat?: number;
  carbs?: number;
  fiber?: number;
  iron?: number;      // mg
  zinc?: number;      // mg
  calcium?: number;   // mg
  vitaminD?: number;  // IU
  vitaminA?: number;  // IU
  vitaminC?: number;  // mg
  dha?: number;       // mg
  sodium?: number;
  sugar?: number;
}

interface ResponseFoodItem {
  name: string;
  nameEn: string;
  portionAmount: number;
  portionUnit: Unit;
  gramsEstimate: number;
  nutrients: NutrientVector;
  allergensPresent: AllergenKey[];
  source: "local-db" | "usda" | "calorieninjas" | "gemini-estimate";
}

interface ErrorPayload {
  error: string;
  code?: "NO_FOODS" | "FACE_DETECTED" | "BAD_INPUT" | "GEMINI_FAILED" | "PARSE_FAILED";
}

// ─── prompt construction ──────────────────────────────────────────────────

const AGE_BUCKET_GUIDANCE: Record<AgeBucket, string> = {
  "6-8mo": "Expect puréed single-ingredient foods, thin oatmeal, steamed veggie purées, tiny portions (1–2 tbsp). Parents often use BLW (soft finger strips).",
  "9-11mo": "Expect thicker purées, soft mashed mixtures, small finger foods (pea-sized pieces), 2–4 tbsp per food. Still no added salt/sugar.",
  "12-23mo": "Expect small chopped family foods, half-sized servings of table food, 1/4–1/2 cup per food. Whole milk permitted.",
  "24-47mo": "Expect toddler-sized table food, 1/2 of an adult portion. Variety across food groups.",
  "48mo+": "Expect near-adult plates but smaller portions.",
};

function buildVisionPrompt(ageBucket: AgeBucket, knownAllergens: AllergenKey[]): string {
  const knownList =
    knownAllergens.length > 0
      ? knownAllergens.join(", ")
      : "(none disclosed)";

  return `You are Nibble, a pediatric nutrition vision model. Analyze this baby/toddler plate photo.

CHILD CONTEXT
- Age bucket: ${ageBucket}
- ${AGE_BUCKET_GUIDANCE[ageBucket]}
- Known allergens in caregiver profile: ${knownList}

SAFETY — HARD RULES
1. If the photo contains a visible human face (baby, parent, or anyone else), set "face_detected": true and return an empty foods array. Do not identify food. We reject face-containing photos.
2. If the photo contains no food (e.g., just a toy, empty plate, text, screenshot), return "foods": [] with "face_detected": false.

FOOD IDENTIFICATION
For every distinct food item visible, return an object with:
- name: Chinese name (e.g. "南瓜泥", "蛋黃" — prefer zh-TW). If the food is Western, use the Chinese transliteration or common name.
- name_en: short English searchable term (e.g. "pumpkin puree", "egg yolk")
- portion_amount + portion_unit: natural infant units. Units: "tsp" | "tbsp" | "piece" | "ml" | "g".
  Prefer tsp/tbsp for purees, piece for finger foods, ml for liquids, g as fallback.
- portion_grams: your best edible-weight estimate in grams (number)
- calories (kcal), protein (g), carbs (g), fat (g), fiber (g), sugar (g), sodium (g) — scaled to this portion, NOT per 100g
- allergens_present: array subset of these keys that are in this item:
  ["milk","egg","peanut","treeNut","wheat","soy","fish","shellfish","sesame","shrimp","crab","buckwheat","celery"]
- iron_mg, zinc_mg, calcium_mg, vitaminD_iu, vitaminA_iu, vitaminC_mg, dha_mg — your best guess in portion units (omit if unsure)

EXAMPLE (9-month-old plate with pumpkin puree + a strip of chicken):
{
  "face_detected": false,
  "foods": [
    {"name":"南瓜泥","name_en":"pumpkin puree","portion_amount":2,"portion_unit":"tbsp","portion_grams":30,"calories":12,"protein":0.4,"carbs":3,"fat":0.1,"fiber":0.5,"sugar":1.2,"sodium":0.001,"allergens_present":[],"iron_mg":0.2,"zinc_mg":0.1,"calcium_mg":5,"vitaminA_iu":1800,"vitaminC_mg":2.5},
    {"name":"雞肉條","name_en":"chicken strip","portion_amount":1,"portion_unit":"piece","portion_grams":15,"calories":25,"protein":4.5,"carbs":0,"fat":0.8,"fiber":0,"sugar":0,"sodium":0.015,"allergens_present":[],"iron_mg":0.15,"zinc_mg":0.3,"calcium_mg":2}
  ]
}

OUTPUT
Return ONLY the JSON object — no markdown fences, no prose, no explanation.`;
}

// ─── Gemini call ──────────────────────────────────────────────────────────

async function identifyWithGemini(
  imageBase64: string,
  mimeType: string,
  ageBucket: AgeBucket,
  knownAllergens: AllergenKey[],
): Promise<GeminiPlateResponse> {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_GEMINI_API_KEY not set");

  const prompt = buildVisionPrompt(ageBucket, knownAllergens);

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              { inlineData: { mimeType, data: imageBase64 } },
            ],
          },
        ],
        generationConfig: {
          // Deterministic output for identification/portion estimates.
          temperature: 0.2,
          maxOutputTokens: 4096,
          responseMimeType: "application/json",
        },
      }),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error: ${err.slice(0, 400)}`);
  }

  const data = await res.json();
  const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const cleaned = text.replace(/```(?:json)?\s*/gi, "").replace(/```\s*/g, "").trim();

  try {
    return JSON.parse(cleaned) as GeminiPlateResponse;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Failed to parse Gemini JSON");
    return JSON.parse(match[0]) as GeminiPlateResponse;
  }
}

// ─── waterfall lookup for richer micros ───────────────────────────────────

interface MicroLookup {
  nutrients: NutrientVector;
  source: ResponseFoodItem["source"];
}

function scaleLocal(item: GeminiPlateItem): MicroLookup | null {
  const hit = searchLocalFoodDb(item.name, item.name_en);
  if (!hit) return null;

  const grams = item.portion_grams || 100;
  const scale = grams / 100;
  const round = (n: number | null | undefined) =>
    n == null ? undefined : Math.round(n * scale * 100) / 100;

  return {
    source: "local-db",
    nutrients: {
      calories: round(hit.calories),
      protein: round(hit.protein),
      fat: round(hit.fat),
      carbs: round(hit.carbs),
      fiber: round(hit.fiber),
      iron: round(hit.iron),
      zinc: round(hit.zinc),
      calcium: round(hit.calcium),
      vitaminA: round(hit.vitaminA),
      vitaminC: round(hit.vitaminC),
      sodium: round(hit.sodium),
    },
  };
}

async function lookupCalorieNinjas(query: string): Promise<MicroLookup | null> {
  const apiKey = process.env.CALORIE_NINJAS_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(
      `https://api.calorieninjas.com/v1/nutrition?query=${encodeURIComponent(query)}`,
      { headers: { "X-Api-Key": apiKey } },
    );
    if (!res.ok) return null;

    const data: { items?: Array<Record<string, number>> } = await res.json();
    const item = data.items?.[0];
    if (!item) return null;

    return {
      source: "calorieninjas",
      nutrients: {
        calories: item.calories,
        protein: item.protein_g,
        fat: item.fat_total_g,
        carbs: item.carbohydrates_total_g,
        fiber: item.fiber_g,
        sugar: item.sugar_g,
        sodium: item.sodium_mg != null ? item.sodium_mg / 1000 : undefined,
      },
    };
  } catch {
    return null;
  }
}

const USDA_NUTRIENT_MAP: Record<string, keyof NutrientVector> = {
  "Vitamin A, RAE": "vitaminA",
  "Vitamin C, total ascorbic acid": "vitaminC",
  "Vitamin D (D2 + D3)": "vitaminD",
  "Calcium, Ca": "calcium",
  "Iron, Fe": "iron",
  "Zinc, Zn": "zinc",
  "Fiber, total dietary": "fiber",
  "Protein": "protein",
  "Energy": "calories",
};

async function lookupUSDA(query: string, grams: number): Promise<MicroLookup | null> {
  const apiKey = process.env.USDA_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(
      `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${apiKey}` +
        `&query=${encodeURIComponent(query)}&pageSize=1&dataType=Survey%20(FNDDS)`,
    );
    if (!res.ok) return null;

    const data = await res.json();
    const food = data.foods?.[0];
    if (!food) return null;

    const scale = grams / 100;
    const nutrients: NutrientVector = {};
    for (const n of food.foodNutrients ?? []) {
      const key = USDA_NUTRIENT_MAP[n.nutrientName];
      if (key && typeof n.value === "number") {
        nutrients[key] = Math.round(n.value * scale * 100) / 100;
      }
    }
    return { source: "usda", nutrients };
  } catch {
    return null;
  }
}

function fromGeminiSelf(item: GeminiPlateItem): MicroLookup {
  return {
    source: "gemini-estimate",
    nutrients: {
      calories: item.calories,
      protein: item.protein,
      carbs: item.carbs,
      fat: item.fat,
      fiber: item.fiber,
      sugar: item.sugar,
      sodium: item.sodium,
      iron: item.iron_mg,
      zinc: item.zinc_mg,
      calcium: item.calcium_mg,
      vitaminD: item.vitaminD_iu,
      vitaminA: item.vitaminA_iu,
      vitaminC: item.vitaminC_mg,
      dha: item.dha_mg,
    },
  };
}

async function resolveNutrients(item: GeminiPlateItem): Promise<MicroLookup> {
  // 1. Local China/Japan DB — instant, free, best for Asian foods.
  const local = scaleLocal(item);
  if (local) return local;

  // 2. CalorieNinjas — free, good NLP for English queries.
  const cn = await lookupCalorieNinjas(item.name_en);
  if (cn) return cn;

  // 3. USDA — best micronutrient depth for Western baby foods.
  const usda = await lookupUSDA(item.name_en, item.portion_grams || 100);
  if (usda) return usda;

  // 4. Fallback: Gemini's own estimates (already per-portion).
  return fromGeminiSelf(item);
}

/** Merge a resolved micros lookup over Gemini macros — waterfall data wins. */
function mergeNutrients(item: GeminiPlateItem, resolved: MicroLookup): NutrientVector {
  const self = fromGeminiSelf(item).nutrients;
  return { ...self, ...cleanNutrients(resolved.nutrients) };
}

function cleanNutrients(n: NutrientVector): NutrientVector {
  const out: NutrientVector = {};
  for (const k of Object.keys(n) as (keyof NutrientVector)[]) {
    if (typeof n[k] === "number" && Number.isFinite(n[k])) {
      out[k] = n[k];
    }
  }
  return out;
}

function sumTotals(foods: ResponseFoodItem[]): NutrientVector {
  const totals: NutrientVector = {};
  for (const food of foods) {
    for (const k of Object.keys(food.nutrients) as (keyof NutrientVector)[]) {
      const v = food.nutrients[k];
      if (typeof v === "number") {
        totals[k] = Math.round(((totals[k] ?? 0) + v) * 100) / 100;
      }
    }
  }
  return totals;
}

// ─── handler ──────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  let body: NutritionRequest;
  try {
    body = (await request.json()) as NutritionRequest;
  } catch {
    return NextResponse.json<ErrorPayload>(
      { error: "Invalid JSON body", code: "BAD_INPUT" },
      { status: 400 },
    );
  }

  const { image, mimeType, ageBucket } = body;
  const knownAllergens = body.knownAllergens ?? [];

  if (!image || !mimeType || !ageBucket) {
    return NextResponse.json<ErrorPayload>(
      { error: "Missing image, mimeType, or ageBucket", code: "BAD_INPUT" },
      { status: 400 },
    );
  }

  let gemini: GeminiPlateResponse;
  try {
    gemini = await identifyWithGemini(image, mimeType, ageBucket, knownAllergens);
  } catch (err) {
    console.error("Gemini call failed:", err);
    return NextResponse.json<ErrorPayload>(
      {
        error: err instanceof Error ? err.message : "Gemini call failed",
        code: "GEMINI_FAILED",
      },
      { status: 502 },
    );
  }

  if (gemini.face_detected) {
    return NextResponse.json<ErrorPayload>(
      {
        error: "Photo contains a visible face. Please re-take with just the plate — we don't store images of children's faces.",
        code: "FACE_DETECTED",
      },
      { status: 422 },
    );
  }

  const items = gemini.foods ?? [];
  if (items.length === 0) {
    return NextResponse.json<ErrorPayload>(
      { error: "No food items detected. Try a clearer overhead shot.", code: "NO_FOODS" },
      { status: 422 },
    );
  }

  const foods: ResponseFoodItem[] = await Promise.all(
    items.map(async (item) => {
      const resolved = await resolveNutrients(item);
      return {
        name: item.name,
        nameEn: item.name_en,
        portionAmount: item.portion_amount,
        portionUnit: item.portion_unit,
        gramsEstimate: item.portion_grams,
        nutrients: mergeNutrients(item, resolved),
        allergensPresent: item.allergens_present ?? [],
        source: resolved.source,
      };
    }),
  );

  return NextResponse.json({
    foods,
    totals: sumTotals(foods),
  });
}
