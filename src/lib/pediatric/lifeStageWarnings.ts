/**
 * Hard food-caution rules per life stage.
 *
 * Applied SERVER-SIDE after the Gemini vision response, so the LLM's
 * free-form `suitability` guess can't override medical guidance:
 *   - A pregnant user's "wine" MUST be `avoid`, regardless of what Gemini
 *     wrote, because there's no safe amount of alcohol during pregnancy.
 *   - A breastfeeding user's "tuna steak" MUST be `avoid` (high-mercury
 *     fish transfers to milk), even if Gemini marked it "good".
 *
 * Each rule is a regex that matches the food name (zh or en), a severity,
 * and a bilingual reason. Rules are additive — multiple rules can match a
 * food, and we pick the strictest (`avoid` beats `caution`).
 *
 * Infant buckets intentionally use no rules here — infant cautions (honey,
 * choking-size pieces, added salt/sugar) are already baked into Gemini's
 * age-aware prompt and the existing `risk` field.
 */

import type { LifeStageKey } from "./ageBucket";
import type { FoodItem } from "@/stores/mealStore";

type Severity = "avoid" | "caution";

export interface FoodCaution {
  /** Regex matching the food's `name` (zh) or `nameEn`. Case-insensitive. */
  pattern: RegExp;
  severity: Severity;
  reasonEn: string;
  reasonZh: string;
  /** Which life stages this rule applies to. */
  appliesTo: LifeStageKey[];
}

const PREGNANCY_KEYS: LifeStageKey[] = [
  "pregnant-T1",
  "pregnant-T2",
  "pregnant-T3",
];

const LACTATION_KEYS: LifeStageKey[] = [
  "lactation-0-6mo",
  "lactation-7+mo",
];

const BOTH = [...PREGNANCY_KEYS, ...LACTATION_KEYS];

export const FOOD_CAUTIONS: FoodCaution[] = [
  // ─── Pregnancy: absolute AVOID ────────────────────────────────────────
  {
    pattern: /\balcohol\b|\bwine\b|\bbeer\b|\bchampagne\b|\bsake\b|\bsoju\b|\bwhisk(e)?y\b|\bvodka\b|\btequila\b|\brum\b|\bgin\b|\bbrandy\b|\bcocktail\b|\bliqueur\b|酒|紅酒|白酒|啤酒|清酒|香檳|威士忌|雞尾酒|葡萄酒/i,
    severity: "avoid",
    reasonEn: "No safe amount of alcohol during pregnancy.",
    reasonZh: "懷孕期間無安全酒量。",
    appliesTo: PREGNANCY_KEYS,
  },
  {
    pattern: /\bsushi\b|\bsashimi\b|\bceviche\b|raw\s+(fish|salmon|tuna|scallop|oyster|shrimp|meat|beef|chicken|pork|egg)|\btartare\b|\bcarpaccio\b|生魚片|刺身|生蠔|生蛋|壽司|韃靼/i,
    severity: "avoid",
    reasonEn: "Raw/undercooked — listeria + salmonella risk during pregnancy.",
    reasonZh: "生食或未完全煮熟的食物有李斯特菌與沙門氏菌風險，懷孕期間請避免。",
    appliesTo: PREGNANCY_KEYS,
  },
  {
    pattern: /\b(shark|swordfish|king\s*mackerel|tilefish|marlin|bigeye\s*tuna|ahi\s*tuna)\b|鯊魚|旗魚|馬加鰆|方頭魚|劍魚|大目鮪/i,
    severity: "avoid",
    reasonEn: "High-mercury fish — can affect fetal nervous system.",
    reasonZh: "此類深海魚汞含量高，可能影響胎兒神經發育。",
    appliesTo: BOTH,
  },
  {
    pattern: /\bbrie\b|\bcamembert\b|\bfeta\b|\bblue\s*cheese\b|\bqueso\s*fresco\b|\broquefort\b|\bgorgonzola\b|unpasteurized|raw[\s-]milk|布利|卡門貝爾|藍乳酪|費塔|生乳/i,
    severity: "avoid",
    reasonEn: "Soft/unpasteurized cheese — listeria risk during pregnancy.",
    reasonZh: "軟質或未經殺菌的乳酪有李斯特菌風險。",
    appliesTo: PREGNANCY_KEYS,
  },
  {
    pattern: /\b(deli\s*meat|cold\s*cut|prosciutto|salami|pastrami|mortadella|hot\s*dog|frankfurter|bologna)\b|生火腿|義式火腿|熱狗|冷切肉/i,
    severity: "avoid",
    reasonEn: "Deli/cured meat — listeria risk unless reheated until steaming.",
    reasonZh: "冷切肉與熱狗有李斯特菌風險，除非完全加熱。",
    appliesTo: PREGNANCY_KEYS,
  },
  {
    pattern: /\bp[âa]t[ée]\b|\bliverwurst\b|\bfoie\s*gras\b|肝醬|鵝肝|鴨肝/i,
    severity: "avoid",
    reasonEn: "Pâté — listeria + excessive vitamin A during pregnancy.",
    reasonZh: "肝醬有李斯特菌風險，且維他命A過高。",
    appliesTo: PREGNANCY_KEYS,
  },
  {
    pattern: /\bliver\b|\bkidney\b(?!\s*bean)|動物肝|豬肝|雞肝|牛肝|鴨肝(?!.*醬)/i,
    severity: "avoid",
    reasonEn: "Liver — vitamin A can exceed safe pregnancy limits.",
    reasonZh: "動物肝臟的維他命A過量，懷孕期間請避免。",
    appliesTo: PREGNANCY_KEYS,
  },
  {
    pattern: /\b(alfalfa|mung|clover|radish)\s*sprouts?\b|生芽菜|苜蓿芽|豆芽菜/i,
    severity: "avoid",
    reasonEn: "Raw sprouts — salmonella + E. coli risk.",
    reasonZh: "生芽菜有沙門氏菌與大腸桿菌風險。",
    appliesTo: PREGNANCY_KEYS,
  },
  {
    pattern: /pennyroyal|blue\s*cohosh|dong\s*quai|當歸(?!.*煮)/i,
    severity: "avoid",
    reasonEn: "Herbal tea with uterine-stimulant effects — avoid during pregnancy.",
    reasonZh: "此類草本可能刺激子宮，懷孕期間請避免。",
    appliesTo: PREGNANCY_KEYS,
  },

  // ─── Pregnancy: CAUTION (limit) ───────────────────────────────────────
  {
    pattern: /\bcoffee\b|\bespresso\b|\blatte\b|\bmocha\b|\bcappuccino\b|\bamericano\b|咖啡|拿鐵|摩卡|卡布奇諾/i,
    severity: "caution",
    reasonEn: "Keep total caffeine under 200 mg/day (≈ 1 × 12 oz coffee).",
    reasonZh: "每日咖啡因總量建議控制在 200 mg（約 1 杯 350ml 咖啡）以內。",
    appliesTo: PREGNANCY_KEYS,
  },
  {
    pattern: /\b(canned|light)\s*tuna\b|鮪魚罐頭|吞拿魚罐頭/i,
    severity: "caution",
    reasonEn: "Limit canned light tuna to ≤ 12 oz (340 g) per week.",
    reasonZh: "罐頭鮪魚每週建議不超過 340 克（約 12 盎司）。",
    appliesTo: BOTH,
  },
  {
    pattern: /\b(sage|peppermint|chamomile|licorice)\s*tea\b|薄荷茶|洋甘菊茶|鼠尾草茶|甘草茶/i,
    severity: "caution",
    reasonEn: "Large amounts (3+ cups/day) may affect pregnancy — moderation is fine.",
    reasonZh: "大量飲用（每日 3 杯以上）可能影響懷孕，少量沒問題。",
    appliesTo: PREGNANCY_KEYS,
  },

  // ─── Breastfeeding: CAUTION ───────────────────────────────────────────
  {
    pattern: /\balcohol\b|\bwine\b|\bbeer\b|\bchampagne\b|\bsake\b|\bsoju\b|\bwhisk(e)?y\b|\bvodka\b|\btequila\b|\brum\b|\bcocktail\b|酒|紅酒|白酒|啤酒|清酒|香檳|雞尾酒/i,
    severity: "caution",
    reasonEn: "Time 2–3 hours before nursing; limit to ≤ 1 standard drink.",
    reasonZh: "哺乳前 2–3 小時先喝，每次不超過 1 份標準量。",
    appliesTo: LACTATION_KEYS,
  },
  {
    pattern: /\bcoffee\b|\bespresso\b|\blatte\b|\bmocha\b|\bcappuccino\b|\bamericano\b|\benergy\s*drink\b|咖啡|拿鐵|摩卡|卡布奇諾|能量飲/i,
    severity: "caution",
    reasonEn: "Keep total caffeine under 300 mg/day — higher may affect baby's sleep.",
    reasonZh: "每日咖啡因建議控制在 300 mg 以內，過量可能影響寶寶睡眠。",
    appliesTo: LACTATION_KEYS,
  },
];

