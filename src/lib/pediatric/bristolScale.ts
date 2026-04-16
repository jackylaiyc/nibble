/**
 * Bristol Stool Chart, adapted for baby poop with age-relevant cues.
 * Type 1 = severe constipation, Type 7 = severe diarrhea.
 *
 * Infant poop is notoriously varied (especially breastfed babies),
 * so we surface the scale as *descriptive*, never *diagnostic*.
 * Any red/white/black stool or persistent extremes should route to
 * the pediatrician-referral banner — that is handled in the UI layer,
 * never in this pure-data file.
 */

export type BristolType = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type PoopColor =
  | "yellow"  // normal for breastfed
  | "green"   // iron-fortified formula, leafy greens, or fast transit
  | "brown"   // normal formula/solids
  | "black"   // red flag in non-newborn → pediatrician
  | "red"     // red flag → pediatrician
  | "white";  // red flag → pediatrician

export interface BristolInfo {
  type: BristolType;
  label: { en: string; "zh-TW": string };
  description: { en: string; "zh-TW": string };
  /** 1-3 = on the constipated side, 4 = ideal, 5-7 = on the loose side */
  severity: "constipated" | "ideal" | "loose";
}

export const BRISTOL_SCALE: BristolInfo[] = [
  {
    type: 1,
    label: { en: "Separate hard lumps", "zh-TW": "顆粒狀硬便" },
    description: {
      en: "Hard pellets, hard to pass. Often means constipation.",
      "zh-TW": "像顆粒一樣硬硬的，不易排出，可能便秘。",
    },
    severity: "constipated",
  },
  {
    type: 2,
    label: { en: "Lumpy sausage", "zh-TW": "塊狀硬便" },
    description: {
      en: "Sausage-shaped but lumpy. Mild constipation.",
      "zh-TW": "像香腸但有塊狀，輕微便秘。",
    },
    severity: "constipated",
  },
  {
    type: 3,
    label: { en: "Cracked sausage", "zh-TW": "裂紋便" },
    description: {
      en: "Sausage-shaped with cracks. Still a bit firm.",
      "zh-TW": "香腸狀表面有裂紋，偏硬。",
    },
    severity: "constipated",
  },
  {
    type: 4,
    label: { en: "Smooth sausage", "zh-TW": "理想便" },
    description: {
      en: "Smooth and soft, like a banana. Ideal for toddlers.",
      "zh-TW": "像香蕉一樣光滑柔軟，最理想。",
    },
    severity: "ideal",
  },
  {
    type: 5,
    label: { en: "Soft blobs", "zh-TW": "軟塊狀" },
    description: {
      en: "Soft pieces with clear edges. Common for young babies.",
      "zh-TW": "邊緣清晰的軟塊，嬰兒常見。",
    },
    severity: "loose",
  },
  {
    type: 6,
    label: { en: "Mushy", "zh-TW": "糊狀便" },
    description: {
      en: "Fluffy/mushy with ragged edges. Common for breastfed babies.",
      "zh-TW": "糊狀，邊緣不規則。母乳寶寶常見。",
    },
    severity: "loose",
  },
  {
    type: 7,
    label: { en: "Watery", "zh-TW": "水樣便" },
    description: {
      en: "Liquid, no solid pieces. Can indicate diarrhea if frequent.",
      "zh-TW": "水樣，無固體。頻繁出現可能是腹瀉。",
    },
    severity: "loose",
  },
];

export const POOP_COLORS: Record<PoopColor, {
  label: { en: string; "zh-TW": string };
  swatch: string; // tailwind-friendly hex
  /** True if this color should trigger the pediatrician-referral banner immediately. */
  redFlag: boolean;
}> = {
  yellow: {
    label: { en: "Yellow", "zh-TW": "黃色" },
    swatch: "#F5C04A",
    redFlag: false,
  },
  green: {
    label: { en: "Green", "zh-TW": "綠色" },
    swatch: "#6B9A4C",
    redFlag: false,
  },
  brown: {
    label: { en: "Brown", "zh-TW": "棕色" },
    swatch: "#7A4B28",
    redFlag: false,
  },
  black: {
    label: { en: "Black", "zh-TW": "黑色" },
    swatch: "#1F1F1F",
    redFlag: true,
  },
  red: {
    label: { en: "Red", "zh-TW": "紅色" },
    swatch: "#B8382C",
    redFlag: true,
  },
  white: {
    label: { en: "White/pale", "zh-TW": "白色/淺色" },
    swatch: "#EFE7D6",
    redFlag: true,
  },
};

export function shouldReferToPediatrician(
  type: BristolType,
  color: PoopColor,
): boolean {
  if (POOP_COLORS[color].redFlag) return true;
  if (type === 7) return true; // persistent watery stool — let UI layer debounce by frequency
  return false;
}
