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
  /** Food insight fields — AI-generated, age-context-aware. */
  benefit?: string;
  benefit_en?: string;
  risk?: string;
  risk_en?: string;
  suitability?: "excellent" | "good" | "caution" | "avoid";
}

interface GeminiPlateResponse {
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
  /** One-sentence benefit for this food at this age (zh-TW). */
  benefit?: string;
  /** One-sentence benefit (English). */
  benefitEn?: string;
  /** Risk or caution — empty string if none (zh-TW). */
  risk?: string;
  /** Risk or caution (English). */
  riskEn?: string;
  /** Overall suitability for this age bucket. */
  suitability?: "excellent" | "good" | "caution" | "avoid";
}

interface ErrorPayload {
  error: string;
  code?: "NO_FOODS" | "BAD_INPUT" | "GEMINI_FAILED" | "PARSE_FAILED" | "AI_NOT_CONFIGURED";
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

SAFETY
1. If the photo contains no food (e.g., just a toy, empty plate, text, screenshot), return "foods": [].
2. Ignore any people or faces in the photo — focus only on identifying food items.

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

FOOD INSIGHTS (important — parents want to understand WHY)
For each food, also include:
- benefit: 1 sentence in zh-TW explaining the key nutritional benefit for a child at age ${ageBucket}. Be specific and practical. Example: "南瓜富含維他命A，有助寶寶視力與免疫發育。"
- benefit_en: same sentence in English. Example: "Pumpkin is rich in vitamin A, supporting vision and immune development."
- risk: 1 sentence in zh-TW about any age-appropriate risk or caution. Use empty string "" if no risk. Examples: "蜂蜜不適合一歲以下寶寶" or "鈉含量偏高，建議少量" or ""
- risk_en: same in English. Use empty string "" if no risk.
- suitability: one of "excellent" | "good" | "caution" | "avoid" — how suitable is this food for age ${ageBucket}?

EXAMPLE (9-month-old plate):
{
  "foods": [
    {"name":"南瓜泥","name_en":"pumpkin puree","portion_amount":2,"portion_unit":"tbsp","portion_grams":30,"calories":12,"protein":0.4,"carbs":3,"fat":0.1,"fiber":0.5,"sugar":1.2,"sodium":0.001,"allergens_present":[],"iron_mg":0.2,"zinc_mg":0.1,"calcium_mg":5,"vitaminA_iu":1800,"vitaminC_mg":2.5,"benefit":"南瓜富含維他命A與纖維，有助寶寶視力與消化發育。","benefit_en":"Pumpkin is rich in vitamin A and fiber, supporting vision and digestive development.","risk":"","risk_en":"","suitability":"excellent"},
    {"name":"雞肉條","name_en":"chicken strip","portion_amount":1,"portion_unit":"piece","portion_grams":15,"calories":25,"protein":4.5,"carbs":0,"fat":0.8,"fiber":0,"sugar":0,"sodium":0.015,"allergens_present":[],"iron_mg":0.15,"zinc_mg":0.3,"calcium_mg":2,"benefit":"雞肉提供優質蛋白質與鋅，支持肌肉與免疫發育。","benefit_en":"Chicken provides quality protein and zinc for muscle and immune development.","risk":"確保切成適合寶寶抓握的條狀，避免噎住。","risk_en":"Ensure strips are sized for baby's grip to prevent choking.","suitability":"excellent"}
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

  const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
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
          // NOTE: we intentionally omit responseMimeType: "application/json"
          // because it can cause Gemini to return empty output for some images.
          // Our parseGeminiJson() handles extracting JSON from prose/fenced output.
        },
      }),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    console.error(`[nutrition] Gemini ${res.status} from model=${model}:`, err.slice(0, 500));
    throw new Error(`Gemini API ${res.status}: ${err.slice(0, 400)}`);
  }

  const data = await res.json();

  // Log the raw response shape so we can debug empty/blocked responses.
  const candidate = data.candidates?.[0];
  if (!candidate?.content?.parts?.length) {
    const reason = candidate?.finishReason ?? data.promptFeedback?.blockReason ?? "unknown";
    console.error("[nutrition] Gemini returned no content. finishReason:", reason,
      "promptFeedback:", JSON.stringify(data.promptFeedback ?? {}));
    throw new Error(`Gemini returned empty response (reason: ${reason})`);
  }

  const text: string = candidate.content.parts[0]?.text ?? "";
  if (!text.trim()) {
    console.error("[nutrition] Gemini text is empty. Full candidate:", JSON.stringify(candidate).slice(0, 500));
    throw new Error("Gemini returned empty text");
  }

  const cleaned = text.replace(/```(?:json)?\s*/gi, "").replace(/```\s*/g, "").trim();

  return parseGeminiJson(cleaned);
}

