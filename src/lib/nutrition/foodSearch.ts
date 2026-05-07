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
  // ─── Grains, cereals, starches ──────────────────────────────────────
  ["rice", "米飯", "米饭", "白米", "ご飯"],
  ["brown rice", "糙米", "玄米"],
  ["sticky rice", "glutinous rice", "糯米", "もち米"],
  ["congee", "porridge", "粥", "稀飯", "稀饭", "おかゆ"],
  ["oatmeal", "oats", "燕麥", "燕麦", "オートミール"],
  ["wheat", "小麥", "小麦"],
  ["barley", "大麥", "大麦"],
  ["quinoa", "藜麥", "藜麦", "キヌア"],
  ["corn", "玉米", "とうもろこし"],
  ["bread", "麵包", "面包", "パン"],
  ["toast", "吐司", "トースト"],
  ["pasta", "spaghetti", "義大利麵", "意大利面", "意面", "パスタ", "スパゲッティ"],
  ["noodle", "noodles", "麵條", "面条", "麺"],
  ["udon", "烏龍麵", "乌冬", "うどん"],
  ["ramen", "拉麵", "拉面", "ラーメン"],
  ["dumpling", "餃子", "饺子", "ぎょうざ"],
  ["bun", "包子", "饅頭", "馒头"],
  ["potato", "馬鈴薯", "土豆", "じゃがいも"],
  ["sweet potato", "yam", "地瓜", "番薯", "紅薯", "红薯", "さつまいも"],
  ["taro", "芋頭", "芋头", "里芋"],

  // ─── Protein: meat ─────────────────────────────────────────────────
  ["chicken", "雞肉", "鸡肉", "鶏肉"],
  ["chicken breast", "雞胸", "鸡胸", "鶏胸"],
  ["chicken thigh", "雞腿", "鸡腿", "鶏もも"],
  ["beef", "牛肉"],
  ["ground beef", "minced beef", "牛絞肉", "牛绞肉"],
  ["pork", "豬肉", "猪肉", "豚肉"],
  ["pork belly", "五花肉", "三層肉", "三层肉"],
  ["lamb", "mutton", "羊肉", "ラム"],
  ["duck", "鴨肉", "鸭肉", "鴨", "鸭", "あひる"],
  ["turkey", "火雞", "火鸡", "七面鳥"],
  ["bacon", "培根", "ベーコン"],
  ["ham", "火腿", "ハム"],
  ["sausage", "香腸", "香肠", "ソーセージ"],
  ["liver", "肝", "レバー"],

  // ─── Protein: seafood ──────────────────────────────────────────────
  ["fish", "魚", "鱼"],
  ["salmon", "鮭魚", "三文鱼", "サーモン"],
  ["tuna", "鮪魚", "金枪鱼", "ツナ"],
  ["cod", "鱈魚", "鳕鱼", "タラ"],
  ["mackerel", "鯖魚", "鲭鱼", "サバ"],
  ["sardine", "沙丁魚", "沙丁鱼", "イワシ"],
  ["shrimp", "prawn", "蝦", "虾", "えび"],
  ["crab", "螃蟹", "蟹", "カニ"],
  ["lobster", "龍蝦", "龙虾", "ロブスター"],
  ["scallop", "扇貝", "扇贝", "ホタテ"],
  ["squid", "魷魚", "鱿鱼", "イカ"],
  ["octopus", "章魚", "章鱼", "タコ"],
  ["clam", "蛤蜊", "あさり"],
  ["oyster", "牡蠣", "牡蛎"],

  // ─── Protein: plant-based ──────────────────────────────────────────
  ["tofu", "豆腐"],
  ["soy", "soybean", "黃豆", "黄豆", "大豆"],
  ["soy milk", "豆漿", "豆浆", "豆乳"],
  ["edamame", "毛豆", "枝豆"],
  ["lentil", "扁豆", "レンズ豆"],
  ["chickpea", "garbanzo", "鷹嘴豆", "鹰嘴豆", "ひよこ豆"],
  ["black bean", "黑豆"],
  ["red bean", "紅豆", "红豆", "あずき"],
  ["mung bean", "綠豆", "绿豆"],
  ["kidney bean", "腰豆", "芸豆"],

  // ─── Eggs & dairy ──────────────────────────────────────────────────
  ["egg", "eggs", "雞蛋", "鸡蛋", "卵"],
  ["egg yolk", "蛋黃", "蛋黄"],
  ["egg white", "蛋白"],
  ["milk", "牛奶", "牛乳"],
  ["yogurt", "yoghurt", "酸奶", "優格", "優酪乳", "ヨーグルト"],
  ["cheese", "起司", "奶酪", "乳酪", "チーズ"],
  ["butter", "黃油", "黄油", "バター"],
  ["cream", "鮮奶油", "鲜奶油", "クリーム"],
  ["ice cream", "冰淇淋", "アイスクリーム"],
  ["whey", "乳清"],

  // ─── Fruit ─────────────────────────────────────────────────────────
  ["banana", "香蕉", "バナナ"],
  ["apple", "蘋果", "苹果", "りんご"],
  ["orange", "橙", "橘子", "柳橙", "オレンジ"],
  ["mandarin", "tangerine", "橘", "蜜柑", "みかん"],
  ["lemon", "檸檬", "柠檬", "レモン"],
  ["lime", "萊姆", "莱姆", "ライム"],
  ["grapefruit", "葡萄柚", "グレープフルーツ"],
  ["grape", "葡萄"],
  ["watermelon", "西瓜"],
  ["cantaloupe", "melon", "honeydew", "哈密瓜", "甜瓜", "メロン"],
  ["strawberry", "草莓", "苺", "イチゴ"],
  ["blueberry", "藍莓", "蓝莓", "ブルーベリー"],
  ["raspberry", "覆盆子", "ラズベリー"],
  ["blackberry", "黑莓", "ブラックベリー"],
  ["cherry", "櫻桃", "樱桃", "さくらんぼ"],
  ["peach", "桃子", "桃"],
  ["pear", "梨", "ナシ"],
  ["plum", "李子", "梅"],
  ["pineapple", "鳳梨", "凤梨", "菠蘿", "菠萝", "パイナップル"],
  ["mango", "芒果", "マンゴー"],
  ["papaya", "木瓜", "パパイヤ"],
  ["kiwi", "kiwifruit", "奇異果", "猕猴桃", "キウイ"],
  ["avocado", "酪梨", "牛油果", "アボカド"],
  ["pomegranate", "石榴", "ザクロ"],
  ["guava", "番石榴", "芭樂", "グアバ"],
  ["coconut", "椰子", "ココナッツ"],
  ["fig", "無花果", "无花果", "イチジク"],
  ["dragon fruit", "pitaya", "火龍果", "火龙果", "ドラゴンフルーツ"],
  ["lychee", "litchi", "荔枝", "ライチ"],
  ["longan", "龍眼", "龙眼"],
  ["persimmon", "柿子", "柿"],
  ["dates", "棗", "枣", "デーツ"],
  ["raisin", "葡萄乾", "葡萄干", "レーズン"],

  // ─── Vegetables ────────────────────────────────────────────────────
  ["broccoli", "西蘭花", "西兰花", "ブロッコリー"],
  ["cauliflower", "花椰菜", "白花菜", "カリフラワー"],
  ["cabbage", "高麗菜", "包菜", "圓白菜", "圆白菜", "キャベツ"],
  ["napa cabbage", "chinese cabbage", "大白菜"],
  ["bok choy", "pak choi", "青江菜", "小白菜", "青梗菜"],
  ["lettuce", "生菜", "萵苣", "莴苣", "レタス"],
  ["spinach", "菠菜", "ほうれん草"],
  ["kale", "羽衣甘藍", "羽衣甘蓝", "ケール"],
  ["arugula", "rocket", "芝麻菜", "ルッコラ"],
  ["celery", "芹菜", "セロリ"],
  ["cucumber", "小黃瓜", "黄瓜", "きゅうり"],
  ["zucchini", "courgette", "櫛瓜", "西葫芦", "ズッキーニ"],
  ["eggplant", "aubergine", "茄子", "なす"],
  ["bell pepper", "capsicum", "彩椒", "甜椒", "ピーマン", "パプリカ"],
  ["chili pepper", "辣椒", "唐辛子"],
  ["tomato", "番茄", "西紅柿", "西红柿", "トマト"],
  ["onion", "洋蔥", "洋葱", "玉ねぎ"],
  ["garlic", "大蒜", "蒜", "にんにく"],
  ["ginger", "薑", "姜", "生姜"],
  ["scallion", "spring onion", "green onion", "蔥", "葱", "ねぎ"],
  ["leek", "韭蔥", "韭葱", "リーキ"],
  ["chives", "韭菜", "ニラ"],
  ["carrot", "胡蘿蔔", "胡萝卜", "にんじん"],
  ["radish", "daikon", "白蘿蔔", "白萝卜", "大根"],
  ["beetroot", "beet", "甜菜", "ビート"],
  ["asparagus", "蘆筍", "芦笋", "アスパラ"],
  ["mushroom", "蘑菇", "茸", "きのこ"],
  ["shiitake", "香菇", "椎茸"],
  ["enoki", "金針菇", "金针菇", "えのき"],
  ["pumpkin", "squash", "南瓜", "かぼちゃ"],
  ["okra", "秋葵", "オクラ"],
  ["bitter melon", "苦瓜", "ゴーヤ"],
  ["lotus root", "蓮藕", "莲藕", "蓮根"],
  ["bamboo shoot", "竹筍", "竹笋", "たけのこ"],
  ["water spinach", "kangkong", "空心菜", "通菜"],
  ["seaweed", "海帶", "海带", "海藻"],
  ["nori", "海苔", "のり"],
  ["wakame", "裙帶菜", "裙带菜", "わかめ"],
  ["pea", "peas", "豌豆", "えんどう"],
  ["green bean", "四季豆", "敏豆", "いんげん"],
  ["bean sprout", "豆芽", "もやし"],

  // ─── Nuts & seeds ──────────────────────────────────────────────────
  ["peanut", "花生", "ピーナッツ", "落花生"],
  ["almond", "杏仁", "アーモンド"],
  ["cashew", "腰果", "カシューナッツ"],
  ["walnut", "核桃", "クルミ"],
  ["pecan", "胡桃", "ピーカン"],
  ["pistachio", "開心果", "开心果", "ピスタチオ"],
  ["macadamia", "夏威夷果", "マカダミア"],
  ["chestnut", "栗子", "栗"],
  ["sesame", "芝麻", "胡麻", "ごま"],
  ["chia seed", "奇亞籽", "奇亚籽", "チアシード"],
  ["flax seed", "linseed", "亞麻籽", "亚麻籽"],
  ["pumpkin seed", "南瓜籽"],
  ["sunflower seed", "葵花籽", "ひまわりの種"],

  // ─── Pantry & condiments ───────────────────────────────────────────
  ["honey", "蜂蜜", "はちみつ"],
  ["sugar", "糖", "砂糖"],
  ["salt", "鹽", "盐", "塩"],
  ["soy sauce", "醬油", "酱油", "醤油"],
  ["vinegar", "醋", "酢"],
  ["olive oil", "橄欖油", "橄榄油", "オリーブオイル"],
  ["sesame oil", "麻油", "ごま油"],
  ["coconut oil", "椰子油", "ココナッツオイル"],
  ["miso", "味噌", "みそ"],
  ["mayonnaise", "美乃滋", "蛋黃醬", "蛋黄酱", "マヨネーズ"],
  ["ketchup", "番茄醬", "番茄酱", "ケチャップ"],
  ["jam", "果醬", "果酱", "ジャム"],
  ["chocolate", "巧克力", "チョコレート"],

  // ─── Common dishes & prepared foods ────────────────────────────────
  ["soup", "湯", "汤", "スープ"],
  ["fried rice", "炒飯", "炒饭", "チャーハン"],
  ["sushi", "壽司", "寿司", "鮨"],
  ["tempura", "天婦羅", "天妇罗", "天ぷら"],
  ["curry", "咖哩", "咖喱", "カレー"],
  ["pizza", "披薩", "比萨", "ピザ"],
  ["sandwich", "三明治", "サンドイッチ"],
  ["hamburger", "漢堡", "汉堡", "ハンバーガー"],
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

  // Run script conversion on EVERY variant currently in the set, not
  // just the raw query. This way synonym-table entries get expanded
  // across both scripts too — e.g. the table contains 鳳梨 (Traditional)
  // and OpenCC fans it out to 凤梨 (Simplified, which is what the
  // China DB actually stores).
  for (const v of Array.from(variants)) {
    if (/[一-鿿]/.test(v)) {
      try {
        variants.add(t2s(v));
        variants.add(s2t(v));
      } catch {
        // OpenCC throws on extremely long input — ignore, fall back to
        // the variants we already have.
      }
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
