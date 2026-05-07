import chinaFoods from "@/data/china-food-composition.json";
import japanFoods from "@/data/japan-food-composition.json";
import * as OpenCC from "opencc-js";
import type { FoodItem, PortionUnit } from "@/stores/mealStore";

/**
 * Text-search the local food DBs (China + Japan) and return the top N
 * matches, scored by a simple fuzzy match on the Chinese food name.
 *
 * Returns per-100g nutrition plus a factory for scaling to any portion.
 * Consumed by the manual search + quick-add UI.
 *
 * The China DB stores names in SIMPLIFIED Chinese, the Japan DB in
 * Japanese script. Most of our users type in TRADITIONAL Chinese (zh-TW
 * locale) or English. Without help, queries like "雞肉" silently miss
 * the simplified-script row "鸡肉" and English queries miss everything.
 * To bridge that gap, expandQuery() converts each query into all
 * plausible variants — t→s + s→t conversion via OpenCC, plus a small
 * English→CJK alias map for the foods we advertise on the placeholder.
 */

export interface FoodSearchResult {
  /** Stable-ish identifier for React keys: "cn-109001" / "jp-01010" */
  id: string;
  /** Chinese display name (always present). */
  name: string;
  /** Score from the fuzzy matcher, exposed for debugging — not rendered. */
  score: number;
  source: "china" | "japan";
  /** Per-100g values already mapped to our FoodItem.nutrients shape. */
  per100g: FoodItem["nutrients"];
}

// ─── query expansion ───────────────────────────────────────────────────────

// OpenCC converters — built once at module load. The "tw" preset is
// Taiwan-flavoured Traditional, "cn" is mainland Simplified. We also
// run the t→s/s→t pair so queries from either side find the other.
const t2s = OpenCC.Converter({ from: "tw", to: "cn" });
const s2t = OpenCC.Converter({ from: "cn", to: "tw" });

/**
 * Bidirectional synonym groups. If the query matches ANY member of a
 * group (case-insensitive substring or exact), every other member is
 * added to the search variants. This solves three failure modes the
 * naïve OpenCC-only path can't:
 *
 *   1. English → CJK ("yogurt" → 酸奶 / 優格 / ヨーグルト)
 *   2. Traditional ↔ different-Simplified-word (優格 ↔ 酸奶 — these
 *      are LEXICALLY different, not just script-different, so OpenCC
 *      can't bridge them)
 *   3. Locale-specific naming (Mainland 土豆 vs Taiwan 馬鈴薯 — both
 *      "potato"; the t→s/s→t conversion just produces the other
 *      spelling, not the other word)
 *
 * Each group should use COMPOUND forms (米飯, not bare 米) so a single
 * common character doesn't flood results with unrelated foods.
 */