/**
 * Gemini sometimes returns slightly malformed JSON (trailing commas, missing
 * commas between array elements, truncated output). This parser tries
 * progressively more aggressive cleanup before giving up.
 */
function parseGeminiJson(raw: string): GeminiPlateResponse {
  // 1. Try direct parse
  try {
    return JSON.parse(raw) as GeminiPlateResponse;
  } catch { /* fall through */ }

  // 2. Extract the outermost {...} (skip any prose Gemini prepended/appended)
  const objMatch = raw.match(/\{[\s\S]*\}/);
  if (!objMatch) throw new Error("Failed to parse Gemini JSON: no object found");
  let json = objMatch[0];

  // 3. Fix common Gemini JSON quirks:
  //    - trailing commas before ] or }
  //    - missing commas between } and { in arrays (e.g. "}{" → "},{")
  json = json
    .replace(/,\s*([}\]])/g, "$1")          // trailing commas
    .replace(/\}(\s*)\{/g, "},$1{")          // missing comma between objects
    .replace(/\](\s*)\[/g, "],$1[");         // missing comma between arrays

  try {
    return JSON.parse(json) as GeminiPlateResponse;
  } catch { /* fall through */ }

  // 4. Last resort — if the JSON was truncated mid-array, try closing it
  //    This handles responses cut off by maxOutputTokens.
  const openBraces = (json.match(/\{/g) || []).length;
  const closeBraces = (json.match(/\}/g) || []).length;
  const openBrackets = (json.match(/\[/g) || []).length;
  const closeBrackets = (json.match(/\]/g) || []).length;
  let patched = json.replace(/,\s*$/, ""); // strip dangling comma
  for (let i = 0; i < openBrackets - closeBrackets; i++) patched += "]";
  for (let i = 0; i < openBraces - closeBraces; i++) patched += "}";

  try {
    return JSON.parse(patched) as GeminiPlateResponse;
  } catch {
    console.error("[nutrition] All JSON parse attempts failed. Raw:", raw.slice(0, 500));
    throw new Error("Failed to parse Gemini JSON after cleanup");
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

async function lookupCalorieNinjas(query: string, portionGrams: number): Promise<MicroLookup | null> {
  const apiKey = process.env.CALORIE_NINJAS_API_KEY;
  if (!apiKey) return null;

  try {
    // Include portion size in query — CalorieNinjas NLP handles "30g pumpkin"
    const portionQuery = `${Math.round(portionGrams)}g ${query}`;
    const res = await fetch(
      `https://api.calorieninjas.com/v1/nutrition?query=${encodeURIComponent(portionQuery)}`,
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
        let value = n.value * scale;
        // USDA returns Vitamin A as mcg RAE and Vitamin D as mcg —
        // our NutrientVector uses IU. Convert:
        //   Vitamin A:  1 mcg RAE ≈ 3.33 IU
        //   Vitamin D:  1 mcg = 40 IU
        if (key === "vitaminA") value *= 3.33;
        if (key === "vitaminD") value *= 40;
        nutrients[key] = Math.round(value * 100) / 100;
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
  const cn = await lookupCalorieNinjas(item.name_en, item.portion_grams || 100);
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

  // Log image size for debugging — base64 is ~1.37× the raw bytes.
  const imageSizeMB = (image.length * 0.75) / (1024 * 1024);
  console.info(`[nutrition] image=${imageSizeMB.toFixed(1)}MB mime=${mimeType} bucket=${ageBucket}`);

  let gemini: GeminiPlateResponse;
  try {
    gemini = await identifyWithGemini(image, mimeType, ageBucket, knownAllergens);
  } catch (err) {
    // Log the full error server-side; never echo internals (env var names,
    // upstream API responses) to the client. Distinguish missing-key from
    // generic failure so the UI can present the right tone.
    console.error("Gemini call failed:", err);
    const message = err instanceof Error ? err.message : String(err);
    const isConfigIssue = message.includes("GOOGLE_GEMINI_API_KEY");
    return NextResponse.json<ErrorPayload>(
      {
        error: isConfigIssue
          ? "AI service is not configured."
          : "AI service is temporarily unavailable. Please try again.",
        code: isConfigIssue ? "AI_NOT_CONFIGURED" : "GEMINI_FAILED",
      },
      { status: isConfigIssue ? 503 : 502 },
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
        benefit: item.benefit ?? undefined,
        benefitEn: item.benefit_en ?? undefined,
        risk: item.risk || undefined,      // convert "" to undefined
        riskEn: item.risk_en || undefined,
        suitability: item.suitability ?? undefined,
      };
    }),
  );

  return NextResponse.json({
    foods,
    totals: sumTotals(foods),
  });
}
