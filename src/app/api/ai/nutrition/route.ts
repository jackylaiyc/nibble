import { NextRequest, NextResponse } from "next/server";
import { searchLocalFoodDb } from "@/lib/nutrition/localFoodDb";
import type { AgeBucket, LifeStageKey } from "@/lib/pediatric/ageBucket";
import type { AllergenKey } from "@/lib/pediatric/allergenRegistry";
import { applyLifeStageCautions } from "@/lib/pediatric/lifeStageWarnings";

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
 *      - identifies all visible food, no age/face/content restrictions
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

/**
 * Per-life-stage context block injected into the base food-ID prompt.
 * Gemini's `suitability` guess is a helpful first pass, but we ENFORCE the
 * hard rules server-side via `applyLifeStageCautions` after parsing.
 */
const LIFE_STAGE_CONTEXT: Record<LifeStageKey, string> = {
  "newborn-0-5mo":
    "This person is a newborn (0-5 months). Plate scan does not apply at this age — infants are exclusively breast/formula-fed. If a photo is submitted for this profile, still identify any food visible and return standard nutrients, but flag any solid food with 'suitability: caution' and a 'risk' note explaining solids typically begin at 6 months.",
  "6-8mo":
    "This person is a 6-8 month old baby starting solids. Highlight foods rich in iron, zinc, protein, and DHA. Note choking hazards and honey risk under 12 months.",
  "9-11mo":
    "This person is a 9-11 month old baby. Same priority as 6-8mo plus variety. Finger foods must be soft and pea-sized to avoid choking.",
  "12-23mo":
    "This person is a 12-23 month old toddler. Priority: iron, calcium, vitamin D, DHA, fiber. Whole milk permitted.",
  "24-47mo":
    "This person is a 2-4 year old child. Priority: calcium, vitamin D, fiber, iron. Watch added sugar and sodium.",
  "48mo+":
    "This person is 4-8 years old. Priority: calcium, vitamin D, fiber, iron. Watch added sugar and sodium.",
  "child-9-13yr":
    "This person is 9-13 years old (pre-teen). Calcium peaks at 1300 mg/day — this is the peak bone-mass window. Protein needs have nearly doubled vs 4-8yr (34 g). Puberty is starting or imminent; zinc + vitamin D + iron all matter. Watch added sugar and sodium; encourage whole grains, dairy, and lean protein.",
  "pregnant-T1":
    "This person is pregnant in the 1st trimester. Highlight folate, iron, and DHA. Mark as 'avoid': alcohol, raw/undercooked fish/meat/eggs, unpasteurized soft cheese, high-mercury fish (shark/swordfish/king mackerel/tilefish/big-eye tuna), pâté, liver, deli meats unless reheated, raw sprouts. Mark as 'caution': caffeine (limit 200 mg/day), canned light tuna (≤12 oz/wk), large amounts of sage/peppermint/chamomile tea.",
  "pregnant-T2":
    "This person is pregnant in the 2nd trimester. Same avoidance rules as T1 (alcohol, raw fish/meat/eggs, unpasteurized cheese, high-mercury fish, deli meats). Calorie needs increase ~340 kcal/day. Caffeine limit 200 mg/day.",
  "pregnant-T3":
    "This person is pregnant in the 3rd trimester. Same avoidance rules as T1/T2. Calorie needs ~450 kcal/day above baseline. Watch sodium (swelling), iron (anaemia), caffeine (200 mg/day).",
  "lactation-0-6mo":
    "This person is breastfeeding, 0-6 months postpartum. Needs ~330-400 extra kcal, highest lifetime iodine target, high choline. Mark as 'caution': alcohol (time 2-3h before nursing, ≤1 drink), caffeine (>300 mg may affect baby sleep), high-mercury fish (mercury passes to milk).",
  "lactation-7+mo":
    "This person is breastfeeding, 7+ months postpartum. Same cautions as 0-6mo. Calorie needs taper slightly as baby starts solids.",
};

