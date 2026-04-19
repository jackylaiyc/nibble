/**
 * Recommended Daily Allowances for infants and young children.
 *
 * Sources: WHO "Complementary feeding" guidelines, AAP Nutrition Handbook,
 * U.S. DRI tables (NIH ODS), HK Centre for Food Safety recommendations.
 *
 * Units are per day. Where sources differ, we use the mid-range of
 * authoritative guidance. These targets are educational; the app must
 * always show the "consult your pediatrician" disclaimer before acting
 * on RDA gap analysis.
 */

import type { AgeBucket } from "./ageBucket";

export type Nutrient =
  | "calories"     // kcal
  | "protein"      // g
  | "fat"          // g (AI = adequate intake)
  | "carbs"        // g
  | "fiber"        // g
  | "iron"         // mg
  | "zinc"         // mg
  | "calcium"      // mg
  | "vitaminD"     // IU
  | "vitaminA"     // IU
  | "vitaminC"     // mg
  | "dha"          // mg
  | "sodium"       // mg (upper limit)
  | "sugar"        // g (upper limit, added sugar)
  // New — maternal life-stage nutrients.
  | "folate"       // mcg DFE — critical early in pregnancy
  | "choline"      // mg — fetal brain + lactation
  | "iodine"       // mcg — fetal thyroid + milk
  | "caffeine"     // mg (upper limit) — exposure tracking
  | "alcohol";     // g  (upper limit) — near-zero for pregnancy

export interface RdaTarget {
  value: number;
  unit: string;
  /** If true, this is an upper-limit target (less is better). */
  isUpperLimit?: boolean;
}

/**
 * Per-life-stage nutrient targets. Rows are PARTIAL — not every life stage
 * needs to track every nutrient (e.g. infants don't track caffeine, pregnant
 * women track folate which infants don't). Consumers iterate via
 * `Object.keys(row)` and treat absent keys as "not applicable".
 */
export type RdaRow = Partial<Record<Nutrient, RdaTarget>>;

