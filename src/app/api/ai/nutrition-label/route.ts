import { NextRequest, NextResponse } from "next/server";
import type { FoodItem } from "@/stores/mealStore";

/**
 * POST /api/ai/nutrition-label
 *
 * Universal fallback when every barcode DB misses: the caregiver photographs
 * the nutrition-facts panel on the package and Gemini parses the printed
 * numbers into our FoodItem shape.
 *
 * This is different from /api/ai/nutrition which analyses a PLATE of food
 * via vision. Here we're OCR-ing a printed panel — one product, known format,
 * numeric values to copy verbatim (no estimation).
 *
 * Body:
 *   { image: string (base64, no prefix), mimeType: string,
 *     productName?: string, brand?: string, barcode?: string }
 *
 * Returns:
 *   { found: true, food: FoodItem }  — on successful parse
 *   { found: false, reason: string } — on Gemini failure / no readable label
 */

interface RequestBody {
  image?: string;
  mimeType?: string;
  productName?: string;
  brand?: string;
  barcode?: string;
}

export async function POST(request: NextRequest) {
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { image, mimeType } = body;
  if (!image || !mimeType) {
    return NextResponse.json(
      { error: "Missing image or mimeType" },
      { status: 400 },
    );
  }

  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI service is not configured." },
      { status: 503 },
    );
  }

  const imageSizeMB = (image.length * 0.75) / (1024 * 1024);
  console.info(
    `[nutrition-label] image=${imageSizeMB.toFixed(1)}MB mime=${mimeType}`,
  );

  const prompt = buildPrompt(body);
  const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

  let raw: string;
  try {
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
                { inlineData: { mimeType, data: image } },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,          // numbers must be read exactly, no creativity
            maxOutputTokens: 2048,
          },
        }),
      },
    );

    if (!res.ok) {
      const err = await res.text();
      console.error(
        `[nutrition-label] Gemini ${res.status}:`,
        err.slice(0, 400),
      );
      return NextResponse.json(
        { found: false, reason: "Upstream AI failure" },
        { status: 502 },
      );
    }

    const data = await res.json();
    const candidate = data.candidates?.[0];
    if (!candidate?.content?.parts?.length) {
      const reason =
        candidate?.finishReason ??
        data.promptFeedback?.blockReason ??
        "unknown";
      console.error("[nutrition-label] empty response. reason:", reason);
      return NextResponse.json({
        found: false,
        reason: "Label not readable",
      });
    }

    raw = candidate.content.parts[0]?.text ?? "";
  } catch (err) {
    console.error("[nutrition-label] fetch failed:", err);
    return NextResponse.json(
      { found: false, reason: "Network error" },
      { status: 502 },
    );
  }

  const parsed = parseLabelJson(raw);
  if (!parsed) {
    return NextResponse.json({
      found: false,
      reason: "Couldn't read the label — try a clearer photo",
    });
  }

  const food = toFoodItem(parsed, body);
  return NextResponse.json({ found: true, food });
}

// ─── prompt ─────────────────────────────────────────────────────────────────

function buildPrompt(b: RequestBody): string {
  const context: string[] = [];
  if (b.productName) context.push(`Product name: ${b.productName}`);
  if (b.brand) context.push(`Brand: ${b.brand}`);
  if (b.barcode) context.push(`Barcode: ${b.barcode}`);
  const contextBlock =
    context.length > 0
      ? `\n\nKnown context (use to fill name if the label is unclear):\n${context.join("\n")}`
      : "";

  // Focused OCR prompt. Unlike the plate scanner we must NOT estimate —
  // copy the printed values verbatim, scaled to one serving.
  return `You are a nutrition-label OCR. Read the Nutrition Facts panel in this photo and return one JSON object.

CRITICAL RULES
1. ALWAYS return a valid JSON object — never prose or refusal text.
2. Copy the PRINTED values exactly. Do NOT estimate. If a nutrient isn't listed on the label, omit the field.
3. Scale everything to ONE serving (use the "Per serving" / "每份" column, not "Per 100g" / "每100克"). Record the serving size in grams.
4. If the label is unreadable (blurry, cropped, too dark), return {"readable": false}.

OUTPUT SHAPE
{
  "name": "product name in zh-TW (e.g. 南瓜泥)",
  "name_en": "product name in English (e.g. pumpkin puree)",
  "serving_grams": 30,
  "portion_amount": 1,
  "portion_unit": "piece",
  "calories": 12,                 // kcal
  "protein": 0.4,                 // g
  "fat": 0.1,                     // g
  "carbs": 3,                     // g
  "fiber": 0.5,                   // g
  "sugar": 1.2,                   // g
  "sodium": 0.001,                // g
  "iron_mg": 0.2,
  "zinc_mg": 0.1,
  "calcium_mg": 5,
  "vitaminA_iu": 1800,
  "vitaminD_iu": 100,
  "vitaminC_mg": 2.5,
  "allergens_present": ["milk"],  // subset of ["milk","egg","peanut","treeNut","wheat","soy","fish","shellfish","sesame"]
  "readable": true
}

UNITS
- If the label gives Vitamin A / D in mcg or mcg RAE, convert: 1 mcg RAE ≈ 3.33 IU; Vit D 1 mcg = 40 IU.
- If the label gives iron/zinc/calcium in % Daily Value only (no mg), omit those fields.
${contextBlock}

Return ONLY the JSON object. No markdown fences, no prose.`;
}