function buildVisionPrompt(stage: LifeStageKey): string {
  const ctx = LIFE_STAGE_CONTEXT[stage];
  return `You are a food identification model. Look at the photo and identify every food item you can see. Always return a JSON object with a "foods" array.

PERSON CONTEXT
${ctx}

For each food item, include:
- name: name in zh-TW (e.g. "南瓜泥", "鰻魚飯")
- name_en: short English searchable term (e.g. "pumpkin puree", "eel rice")
- portion_amount + portion_unit: natural units. Units: "tsp" | "tbsp" | "piece" | "ml" | "g"
- portion_grams: best edible-weight estimate in grams (number)
- calories (kcal), protein (g), carbs (g), fat (g), fiber (g), sugar (g), sodium (g) — scaled to this portion, NOT per 100g
- allergens_present: array subset of ["milk","egg","peanut","treeNut","wheat","soy","fish","shellfish","sesame","shrimp","crab","buckwheat","celery"]
- iron_mg, zinc_mg, calcium_mg, vitaminD_iu, vitaminA_iu, vitaminC_mg, dha_mg — best guess scaled to portion (omit if unsure)
- folate_mcg, choline_mg, iodine_mcg, caffeine_mg, alcohol_g — include when present (critical for pregnant/breastfeeding users)
- benefit: 1 sentence in zh-TW about the food's nutritional benefit FOR THIS PERSON. Example for pregnant: "菠菜富含葉酸與鐵，對懷孕早期胎兒神經管發育特別重要。"
- benefit_en: same sentence in English
- risk: 1 sentence in zh-TW about any practical caution FOR THIS PERSON. Use "" if none.
- risk_en: same in English. Use "" if none.
- suitability: one of "excellent" | "good" | "caution" | "avoid" — informed by the PERSON CONTEXT above. Use "avoid" for hard-rule violations (e.g. alcohol for pregnant users). Default to "good" when unsure. Never refuse a photo.

EXAMPLE (6-9mo baby):
{"foods":[{"name":"南瓜泥","name_en":"pumpkin puree","portion_amount":2,"portion_unit":"tbsp","portion_grams":30,"calories":12,"protein":0.4,"carbs":3,"fat":0.1,"fiber":0.5,"sugar":1.2,"sodium":0.001,"allergens_present":[],"iron_mg":0.2,"calcium_mg":5,"vitaminA_iu":1800,"benefit":"南瓜富含維他命A與纖維。","benefit_en":"Pumpkin is rich in vitamin A and fiber.","risk":"","risk_en":"","suitability":"excellent"}]}

If the photo genuinely contains no food (e.g. blank wall, abstract image), return {"foods": []}.

OUTPUT
Return ONLY the JSON object. No markdown fences, no prose, no explanation.`;
}

// ─── Gemini call ──────────────────────────────────────────────────────────

async function identifyWithGemini(
  imageBase64: string,
  mimeType: string,
  stage: LifeStageKey,
): Promise<GeminiPlateResponse> {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_GEMINI_API_KEY not set");

  const prompt = buildVisionPrompt(stage);

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
    // Empty response → treat as "no foods detected", not a 502 server error.
    return { foods: [] };
  }

  const text: string = candidate.content.parts[0]?.text ?? "";
  if (!text.trim()) {
    console.error("[nutrition] Gemini text is empty. Full candidate:", JSON.stringify(candidate).slice(0, 500));
    return { foods: [] };
  }

  const cleaned = text.replace(/```(?:json)?\s*/gi, "").replace(/```\s*/g, "").trim();

  return parseGeminiJson(cleaned);
}

/**
 * Gemini sometimes returns slightly malformed JSON (trailing commas, missing
 * commas between array elements, truncated output) — or pure prose when it
 * decides the photo isn't analysable. This parser tries progressively more
 * aggressive cleanup, then falls back to "no foods" rather than crashing.
 */
function parseGeminiJson(raw: string): GeminiPlateResponse {
  // 1. Try direct parse
  try {
    return JSON.parse(raw) as GeminiPlateResponse;
  } catch { /* fall through */ }

  // 2. Extract the outermost {...} (skip any prose Gemini prepended/appended)
  const objMatch = raw.match(/\{[\s\S]*\}/);
  if (!objMatch) {
    // No JSON object at all — Gemini returned pure prose (often a refusal).
    // Surface as "no foods" so the UI shows a friendly retry hint, not 502.
    console.error("[nutrition] Gemini returned non-JSON. Raw:", raw.slice(0, 500));
    return { foods: [] };
  }
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
    // Surface as "no foods" rather than 502 — the photo arrived fine, Gemini
    // just gave us something unparseable.
    return { foods: [] };
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

  if (!image || !mimeType || !ageBucket) {
    return NextResponse.json<ErrorPayload>(
      { error: "Missing image, mimeType, or ageBucket", code: "BAD_INPUT" },
      { status: 400 },
    );
  }

  // Log image size for debugging — base64 is ~1.37× the raw bytes.
  const imageSizeMB = (image.length * 0.75) / (1024 * 1024);
  console.info(`[nutrition] image=${imageSizeMB.toFixed(1)}MB mime=${mimeType} stage=${ageBucket}`);

  let gemini: GeminiPlateResponse;
  try {
    gemini = await identifyWithGemini(image, mimeType, ageBucket);
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

  const rawFoods: ResponseFoodItem[] = await Promise.all(
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

  // Apply hard food-caution rules for the user's life stage. This OVERRIDES
  // Gemini's `suitability` for things like alcohol-during-pregnancy where
  // medical guidance is non-negotiable. Infant buckets have no rules so
  // the function is a no-op for them.
  const foods = applyLifeStageCautions(rawFoods, ageBucket);

  return NextResponse.json({
    foods,
    totals: sumTotals(foods),
  });
}
