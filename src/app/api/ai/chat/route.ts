import { NextRequest, NextResponse } from "next/server";
import type { AgeBucket, LifeStageKey } from "@/lib/pediatric/ageBucket";
import type { AllergenKey } from "@/lib/pediatric/allergenRegistry";
import {
  DISCLAIMERS,
  containsMedicalRiskKeyword,
  containsEmergencyKeyword,
} from "@/lib/pediatric/disclaimers";

/**
 * POST /api/ai/chat — educational parenting Q&A with structured tool calls.
 *
 * We deliberately avoid streaming for MVP to keep tool-call plumbing simple.
 * A single turn returns either:
 *   - text + an optional `log_meal` toolCall that deep-links the caregiver to
 *     /app/scan to capture the meal, or
 *   - a pediatrician-referral hard refusal when the message hits medical-risk
 *     keywords that the system prompt is instructed to redirect.
 *
 * Post-processing enforces the three-layer legal defense:
 *   1. System prompt forbids diagnosis/dosing/treatment.
 *   2. Post-process scans Gemini's text for risk keywords → appends the
 *      educational-disclaimer suffix and sets disclaimerLevel accordingly.
 *   3. Emergency keywords trigger the "call emergency services" banner.
 */

// ─── request / response types ─────────────────────────────────────────────

type ChatRole = "user" | "assistant";

interface ChatMessage {
  role: ChatRole;
  content: string;
}

interface ChildContext {
  name?: string;
  ageBucket: AgeBucket;
  feedingStyle?: "blw" | "puree" | "mixed";
  knownAllergens?: AllergenKey[];
  childId?: string;
}

interface ChatRequest {
  messages: ChatMessage[];
  child?: ChildContext;
  locale?: "zh-TW" | "en";
  /** Optional pre-formatted block describing today's logged meals
   *  and nutrient coverage — built by buildIntakeChatContext on the
   *  client. The model uses it to analyse intake, name the gaps, and
   *  recommend recipes that close them. */
  todayIntake?: string;
}

type DisclaimerLevel = "none" | "educational" | "pediatrician" | "emergency";

interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

interface ChatResponseBody {
  text: string;
  toolCall?: ToolCall;
  disclaimerLevel: DisclaimerLevel;
  disclaimerText?: string;
}

// ─── life-stage helpers ────────────────────────────────────────────────────

/** Classify the bucket into a broad kind. Used to branch the system prompt. */
function bucketKind(bucket: LifeStageKey): "infant" | "pregnant" | "lactation" {
  if (bucket.startsWith("pregnant-")) return "pregnant";
  if (bucket.startsWith("lactation-")) return "lactation";
  return "infant";
}

/** Human-readable life-stage descriptor for the system prompt context line. */
function stageDescriptor(bucket: LifeStageKey, locale: "zh-TW" | "en"): string {
  const L = (en: string, zh: string) => (locale === "en" ? en : zh);
  const MAP: Record<LifeStageKey, { en: string; "zh-TW": string }> = {
    "newborn-0-5mo":   { en: "newborn (0–5 months, milk-fed)", "zh-TW": "新生兒（0–5 個月，純哺乳期）" },
    "6-8mo":           { en: "baby 6–8 months", "zh-TW": "寶寶 6–8 個月" },
    "9-11mo":          { en: "baby 9–11 months", "zh-TW": "寶寶 9–11 個月" },
    "12-23mo":         { en: "toddler 12–23 months", "zh-TW": "寶寶 12–23 個月" },
    "24-47mo":         { en: "child 2–4 years", "zh-TW": "幼兒 2–4 歲" },
    "48mo+":           { en: "child 4–8 years", "zh-TW": "兒童 4–8 歲" },
    "child-9-13yr":    { en: "child 9–13 years", "zh-TW": "兒童 9–13 歲" },
    "pregnant-T1":     { en: "pregnant — 1st trimester", "zh-TW": "懷孕 — 第一孕期" },
    "pregnant-T2":     { en: "pregnant — 2nd trimester", "zh-TW": "懷孕 — 第二孕期" },
    "pregnant-T3":     { en: "pregnant — 3rd trimester", "zh-TW": "懷孕 — 第三孕期" },
    "lactation-0-6mo": { en: "breastfeeding — 0–6 months postpartum", "zh-TW": "哺乳中 — 產後 0–6 個月" },
    "lactation-7+mo":  { en: "breastfeeding — 7+ months postpartum", "zh-TW": "哺乳中 — 產後 7 個月以上" },
  };
  return L(MAP[bucket]?.en ?? bucket, MAP[bucket]?.["zh-TW"] ?? bucket);
}