/** Strictness ordering so avoid always wins over caution. */
const SEVERITY_RANK: Record<Severity, number> = { caution: 1, avoid: 2 };

function strictest(a: Severity | undefined, b: Severity): Severity {
  if (!a) return b;
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

/**
 * Apply hard-caution overrides to a Gemini-identified food list based on the
 * active life stage. Returns a NEW array — does not mutate input.
 *
 * Each food's `suitability`, `risk`, and `riskEn` are overridden ONLY when a
 * rule matches AND the rule is stricter than what Gemini produced. This
 * preserves Gemini's rich free-form reasons when they're already on the
 * right side of the medical guidance.
 */
export function applyLifeStageCautions<
  T extends Pick<FoodItem, "name" | "nameEn" | "suitability" | "risk" | "riskEn">,
>(foods: T[], stage: LifeStageKey): T[] {
  return foods.map((food) => {
    const name = food.name ?? "";
    const nameEn = food.nameEn ?? "";
    let winning: FoodCaution | null = null;
    for (const rule of FOOD_CAUTIONS) {
      if (!rule.appliesTo.includes(stage)) continue;
      if (!(rule.pattern.test(name) || rule.pattern.test(nameEn))) continue;
      if (!winning || SEVERITY_RANK[rule.severity] > SEVERITY_RANK[winning.severity]) {
        winning = rule;
      }
    }
    if (!winning) return food;

    // Only override when our rule is stricter than Gemini's verdict.
    const geminiSeverity: Severity | undefined =
      food.suitability === "avoid" || food.suitability === "caution"
        ? food.suitability
        : undefined;
    const finalSeverity = strictest(geminiSeverity, winning.severity);

    const newRisk = winning.reasonZh;
    const newRiskEn = winning.reasonEn;

    return {
      ...food,
      suitability: finalSeverity,
      // Merge Gemini's existing risk with our hard-caution reason, preferring ours.
      risk: food.risk ? `${newRisk}（${food.risk}）` : newRisk,
      riskEn: food.riskEn ? `${newRiskEn} (${food.riskEn})` : newRiskEn,
    };
  });
}
