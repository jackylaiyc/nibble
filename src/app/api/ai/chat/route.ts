import { NextRequest, NextResponse } from "next/server";
import type { AgeBucket } from "@/lib/pediatric/ageBucket";
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

// ─── system prompt ────────────────────────────────────────────────────────

function buildSystemPrompt(
  child?: ChildContext,
  locale: "zh-TW" | "en" = "zh-TW",
  todayIntake?: string,
): string {
  const today = new Date().toISOString().slice(0, 10);

  const childLine = child
    ? `Child context: ${child.name ?? "(unnamed)"}, age bucket ${child.ageBucket}` +
      (child.feedingStyle ? `, feeding style ${child.feedingStyle}` : "") +
      (child.knownAllergens?.length
        ? `, known allergens: ${child.knownAllergens.join(", ")}`
        : "")
    : "Child context: (no child selected — ask the caregiver to add one first if logging is needed)";

  // Inject today's intake summary when the client supplied one. With it,
  // the AI's analysis ("you're light on iron today") and recipe
  // suggestions ("a yolk + a spoon of beef purée would close the gap")
  // can be specific to this caregiver's actual day rather than generic.
  const intakeBlock = todayIntake
    ? `\n========================
TODAY'S INTAKE (auto-generated, refreshes each turn)
========================
${todayIntake}

How to USE this data:
- When the caregiver asks something general about today's nutrition or
  what to serve next, lead with a 1-line analysis of where they stand
  ("Today's looking good on protein and calcium, but iron is at 60%.").
- For each gap above, briefly explain WHY that nutrient matters at this
  age in one sentence — caregivers retain reasons better than numbers.
- Suggest 2-3 specific foods or recipes that would help close the
  biggest gap. Be practical: include rough portions a baby actually
  eats ("1 small yolk", "2 tbsp red-lentil purée"). When you suggest a
  recipe, give a 3-step micro-recipe inline rather than a full
  cookbook entry.
- If everything is on track, say so warmly and suggest a light snack
  idea or a way to stay consistent tomorrow. Don't manufacture concern.
- Never copy the raw percentages back at the caregiver mechanically —
  paraphrase. ("Iron's a bit low" beats "Iron is at 60% of the target.")
`
    : `\n(No meals logged today yet — when the caregiver asks "what should we
eat?" or similar, suggest balanced options and gently nudge them to log
a meal so future answers can be specific to their day.)\n`;

  return `You are Nibble (寶貝小口), an educational feeding and parenting assistant for caregivers of children 6 months to 4 years old. You are NOT a pediatrician, doctor, nurse, or licensed clinician. You do NOT diagnose, treat, prescribe, or dose.

Today is ${today}.
${childLine}
Default response language: ${locale === "en" ? "English" : "Traditional Chinese (zh-TW)"}. If the caregiver writes in a different language, reply in that language.
${intakeBlock}

========================
HARD REFUSALS — NEVER ATTEMPT TO ANSWER THESE
========================
For any question involving the items below, respond ONLY with a short empathetic line acknowledging the concern and a clear referral to a pediatrician or emergency services. Do NOT speculate about causes, severity, or treatment.

- Symptoms of illness: fever, rash, vomiting >1 day, persistent diarrhea, dehydration, breathing changes, lethargy, seizure, loss of consciousness, choking or airway concerns.
- Blood in any form, black/red/white stools.
- Allergic reaction in progress (hives, swelling, breathing difficulty, wheezing).
- Medication questions: dosing, whether to give, side effects, interactions.
- Prescribing, diagnosing, or naming a medical condition.
- Developmental regression or milestone concerns that could be neurological.
- Mental-health crisis in the caregiver.

========================
YOU MAY DISCUSS
========================
- Age-appropriate portions and textures (purée, BLW, finger food, table food).
- Any of the 19 tracked nutrients — macros (calories, protein, fat, carbs, fiber), vitamins (A, C, D), minerals (iron, zinc, calcium, sodium, iodine), omega-3s (DHA), pregnancy/lactation extras (folate, choline), exposure trackers (caffeine, alcohol, sugar). Cover what foods are rich in each, WHO/AAP daily targets at this age, and how to bridge a gap with realistic portions.
- Recipes — when the caregiver asks, give a 3-step micro-recipe inline (ingredients in 1 line, method in 2-3 short steps). Pick recipes that close the biggest gap from today's intake when one is in context.
- Introducing common allergens early (AAP guidance on peanut, egg at 4–6 months for at-risk infants, etc.) as general education.
- Picky-eating strategies, mealtime environment, division of responsibility.
- Food safety: choking hazards, whole nuts, honey <12 mo, raw fish, etc.
- Feeding tools, utensils, high-chair recommendations.
- Cultural feeding practices (HK/TW/SG — 副食品, 寶寶粥, 手指食物, 米麩).

========================
TONE
========================
- Warm, calm, non-judgmental. New parents are anxious.
- Concise: 2–4 short paragraphs, or a short bulleted list. Never walls of text.
- Practical: give specific examples, not vague advice. ("try 1 tbsp of mashed red lentils at dinner" beats "try more iron").
- Honest about uncertainty: if the literature is mixed, say so in plain language.

========================
ACTIONS (TOOL CALLS)
========================
When the caregiver clearly wants to record something, call the matching tool instead of replying with text. Set a ${locale === "en" ? "confirmation" : "確認"} message AFTER the tool call via the follow-up turn, not before. Examples:
- "記錄一下早餐，寶寶吃了蛋黃和南瓜泥" → log_meal
- "今晚我吃了很多牛肉！" → log_meal (record into the day's nutrition tally)

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
