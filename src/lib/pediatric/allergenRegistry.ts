/**
 * Top-9 FDA allergens plus HK/TW/SG regional allergens.
 * Used by the onboarding flow (pre-fill known allergens) and the
 * Gemini vision prompt (flag allergens present in plate photos).
 */

export type AllergenKey =
  // Top-9 FDA
  | "milk"
  | "egg"
  | "peanut"
  | "treeNut"
  | "wheat"
  | "soy"
  | "fish"
  | "shellfish"
  | "sesame"
  // Regional
  | "shrimp"
  | "crab"
  | "buckwheat"
  | "celery";

export interface AllergenInfo {
  key: AllergenKey;
  label: { en: string; "zh-TW": string };
  emoji: string;
  /** AAP recommends introducing at ~6 months to reduce lifetime allergy risk. */
  introduceEarly: boolean;
  /** Regional emphasis (Hong Kong / Taiwan / Singapore commonly reported). */
  regional: boolean;
}

export const ALLERGENS: AllergenInfo[] = [
  { key: "milk",      label: { en: "Milk",         "zh-TW": "牛奶" },   emoji: "🥛", introduceEarly: true,  regional: false },
  { key: "egg",       label: { en: "Egg",          "zh-TW": "雞蛋" },   emoji: "🥚", introduceEarly: true,  regional: false },
  { key: "peanut",    label: { en: "Peanut",       "zh-TW": "花生" },   emoji: "🥜", introduceEarly: true,  regional: false },
  { key: "treeNut",   label: { en: "Tree nut",     "zh-TW": "堅果" },   emoji: "🌰", introduceEarly: true,  regional: false },
  { key: "wheat",     label: { en: "Wheat",        "zh-TW": "小麥" },   emoji: "🌾", introduceEarly: true,  regional: false },
  { key: "soy",       label: { en: "Soy",          "zh-TW": "大豆" },   emoji: "🫘", introduceEarly: true,  regional: false },
  { key: "fish",      label: { en: "Fish",         "zh-TW": "魚類" },   emoji: "🐟", introduceEarly: true,  regional: false },
  { key: "shellfish", label: { en: "Shellfish",    "zh-TW": "貝類" },   emoji: "🦪", introduceEarly: false, regional: false },
  { key: "sesame",    label: { en: "Sesame",       "zh-TW": "芝麻" },   emoji: "🌱", introduceEarly: true,  regional: false },
  { key: "shrimp",    label: { en: "Shrimp",       "zh-TW": "蝦" },     emoji: "🦐", introduceEarly: false, regional: true  },
  { key: "crab",      label: { en: "Crab",         "zh-TW": "蟹" },     emoji: "🦀", introduceEarly: false, regional: true  },
  { key: "buckwheat", label: { en: "Buckwheat",    "zh-TW": "蕎麥" },   emoji: "🍜", introduceEarly: false, regional: true  },
  { key: "celery",    label: { en: "Celery",       "zh-TW": "芹菜" },   emoji: "🥬", introduceEarly: false, regional: true  },
];

export function getAllergen(key: AllergenKey): AllergenInfo | undefined {
  return ALLERGENS.find((a) => a.key === key);
}