const FOOD_SYNONYMS: ReadonlyArray<readonly string[]> = [
  // Grains & cereals
  ["rice", "米飯", "米饭", "白米", "ご飯"],
  ["oatmeal", "燕麥", "燕麦", "オートミール"],
  ["bread", "麵包", "面包", "パン"],
  ["pasta", "義大利麵", "意面", "パスタ"],
  ["noodle", "noodles", "麵條", "面条", "麺"],
  // Protein
  ["egg", "eggs", "雞蛋", "鸡蛋", "卵"],
  ["chicken", "雞肉", "鸡肉", "鶏肉"],
  ["beef", "牛肉"],
  ["pork", "豬肉", "猪肉", "豚肉"],
  ["fish", "魚", "鱼"],
  ["salmon", "鮭魚", "三文鱼", "サーモン"],
  ["tuna", "鮪魚", "金枪鱼", "ツナ"],
  ["shrimp", "蝦", "虾", "えび"],
  ["tofu", "豆腐"],
  // Dairy
  ["milk", "牛奶", "牛乳"],
  ["yogurt", "yoghurt", "酸奶", "優格", "優酪乳", "ヨーグルト"],
  ["cheese", "起司", "奶酪", "チーズ"],
  ["butter", "奶油", "黄油", "バター"],
  // Fruit
  ["banana", "香蕉", "バナナ"],
  ["apple", "蘋果", "苹果", "りんご"],
  ["orange", "橙", "橘子", "オレンジ"],
  ["strawberry", "草莓", "苺", "イチゴ"],
  ["blueberry", "藍莓", "蓝莓", "ブルーベリー"],
  ["avocado", "酪梨", "牛油果", "アボカド"],
  ["pear", "梨", "ナシ"],
  ["grape", "葡萄"],
  ["watermelon", "西瓜"],
  // Vegetables
  ["broccoli", "西蘭花", "西兰花", "ブロッコリー"],
  ["carrot", "胡蘿蔔", "胡萝卜", "にんじん"],
  ["spinach", "菠菜", "ほうれん草"],
  ["tomato", "番茄", "西紅柿", "西红柿", "トマト"],
  ["potato", "馬鈴薯", "土豆", "じゃがいも"],
  ["sweet potato", "地瓜", "番薯", "紅薯", "红薯", "さつまいも"],
  ["cucumber", "小黃瓜", "黄瓜", "きゅうり"],
  ["pumpkin", "南瓜", "かぼちゃ"],
  ["cabbage", "高麗菜", "包菜", "キャベツ"],
  // Pantry
  ["honey", "蜂蜜", "はちみつ"],
  ["peanut", "花生", "ピーナッツ"],
  ["almond", "杏仁", "アーモンド"],
];

/**
 * Expand a raw query into every plausible script + synonym variant
 * the local DBs might carry. Always includes the original query so
 * exact matches still win.
 */
function expandQuery(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const variants = new Set<string>([trimmed]);
  const lower = trimmed.toLowerCase();

  // Synonym groups — if any member matches the query (substring either
  // way), every other member becomes a search candidate.
  for (const group of FOOD_SYNONYMS) {
    const matched = group.some((member) => {
      const m = member.toLowerCase();
      return lower === m || lower.includes(m) || trimmed.includes(member);
    });
    if (matched) {
      for (const v of group) variants.add(v);
    }
  }

  // Chinese ↔ both directions. Cheap (in-process Map lookups) so we
  // run it on every query that contains a CJK character.
  if (/[一-鿿]/.test(trimmed)) {
    try {
      variants.add(t2s(trimmed));
      variants.add(s2t(trimmed));
    } catch {
      // OpenCC throws on extremely long input — ignore, fall back to
      // the original query only.
    }
  }

  return Array.from(variants);
}

// ─── number parsing + fuzzy match (same as localFoodDb.ts) ──────────────────

function parseNum(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  const s = String(val).replace(/—|－|Tr|tr|\(|\)|（|）/g, "").trim();
  if (s === "" || s === "-" || s === "…") return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase().trim();
  const t = target.toLowerCase().trim();
  if (!q) return 0;
  if (q === t) return 1.0;
  if (t.includes(q)) return 0.9;
  if (q.includes(t)) return 0.8;
  const qChars = new Set(q);
  const tChars = new Set(t);
  let overlap = 0;
  for (const c of qChars) if (tChars.has(c)) overlap++;
  const ratio = overlap / Math.max(qChars.size, tChars.size);
  return ratio > 0.5 ? ratio * 0.7 : 0;
}

// ─── nutrient mapping ───────────────────────────────────────────────────────