export const RDA: Record<AgeBucket, RdaRow> = {
  "6-8mo": {
    calories: { value: 600, unit: "kcal" },
    protein: { value: 11, unit: "g" },
    fat: { value: 30, unit: "g" },
    carbs: { value: 95, unit: "g" },
    fiber: { value: 5, unit: "g" },
    iron: { value: 11, unit: "mg" },
    zinc: { value: 3, unit: "mg" },
    calcium: { value: 260, unit: "mg" },
    vitaminD: { value: 400, unit: "IU" },
    vitaminA: { value: 1665, unit: "IU" },  // 500 mcg RAE × 3.33
    vitaminC: { value: 50, unit: "mg" },
    dha: { value: 100, unit: "mg" },
    sodium: { value: 370, unit: "mg", isUpperLimit: true },
    sugar: { value: 0, unit: "g", isUpperLimit: true },
  },
  "9-11mo": {
    calories: { value: 700, unit: "kcal" },
    protein: { value: 11, unit: "g" },
    fat: { value: 30, unit: "g" },
    carbs: { value: 95, unit: "g" },
    fiber: { value: 7, unit: "g" },
    iron: { value: 11, unit: "mg" },
    zinc: { value: 3, unit: "mg" },
    calcium: { value: 260, unit: "mg" },
    vitaminD: { value: 400, unit: "IU" },
    vitaminA: { value: 1665, unit: "IU" },  // 500 mcg RAE × 3.33
    vitaminC: { value: 50, unit: "mg" },
    dha: { value: 100, unit: "mg" },
    sodium: { value: 580, unit: "mg", isUpperLimit: true },
    sugar: { value: 0, unit: "g", isUpperLimit: true },
  },
  "12-23mo": {
    calories: { value: 900, unit: "kcal" },
    protein: { value: 13, unit: "g" },
    fat: { value: 30, unit: "g" },
    carbs: { value: 130, unit: "g" },
    fiber: { value: 14, unit: "g" },
    iron: { value: 7, unit: "mg" },
    zinc: { value: 3, unit: "mg" },
    calcium: { value: 700, unit: "mg" },
    vitaminD: { value: 600, unit: "IU" },
    vitaminA: { value: 1000, unit: "IU" },  // 300 mcg RAE × 3.33
    vitaminC: { value: 15, unit: "mg" },
    dha: { value: 150, unit: "mg" },
    sodium: { value: 800, unit: "mg", isUpperLimit: true },
    sugar: { value: 0, unit: "g", isUpperLimit: true },
  },
  "24-47mo": {
    calories: { value: 1200, unit: "kcal" },
    protein: { value: 13, unit: "g" },
    fat: { value: 35, unit: "g" },
    carbs: { value: 130, unit: "g" },
    fiber: { value: 17, unit: "g" },
    iron: { value: 7, unit: "mg" },
    zinc: { value: 3, unit: "mg" },
    calcium: { value: 700, unit: "mg" },
    vitaminD: { value: 600, unit: "IU" },
    vitaminA: { value: 1000, unit: "IU" },  // 300 mcg RAE × 3.33
    vitaminC: { value: 15, unit: "mg" },
    dha: { value: 150, unit: "mg" },
    sodium: { value: 1200, unit: "mg", isUpperLimit: true },
    sugar: { value: 25, unit: "g", isUpperLimit: true },
  },
  "48mo+": {
    // 4–8 years (USDA DRI single bucket for this age range). Previous label
    // was "4+ years" which incorrectly implied coverage forever.
    calories: { value: 1400, unit: "kcal" },
    protein: { value: 19, unit: "g" },
    fat: { value: 40, unit: "g" },
    carbs: { value: 130, unit: "g" },
    fiber: { value: 20, unit: "g" },
    iron: { value: 10, unit: "mg" },
    zinc: { value: 5, unit: "mg" },
    calcium: { value: 1000, unit: "mg" },
    vitaminD: { value: 600, unit: "IU" },
    vitaminA: { value: 1332, unit: "IU" },  // 400 mcg RAE × 3.33
    vitaminC: { value: 25, unit: "mg" },
    dha: { value: 200, unit: "mg" },
    sodium: { value: 1500, unit: "mg", isUpperLimit: true },
    sugar: { value: 25, unit: "g", isUpperLimit: true },
  },

  // ─── Pre-teen (9–13 years) ─────────────────────────────────────────────
  // USDA DRI 9–13 age bucket. Sex-averaged — the main difference between
  // male and female at this age is ~200 kcal (1800 F / 2000 M). Iron, zinc,
  // calcium, protein are identical. Calcium peaks here (bone-building
  // window) at 1300 mg — the highest requirement in the lifetime outside
  // lactation. Iron stays at 8 mg (pre-menarche); will jump to 15 mg for
  // menstruating girls starting at 14 (out of scope for this iteration).
  "child-9-13yr": {
    calories: { value: 1900, unit: "kcal" },     // averaged F/M
    protein: { value: 34, unit: "g" },
    fat: { value: 65, unit: "g" },
    carbs: { value: 130, unit: "g" },
    fiber: { value: 28, unit: "g" },              // averaged F/M (26/31)
    iron: { value: 8, unit: "mg" },
    zinc: { value: 8, unit: "mg" },
    calcium: { value: 1300, unit: "mg" },         // peak-bone-mass window
    vitaminD: { value: 600, unit: "IU" },
    vitaminA: { value: 2000, unit: "IU" },        // 600 mcg RAE × 3.33
    vitaminC: { value: 45, unit: "mg" },
    dha: { value: 200, unit: "mg" },
    sodium: { value: 2200, unit: "mg", isUpperLimit: true },
    sugar: { value: 25, unit: "g", isUpperLimit: true },
  },

  // ─── Pregnancy ─────────────────────────────────────────────────────────
  // Sources: ACOG, NIH ODS, USDA Dietary Guidelines.
  // All three trimesters share nutrient targets except calories (scales up).
  // Upper limits for pregnancy: caffeine ≤200 mg/day, alcohol zero tolerance.
  "pregnant-T1": {
    calories: { value: 1800, unit: "kcal" },
    protein: { value: 71, unit: "g" },
    fat: { value: 70, unit: "g" },
    carbs: { value: 175, unit: "g" },
    fiber: { value: 28, unit: "g" },
    iron: { value: 27, unit: "mg" },
    zinc: { value: 11, unit: "mg" },
    calcium: { value: 1000, unit: "mg" },
    vitaminD: { value: 600, unit: "IU" },
    vitaminA: { value: 2567, unit: "IU" },  // 770 mcg RAE × 3.33
    vitaminC: { value: 85, unit: "mg" },
    dha: { value: 200, unit: "mg" },
    folate: { value: 600, unit: "mcg" },
    choline: { value: 450, unit: "mg" },
    iodine: { value: 220, unit: "mcg" },
    sodium: { value: 2300, unit: "mg", isUpperLimit: true },
    sugar: { value: 25, unit: "g", isUpperLimit: true },
    caffeine: { value: 200, unit: "mg", isUpperLimit: true },
    alcohol: { value: 0, unit: "g", isUpperLimit: true },
  },
  "pregnant-T2": {
    calories: { value: 2200, unit: "kcal" },  // +340 vs T1
    protein: { value: 71, unit: "g" },
    fat: { value: 75, unit: "g" },
    carbs: { value: 175, unit: "g" },
    fiber: { value: 28, unit: "g" },
    iron: { value: 27, unit: "mg" },
    zinc: { value: 11, unit: "mg" },
    calcium: { value: 1000, unit: "mg" },
    vitaminD: { value: 600, unit: "IU" },
    vitaminA: { value: 2567, unit: "IU" },
    vitaminC: { value: 85, unit: "mg" },
    dha: { value: 200, unit: "mg" },
    folate: { value: 600, unit: "mcg" },
    choline: { value: 450, unit: "mg" },
    iodine: { value: 220, unit: "mcg" },
    sodium: { value: 2300, unit: "mg", isUpperLimit: true },
    sugar: { value: 25, unit: "g", isUpperLimit: true },
    caffeine: { value: 200, unit: "mg", isUpperLimit: true },
    alcohol: { value: 0, unit: "g", isUpperLimit: true },
  },
  "pregnant-T3": {
    calories: { value: 2400, unit: "kcal" },  // +450 vs pre-pregnancy
    protein: { value: 71, unit: "g" },
    fat: { value: 80, unit: "g" },
    carbs: { value: 175, unit: "g" },
    fiber: { value: 28, unit: "g" },
    iron: { value: 27, unit: "mg" },
    zinc: { value: 11, unit: "mg" },
    calcium: { value: 1000, unit: "mg" },
    vitaminD: { value: 600, unit: "IU" },
    vitaminA: { value: 2567, unit: "IU" },
    vitaminC: { value: 85, unit: "mg" },
    dha: { value: 200, unit: "mg" },
    folate: { value: 600, unit: "mcg" },
    choline: { value: 450, unit: "mg" },
    iodine: { value: 220, unit: "mcg" },
    sodium: { value: 2300, unit: "mg", isUpperLimit: true },
    sugar: { value: 25, unit: "g", isUpperLimit: true },
    caffeine: { value: 200, unit: "mg", isUpperLimit: true },
    alcohol: { value: 0, unit: "g", isUpperLimit: true },
  },

  // ─── Breastfeeding ─────────────────────────────────────────────────────
  // Higher iodine than pregnancy (milk transfer); lower iron (no blood loss);
  // more lenient caffeine + alcohol (still advise timing around nursing).
  "lactation-0-6mo": {
    calories: { value: 2300, unit: "kcal" },  // +330-400 over baseline
    protein: { value: 71, unit: "g" },
    fat: { value: 75, unit: "g" },
    carbs: { value: 210, unit: "g" },
    fiber: { value: 29, unit: "g" },
    iron: { value: 9, unit: "mg" },
    zinc: { value: 12, unit: "mg" },
    calcium: { value: 1000, unit: "mg" },
    vitaminD: { value: 600, unit: "IU" },
    vitaminA: { value: 4300, unit: "IU" },  // 1300 mcg RAE × 3.33 (highest lifetime)
    vitaminC: { value: 120, unit: "mg" },
    dha: { value: 200, unit: "mg" },
    folate: { value: 500, unit: "mcg" },
    choline: { value: 550, unit: "mg" },
    iodine: { value: 290, unit: "mcg" },  // HIGHER than pregnancy
    sodium: { value: 2300, unit: "mg", isUpperLimit: true },
    sugar: { value: 25, unit: "g", isUpperLimit: true },
    caffeine: { value: 300, unit: "mg", isUpperLimit: true },
    alcohol: { value: 14, unit: "g", isUpperLimit: true },  // ~1 std drink occasional
  },
  "lactation-7+mo": {
    calories: { value: 2200, unit: "kcal" },  // tapers as baby starts solids
    protein: { value: 71, unit: "g" },
    fat: { value: 73, unit: "g" },
    carbs: { value: 210, unit: "g" },
    fiber: { value: 29, unit: "g" },
    iron: { value: 9, unit: "mg" },
    zinc: { value: 12, unit: "mg" },
    calcium: { value: 1000, unit: "mg" },
    vitaminD: { value: 600, unit: "IU" },
    vitaminA: { value: 4300, unit: "IU" },
    vitaminC: { value: 120, unit: "mg" },
    dha: { value: 200, unit: "mg" },
    folate: { value: 500, unit: "mcg" },
    choline: { value: 550, unit: "mg" },
    iodine: { value: 290, unit: "mcg" },
    sodium: { value: 2300, unit: "mg", isUpperLimit: true },
    sugar: { value: 25, unit: "g", isUpperLimit: true },
    caffeine: { value: 300, unit: "mg", isUpperLimit: true },
    alcohol: { value: 14, unit: "g", isUpperLimit: true },
  },
};