// ─── system prompt ────────────────────────────────────────────────────────

function buildSystemPrompt(
  child?: ChildContext,
  locale: "zh-TW" | "en" = "zh-TW",
  todayIntake?: string,
): string {
  const today = new Date().toISOString().slice(0, 10);
  const bucket = child?.ageBucket as LifeStageKey | undefined;
  const kind = bucket ? bucketKind(bucket) : "infant";

  // ── context line: life-stage-aware ──────────────────────────────────────
  let profileLine: string;
  if (!child || !bucket) {
    profileLine =
      "Profile context: (no profile selected — ask the user to add one first if tracking is needed)";
  } else {
    const stageDesc = stageDescriptor(bucket, locale);
    const allergenSuffix = child.knownAllergens?.length
      ? `, known allergens: ${child.knownAllergens.join(", ")}`
      : "";
    if (kind === "pregnant") {
      profileLine = `Person context: ${child.name ?? "(unnamed)"}, ${stageDesc}${allergenSuffix}`;
    } else if (kind === "lactation") {
      profileLine = `Person context: ${child.name ?? "(unnamed)"}, ${stageDesc}${allergenSuffix}`;
    } else {
      // infant / toddler / child
      const feedingSuffix = child.feedingStyle
        ? `, feeding style ${child.feedingStyle}`
        : "";
      profileLine = `Child context: ${child.name ?? "(unnamed)"}, ${stageDesc}${feedingSuffix}${allergenSuffix}`;
    }
  }

  // ── intake block: adapt portion-size language to life stage ─────────────
  const personWord =
    kind === "infant"
      ? locale === "en" ? "baby" : "寶寶"
      : locale === "en" ? "you" : "你";

  const intakeBlock = todayIntake
    ? `\n========================
TODAY'S INTAKE (auto-generated, refreshes each turn)
========================
${todayIntake}

How to USE this data:
- Lead with a 1-line analysis of where ${personWord} stands today
  ("Iron's at 60% — dinner is a great chance to close that gap.").
- For each gap, explain WHY that nutrient matters for this life stage in
  one sentence — concrete reasons stick better than numbers.
- Suggest 2–3 specific foods or recipes that would close the biggest gap.
  Be practical: include rough portions that make sense for this person
  ("1 tbsp almond butter", "half a can of sardines", "1 small yolk").
  When you suggest a recipe, give a 3-step micro-recipe inline.
- If upper-limit nutrients (caffeine, sodium, sugar, alcohol) are showing
  above target, flag it warmly and offer a lower alternative.
- If everything is on track, say so and suggest a light top-up or a way
  to stay consistent tomorrow. Don't manufacture concern.
- Never copy raw percentages back mechanically — paraphrase.
  ("Iron's a bit low" beats "Iron is at 60% of the target.")
`
    : `\n(No meals logged today yet — suggest balanced options for this life
stage and gently nudge the user to log a meal so future answers can
be specific to their actual day.)\n`;

  // ── life-stage-specific "YOU MAY DISCUSS" section ───────────────────────
  const mayDiscuss =
    kind === "pregnant"
      ? `- Any of the 19 tracked nutrients, with emphasis on pregnancy priorities:
  folate (critical in T1 — neural tube), iron (27 mg/day, nearly double non-pregnant),
  DHA (fetal brain), choline, calcium, iodine, vitamin D. Explain why each matters
  and suggest realistic food sources and portions.
- Foods to AVOID or LIMIT during pregnancy: alcohol (zero tolerance), raw/undercooked
  fish/meat/eggs, unpasteurized soft cheeses, high-mercury fish, deli meats unless
  reheated, pâté, liver (vitamin A toxicity), raw sprouts. Explain the risk clearly
  but without alarmism.
- Caffeine limits (200 mg/day) — help the user count across coffee, tea, chocolate.
- Recipes: pick options that are pregnancy-safe and rich in the top gap nutrients.
- Managing pregnancy symptoms through diet: nausea (small meals, ginger, bland foods),
  heartburn, constipation (fiber + water), food aversions, craving management.
- General prenatal nutrition guidelines (ACOG, WHO), weight gain targets per BMI category.
- Cultural pregnancy food practices and which are safe vs. to approach cautiously.`
      : kind === "lactation"
        ? `- Any of the 19 tracked nutrients, with emphasis on breastfeeding priorities:
  iodine (290 mcg/day — highest lifetime target, passes to baby in milk), DHA,
  choline, calcium, vitamin D, vitamin C. Explain why each matters and suggest
  realistic food sources.
- Foods to limit while breastfeeding: alcohol (timing — wait 2–3 h before nursing,
  limit to ≤1 standard drink occasional), caffeine (≤300 mg/day — excess can
  affect baby's sleep), high-mercury fish (mercury passes to milk).
- Calorie needs (~330–400 extra kcal/day), hydration, and how hunger/thirst signals
  are natural supply regulators.
- Milk-boosting foods (general education — evidence is mixed but common beliefs like
  oats, fenugreek are OK to discuss with caveats).
- Managing postpartum nutrition challenges: fatigue, short cooking windows, quick
  protein-rich meals; one-handed snack ideas while nursing.
- Introducing solids to the baby (if applicable at this postpartum phase) — can
  overlap with breastfeeding discussions.`
        : `- Age-appropriate portions and textures (purée, BLW, finger food, table food).
- Any of the 19 tracked nutrients — macros (calories, protein, fat, carbs, fiber),
  vitamins (A, C, D), minerals (iron, zinc, calcium, sodium, iodine), omega-3s (DHA),
  extras (folate, choline), exposure trackers (caffeine, alcohol, sugar). Cover what
  foods are rich in each, WHO/AAP daily targets at this age, and how to bridge a gap.
- Recipes — 3-step micro-recipe inline; pick options that close today's biggest gap.
- Introducing common allergens early (AAP peanut/egg guidance).
- Picky-eating strategies, mealtime environment, division of responsibility.
- Food safety: choking hazards, whole nuts, honey <12 mo, raw fish.
- Feeding tools, utensils, high-chair recommendations.
- Cultural feeding practices (HK/TW/SG — 副食品, 寶寶粥, 手指食物, 米麩).`;

  // ── emergency/hard-refusals: add obstetric section for pregnant/lactation ─
  const hardRefusals =
    kind === "pregnant" || kind === "lactation"
      ? `For any question involving the items below, respond ONLY with a short empathetic
line acknowledging the concern and a clear referral to a doctor or emergency services.
Do NOT speculate about causes, severity, or treatment.

- Obstetric emergencies: heavy vaginal bleeding, severe abdominal pain, reduced or
  absent fetal movement, signs of preeclampsia (sudden severe headache, visual changes,
  rapid swelling, upper-right abdominal pain), leaking amniotic fluid.
- Postpartum emergencies: heavy bleeding, signs of infection (fever + wound redness),
  signs of postpartum psychosis or severe depression.
- Medication questions: dosing, whether to take, drug-food interactions, supplements
  dosing above standard prenatal vitamin levels.
- Any question requiring a diagnosis or naming a condition.
- Mental-health crisis in the caregiver.`
      : `For any question involving the items below, respond ONLY with a short empathetic
line acknowledging the concern and a clear referral to a pediatrician or emergency
services. Do NOT speculate about causes, severity, or treatment.

- Symptoms of illness: fever, rash, vomiting >1 day, persistent diarrhea, dehydration,
  breathing changes, lethargy, seizure, loss of consciousness, choking or airway concerns.
- Blood in any form, black/red/white stools.
- Allergic reaction in progress (hives, swelling, breathing difficulty, wheezing).
- Medication questions: dosing, whether to give, side effects, interactions.
- Prescribing, diagnosing, or naming a medical condition.
- Developmental regression or milestone concerns that could be neurological.
- Mental-health crisis in the caregiver.`;

  // ── tone: tailor the opening warmth to the audience ─────────────────────
  const toneNote =
    kind === "pregnant"
      ? "Warm, calm, non-judgmental. Pregnancy is full of anxiety and conflicting advice. Be reassuring but honest."
      : kind === "lactation"
        ? "Warm, encouraging, non-judgmental. New mothers are exhausted. Lead with validation."
        : "Warm, calm, non-judgmental. New parents are anxious.";

  return `You are Nibble (寶貝小口), an educational nutrition and feeding assistant for parents, caregivers, pregnant women, and breastfeeding mothers. You are NOT a doctor, midwife, dietitian, or licensed clinician. You do NOT diagnose, treat, prescribe, or dose.

Today is ${today}.
${profileLine}
Default response language: ${locale === "en" ? "English" : "Traditional Chinese (zh-TW)"}. If the user writes in a different language, reply in that language.
${intakeBlock}

========================
HARD REFUSALS — NEVER ATTEMPT TO ANSWER THESE
========================
${hardRefusals}

========================
YOU MAY DISCUSS
========================
${mayDiscuss}

========================
TONE
========================
- ${toneNote}
- Concise: 2–4 short paragraphs, or a short bulleted list. Never walls of text.
- Practical: give specific examples, not vague advice. ("try 1 tbsp of mashed red lentils at dinner" beats "try more iron").
- Honest about uncertainty: if the literature is mixed, say so in plain language.

========================
ACTIONS (TOOL CALLS)
========================
When the user clearly wants to record something, call the matching tool instead of replying with text. Set a ${locale === "en" ? "confirmation" : "確認"} message AFTER the tool call via the follow-up turn, not before. Examples:
- "記錄一下早餐，我吃了蛋黃和南瓜泥" → log_meal
- "今晚吃了很多牛肉！" → log_meal (record into the day's nutrition tally)

========================
NOTE
========================
Do NOT add any disclaimer or footer to your responses. The app UI already shows a permanent disclaimer below the chat.`;
}