// China DB: vitaminA in mcg RAE; Fe/Zn/Ca in mg; Na in mg; vitaminC in mg.
type ChinaRow = (typeof chinaFoods)[number];
function mapChinaPer100g(row: ChinaRow): FoodItem["nutrients"] {
  const vitA_mcg = parseNum(row.vitaminA);
  return {
    calories: parseNum(row.energyKCal) ?? undefined,
    protein: parseNum(row.protein) ?? undefined,
    fat: parseNum(row.fat) ?? undefined,
    carbs: parseNum(row.CHO) ?? undefined,
    fiber: parseNum(row.dietaryFiber) ?? undefined,
    iron: parseNum(row.Fe) ?? undefined,
    zinc: parseNum(row.Zn) ?? undefined,
    calcium: parseNum(row.Ca) ?? undefined,
    sodium: parseNum(row.Na) ?? undefined,
    vitaminA: vitA_mcg != null ? round(vitA_mcg * 3.33) : undefined, // mcg RAE → IU
    vitaminC: parseNum(row.vitaminC) ?? undefined,
  };
}

// Japan DB: vitaRae in mcg RAE; ca/fe/zn in mg; na in mg.
type JapanRow = (typeof japanFoods)[number];
function mapJapanPer100g(row: JapanRow): FoodItem["nutrients"] {
  const vitA_mcg = parseNum(row.vitaRae);
  return {
    calories: parseNum(row.enercKcal) ?? undefined,
    protein: parseNum(row.prot) ?? undefined,
    fat: parseNum(row.fat) ?? undefined,
    carbs: parseNum(row.chocdf) ?? undefined,
    fiber: parseNum(row.fib) ?? undefined,
    iron: parseNum(row.fe) ?? undefined,
    zinc: parseNum(row.zn) ?? undefined,
    calcium: parseNum(row.ca) ?? undefined,
    sodium: parseNum(row.na) ?? undefined,
    vitaminA: vitA_mcg != null ? round(vitA_mcg * 3.33) : undefined,
    vitaminC: parseNum(row.vitC) ?? undefined,
  };
}

// ─── the search function ────────────────────────────────────────────────────

export function searchAllFoods(query: string, limit = 10): FoodSearchResult[] {
  const variants = expandQuery(query);
  if (variants.length === 0) return [];

  // For each row, take the MAX score across all query variants — that
  // way "雞肉" (Traditional) finds "鸡肉" (Simplified) via the t→s
  // variant, and "chicken" finds both via the English alias.
  function bestScore(target: string): number {
    let best = 0;
    for (const v of variants) {
      const s = fuzzyScore(v, target);
      if (s > best) best = s;
      if (best >= 0.9) return best; // can't beat exact-substring match
    }
    return best;
  }

  const results: FoodSearchResult[] = [];

  for (const row of chinaFoods) {
    const score = bestScore(row.foodName);
    if (score >= 0.5) {
      results.push({
        id: `cn-${row.foodCode}`,
        name: row.foodName,
        score,
        source: "china",
        per100g: mapChinaPer100g(row),
      });
    }
  }

  for (const row of japanFoods) {
    const score = bestScore(row.foodName);
    if (score >= 0.5) {
      results.push({
        id: `jp-${(row as { foodCode?: string }).foodCode ?? row.foodName}`,
        name: row.foodName,
        score,
        source: "japan",
        per100g: mapJapanPer100g(row),
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

// ─── portion scaling ────────────────────────────────────────────────────────

/**
 * Build a FoodItem from a search result + a chosen portion size in grams.
 * Scales every numeric nutrient by grams/100.
 */
export function resultToFoodItem(
  result: FoodSearchResult,
  portionAmount: number,
  portionUnit: PortionUnit,
  gramsEstimate: number,
): FoodItem {
  const scale = gramsEstimate / 100;
  const nutrients: FoodItem["nutrients"] = {};
  for (const k of Object.keys(result.per100g) as (keyof FoodItem["nutrients"])[]) {
    const v = result.per100g[k];
    if (typeof v === "number" && Number.isFinite(v)) {
      nutrients[k] = round(v * scale);
    }
  }
  return {
    name: result.name,
    nameEn: result.name, // local DBs don't have English names; use Chinese as fallback
    portionAmount,
    portionUnit,
    gramsEstimate,
    nutrients,
    allergensPresent: [],
    source: result.source === "china" ? "local-db" : "local-db",
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