export const NUTRIENT_LABELS: Record<Nutrient, { en: string; "zh-TW": string; emoji: string }> = {
  calories: { en: "Calories", "zh-TW": "熱量", emoji: "🔥" },
  protein: { en: "Protein", "zh-TW": "蛋白質", emoji: "🥩" },
  fat: { en: "Fat", "zh-TW": "脂肪", emoji: "🥑" },
  carbs: { en: "Carbs", "zh-TW": "碳水", emoji: "🍚" },
  fiber: { en: "Fiber", "zh-TW": "纖維", emoji: "🥦" },
  iron: { en: "Iron", "zh-TW": "鐵質", emoji: "⚙️" },
  zinc: { en: "Zinc", "zh-TW": "鋅", emoji: "✨" },
  calcium: { en: "Calcium", "zh-TW": "鈣", emoji: "🦴" },
  vitaminD: { en: "Vitamin D", "zh-TW": "維他命 D", emoji: "☀️" },
  vitaminA: { en: "Vitamin A", "zh-TW": "維他命 A", emoji: "🥕" },
  vitaminC: { en: "Vitamin C", "zh-TW": "維他命 C", emoji: "🍊" },
  dha: { en: "DHA", "zh-TW": "DHA", emoji: "🐟" },
  sodium: { en: "Sodium", "zh-TW": "鈉", emoji: "🧂" },
  sugar: { en: "Added sugar", "zh-TW": "添加糖", emoji: "🍭" },
  // Maternal-life-stage nutrients
  folate: { en: "Folate", "zh-TW": "葉酸", emoji: "🌿" },
  choline: { en: "Choline", "zh-TW": "膽鹼", emoji: "🧠" },
  iodine: { en: "Iodine", "zh-TW": "碘", emoji: "🌊" },
  caffeine: { en: "Caffeine", "zh-TW": "咖啡因", emoji: "☕" },
  alcohol: { en: "Alcohol", "zh-TW": "酒精", emoji: "🚫" },
};