// ─── tool declarations ────────────────────────────────────────────────────

const toolDeclarations = [
  {
    name: "log_meal",
    description:
      "Record a meal the baby/toddler ate. Use when the caregiver tells you what was served or eaten, e.g. '記錄早餐：蛋黃和南瓜泥', 'she had some pasta with cheese at lunch'.",
    parameters: {
      type: "OBJECT",
      properties: {
        mealType: {
          type: "STRING",
          enum: ["breakfast", "lunch", "dinner", "snack", "milk"],
        },
        foods: {
          type: "ARRAY",
          items: { type: "STRING" },
          description: "Simple list of food names — the scan UI handles nutrient breakdown separately.",
        },
        date: { type: "STRING", description: "YYYY-MM-DD, defaults to today" },
        time: { type: "STRING", description: "HH:MM 24h, defaults to sensible per mealType" },
        refused: { type: "BOOLEAN", description: "True if baby refused/didn't eat it" },
        notes: { type: "STRING" },
      },
      required: ["mealType", "foods", "date", "time"],
    },
  },
];

// ─── Gemini call ──────────────────────────────────────────────────────────

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
}

interface GeminiCandidate {
  content?: { parts?: GeminiPart[] };
}

interface GeminiGenerateResponse {
  candidates?: GeminiCandidate[];
}

