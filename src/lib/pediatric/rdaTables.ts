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
  | "sugar";       // g (upper limit, added sugar)

export interface RdaTarget {
  value: number;
  unit: string;
  /** If true, this is an upper-limit target (less is better). */
  isUpperLimit?: boolean;
}

export type RdaRow = Record<Nutrient, RdaTarget>;

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
};

/**
 * Priority nutrients to surface prominently for each age bucket.
 * Based on AAP "nutrients of concern" for infants and toddlers.
 */
export const PRIORITY_NUTRIENTS: Record<AgeBucket, Nutrient[]> = {
  "6-8mo": ["iron", "zinc", "protein", "dha", "calories"],
  "9-11mo": ["iron", "zinc", "protein", "dha", "calories"],
  "12-23mo": ["iron", "calcium", "vitaminD", "dha", "fiber"],
  "24-47mo": ["calcium", "vitaminD", "fiber", "iron", "sugar"],
  "48mo+": ["calcium", "vitaminD", "fiber", "iron", "sugar"],
};