/**
 * Priority nutrients to surface prominently for each life stage.
 * - Infants: AAP "nutrients of concern"
 * - Pregnancy: folate (T1), iron, DHA, calcium, choline, caffeine
 * - Breastfeeding: iodine (highest lifetime), DHA, calcium, choline, caffeine
 */
export const PRIORITY_NUTRIENTS: Record<AgeBucket, Nutrient[]> = {
  // Infant / toddler / child
  "6-8mo": ["iron", "zinc", "protein", "dha", "calories"],
  "9-11mo": ["iron", "zinc", "protein", "dha", "calories"],
  "12-23mo": ["iron", "calcium", "vitaminD", "dha", "fiber"],
  "24-47mo": ["calcium", "vitaminD", "fiber", "iron", "sugar"],
  "48mo+": ["calcium", "vitaminD", "fiber", "iron", "sugar"],
  // Pre-teen (9–13): calcium is peak-of-lifetime at 1300 mg; protein nearly
  // doubles vs 4–8; puberty onset drives zinc + vitamin D needs.
  "child-9-13yr": ["calcium", "protein", "vitaminD", "iron", "fiber"],
  // Pregnancy — folate spotlighted in T1 (neural tube development window)
  "pregnant-T1": ["folate", "iron", "dha", "calcium", "caffeine"],
  "pregnant-T2": ["iron", "dha", "calcium", "choline", "caffeine"],
  "pregnant-T3": ["iron", "dha", "calcium", "choline", "caffeine"],
  // Breastfeeding — iodine is the highest lifetime target (milk transfer)
  "lactation-0-6mo": ["iodine", "dha", "calcium", "choline", "caffeine"],
  "lactation-7+mo": ["iodine", "dha", "calcium", "choline", "caffeine"],
};