async function callGemini(
  messages: ChatMessage[],
  child: ChildContext | undefined,
  locale: "zh-TW" | "en",
  todayIntake: string | undefined,
): Promise<GeminiGenerateResponse> {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_GEMINI_API_KEY not set");

  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const body = {
    systemInstruction: {
      parts: [{ text: buildSystemPrompt(child, locale, todayIntake) }],
    },
    contents,
    tools: [{ functionDeclarations: toolDeclarations }],
    generationConfig: {
      // Pediatric education is a judgement-laden task — a touch of warmth beats
      // deterministic robot voice. Keep it low-ish so facts don't drift.
      temperature: 0.5,
      maxOutputTokens: 2048,
    },
  };

  const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    console.error(`[chat] Gemini ${res.status} from model=${model}:`, err.slice(0, 500));
    throw new Error(`Gemini API ${res.status}: ${err.slice(0, 400)}`);
  }
  return (await res.json()) as GeminiGenerateResponse;
}

// ─── response shaping ─────────────────────────────────────────────────────

function extractParts(res: GeminiGenerateResponse): { text: string; toolCall?: ToolCall } {
  const parts = res.candidates?.[0]?.content?.parts ?? [];
  let text = "";
  let toolCall: ToolCall | undefined;

  for (const part of parts) {
    if (part.functionCall) {
      toolCall = {
        name: part.functionCall.name,
        args: part.functionCall.args ?? {},
      };
    }
    if (typeof part.text === "string") {
      text += part.text;
    }
  }

  return { text: text.trim(), toolCall };
}