// ─── parsing ────────────────────────────────────────────────────────────────

interface ParsedLabel {
  readable?: boolean;
  name?: string;
  name_en?: string;
  serving_grams?: number;
  portion_amount?: number;
  portion_unit?: string;
  calories?: number;
  protein?: number;
  fat?: number;
  carbs?: number;
  fiber?: number;
  sugar?: number;
  sodium?: number;           // grams per the prompt
  iron_mg?: number;
  zinc_mg?: number;
  calcium_mg?: number;
  vitaminA_iu?: number;
  vitaminD_iu?: number;
  vitaminC_mg?: number;
  allergens_present?: string[];
}

function parseLabelJson(raw: string): ParsedLabel | null {
  const cleaned = raw.replace(/```(?:json)?\s*/gi, "").replace(/```\s*/g, "").trim();
  try {
    return JSON.parse(cleaned) as ParsedLabel;
  } catch {
    /* try bracket extraction */
  }
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) {
    console.error("[nutrition-label] no JSON object. Raw:", raw.slice(0, 300));
    return null;
  }
  try {
    return JSON.parse(match[0]) as ParsedLabel;
  } catch {
    console.error("[nutrition-label] malformed JSON. Raw:", raw.slice(0, 300));
    return null;
  }
}

function toFoodItem(p: ParsedLabel, ctx: RequestBody): FoodItem | null {
  if (p.readable === false) return null;

  const name = p.name || ctx.productName || p.name_en || "Unknown product";
  const nameEn = p.name_en || ctx.productName || name;

  const servingGrams =
    typeof p.serving_grams === "number" && p.serving_grams > 0
      ? p.serving_grams
      : 100;
  const portionAmount =
    typeof p.portion_amount === "number" && p.portion_amount > 0
      ? p.portion_amount
      : 1;
  const portionUnit: FoodItem["portionUnit"] =
    p.portion_unit === "tsp" ||
    p.portion_unit === "tbsp" ||
    p.portion_unit === "ml" ||
    p.portion_unit === "g"
      ? p.portion_unit
      : "piece";

  // Sodium from label is grams (per prompt) → convert to mg for our schema.
  const sodium_mg =
    typeof p.sodium === "number" ? Math.round(p.sodium * 1000 * 100) / 100 : undefined;

  const nutrients: FoodItem["nutrients"] = {};
  if (typeof p.calories === "number") nutrients.calories = p.calories;
  if (typeof p.protein === "number") nutrients.protein = p.protein;
  if (typeof p.fat === "number") nutrients.fat = p.fat;
  if (typeof p.carbs === "number") nutrients.carbs = p.carbs;
  if (typeof p.fiber === "number") nutrients.fiber = p.fiber;
  if (typeof p.sugar === "number") nutrients.sugar = p.sugar;
  if (sodium_mg !== undefined) nutrients.sodium = sodium_mg;
  if (typeof p.iron_mg === "number") nutrients.iron = p.iron_mg;
  if (typeof p.zinc_mg === "number") nutrients.zinc = p.zinc_mg;
  if (typeof p.calcium_mg === "number") nutrients.calcium = p.calcium_mg;
  if (typeof p.vitaminA_iu === "number") nutrients.vitaminA = p.vitaminA_iu;
  if (typeof p.vitaminD_iu === "number") nutrients.vitaminD = p.vitaminD_iu;
  if (typeof p.vitaminC_mg === "number") nutrients.vitaminC = p.vitaminC_mg;

  const hasAny = Object.values(nutrients).some((v) => typeof v === "number");
  if (!hasAny) return null;

  // Sanitise allergens to our union.
  const allowed = new Set([
    "milk", "egg", "peanut", "treeNut", "wheat", "soy",
    "fish", "shellfish", "sesame", "shrimp", "crab", "buckwheat", "celery",
  ]);
  const allergens = (p.allergens_present ?? [])
    .filter((a) => allowed.has(a)) as FoodItem["allergensPresent"];

  return {
    name,
    nameEn,
    portionAmount,
    portionUnit,
    gramsEstimate: servingGrams,
    nutrients,
    allergensPresent: allergens ?? [],
    source: "usda", // closest existing source tag
  };
}