function shapeDisclaimer(
  userMessage: string,
  assistantText: string,
  locale: "zh-TW" | "en",
): { level: DisclaimerLevel; text?: string; outText: string } {
  const combined = `${userMessage}\n${assistantText}`;
  let level: DisclaimerLevel = "none";

  if (containsEmergencyKeyword(combined)) {
    level = "emergency";
  } else if (containsMedicalRiskKeyword(combined)) {
    level = "pediatrician";
  } else if (/nutrient|iron|zinc|calcium|vitamin|dha|allergen|solid|introduc|portion|營養|鐵|鋅|鈣|維他命|副食品|過敏|口量/i.test(combined)) {
    level = "educational";
  }

  const disclaimerText =
    level === "emergency"
      ? locale === "en"
        ? DISCLAIMERS.emergency.en
        : DISCLAIMERS.emergency["zh-TW"]
      : level === "pediatrician"
        ? locale === "en"
          ? DISCLAIMERS.pediatricianReferral.en
          : DISCLAIMERS.pediatricianReferral["zh-TW"]
        : level === "educational"
          ? locale === "en"
            ? DISCLAIMERS.aiResponse.en
            : DISCLAIMERS.aiResponse["zh-TW"]
          : undefined;

  // The client shows a static disclaimer below the chat composer, so we
  // don't append per-message disclaimers. We still return the level so the
  // client can show emergency/pediatrician banners when appropriate.
  return { level, text: disclaimerText, outText: assistantText };
}

// ─── handler ──────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  let body: ChatRequest;
  try {
    body = (await request.json()) as ChatRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    !Array.isArray(body.messages) ||
    body.messages.length === 0 ||
    body.messages.some(
      (m) =>
        typeof m.content !== "string" ||
        !["user", "assistant"].includes(m.role),
    )
  ) {
    return NextResponse.json(
      { error: "messages must be a non-empty array of {role, content}" },
      { status: 400 },
    );
  }

  const locale = body.locale ?? "zh-TW";
  const userMessage = body.messages[body.messages.length - 1]?.content ?? "";

  let gemini: GeminiGenerateResponse;
  try {
    gemini = await callGemini(body.messages, body.child, locale, body.todayIntake);
  } catch (err) {
    // Log the full error server-side; never echo internals (env var names,
    // upstream API responses) to the client — those leak operator metadata
    // and confuse caregivers who see them in the chat error pill.
    console.error("Gemini chat error:", err);
    const message = err instanceof Error ? err.message : String(err);
    const isConfigIssue = message.includes("GOOGLE_GEMINI_API_KEY");
    return NextResponse.json(
      {
        error: isConfigIssue
          ? locale === "en"
            ? "AI service is not configured yet."
            : "AI 服務尚未設定。"
          : locale === "en"
            ? "AI service is temporarily unavailable. Please try again."
            : "AI 服務暫時無法使用，請稍後再試。",
      },
      { status: isConfigIssue ? 503 : 502 },
    );
  }

  const { text: rawText, toolCall } = extractParts(gemini);

  const shaped = shapeDisclaimer(userMessage, rawText, locale);

  const payload: ChatResponseBody = {
    text: shaped.outText || (toolCall
      ? locale === "en"
        ? "Logged."
        : "已記錄。"
      : ""),
    toolCall,
    disclaimerLevel: shaped.level,
    disclaimerText: shaped.text,
  };

  return NextResponse.json(payload);
}
