import chinaFoods from "@/data/china-food-composition.json";
import japanFoods from "@/data/japan-food-composition.json";

interface NutritionResult {
  source: "china" | "japan";
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  cholesterol: number | null;
  vitaminA: number | null;
  vitaminC: number | null;
  vitaminE: number | null;
  vitaminB1: number | null;
  vitaminB2: number | null;
  niacin: number | null;
  calcium: number | null;
  iron: number | null;
  zinc: number | null;
  selenium: number | null;
  potassium: number | null;
  sodium: number | null;
  magnesium: number | null;
  phosphorus: number | null;
  copper: number | null;
  manganese: number | null;
}

function parseNum(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  const s = String(val).replace(/—|－|Tr|tr|\(|\)|（|）/g, "").trim();
  if (s === "" || s === "-" || s === "…") return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function fuzzyMatch(query: string, target: string): number {
  const q = query.toLowerCase().trim();
  const t = target.toLowerCase().trim();

  // Exact match
  if (q === t) return 1.0;

  // Target contains query
  if (t.includes(q)) return 0.9;

  // Query contains target
  if (q.includes(t)) return 0.8;

  // Character overlap ratio
  const qChars = new Set(q);
  const tChars = new Set(t);
  let overlap = 0;
  for (const c of qChars) {
    if (tChars.has(c)) overlap++;
  }
  const ratio = overlap / Math.max(qChars.size, tChars.size);
  return ratio > 0.5 ? ratio * 0.7 : 0;
}

function searchChina(foodName: string): NutritionResult | null {
  let bestMatch: (typeof chinaFoods)[number] | null = null;
  let bestScore = 0;

  for (const food of chinaFoods) {
    const score = fuzzyMatch(foodName, food.foodName);
    if (score > bestScore && score >= 0.5) {
      bestScore = score;
      bestMatch = food;
    }
  }

  if (!bestMatch) return null;

  return {
    source: "china",
    name: bestMatch.foodName,
    calories: parseNum(bestMatch.energyKCal) ?? 0,
    protein: parseNum(bestMatch.protein) ?? 0,
    carbs: parseNum(bestMatch.CHO) ?? 0,
    fat: parseNum(bestMatch.fat) ?? 0,
    fiber: parseNum(bestMatch.dietaryFiber) ?? 0,
    cholesterol: parseNum(bestMatch.cholesterol),
    vitaminA: parseNum(bestMatch.vitaminA),
    vitaminC: parseNum(bestMatch.vitaminC),
    vitaminE: parseNum(bestMatch.vitaminETotal),
    vitaminB1: parseNum(bestMatch.thiamin),
    vitaminB2: parseNum(bestMatch.riboflavin),
    niacin: parseNum(bestMatch.niacin),
    calcium: parseNum(bestMatch.Ca),
    iron: parseNum(bestMatch.Fe),
    zinc: parseNum(bestMatch.Zn),
    selenium: parseNum(bestMatch.Se),
    potassium: parseNum(bestMatch.K),
    sodium: parseNum(bestMatch.Na),
    magnesium: parseNum(bestMatch.Mg),
    phosphorus: parseNum(bestMatch.P),
    copper: parseNum(bestMatch.Cu),
    manganese: parseNum(bestMatch.Mn),
  };
}

function searchJapan(foodName: string): NutritionResult | null {
  let bestMatch: (typeof japanFoods)[number] | null = null;
  let bestScore = 0;

  for (const food of japanFoods) {
    const score = fuzzyMatch(foodName, food.foodName);
    if (score > bestScore && score >= 0.5) {
      bestScore = score;
      bestMatch = food;
    }
  }

  if (!bestMatch) return null;

  return {
    source: "japan",
    name: bestMatch.foodName,
    calories: parseNum(bestMatch.enercKcal) ?? 0,
    protein: parseNum(bestMatch.prot) ?? 0,
    carbs: parseNum(bestMatch.chocdf) ?? 0,
    fat: parseNum(bestMatch.fat) ?? 0,
    fiber: parseNum(bestMatch.fib) ?? 0,
    cholesterol: parseNum(bestMatch.chole),
    vitaminA: parseNum(bestMatch.vitaRae),
    vitaminC: parseNum(bestMatch.vitC),
    vitaminE: parseNum(bestMatch.tocphA),
    vitaminB1: parseNum(bestMatch.thia),
    vitaminB2: parseNum(bestMatch.ribf),
    niacin: parseNum(bestMatch.nia),
    calcium: parseNum(bestMatch.ca),
    iron: parseNum(bestMatch.fe),
    zinc: parseNum(bestMatch.zn),
    selenium: parseNum(bestMatch.se),
    potassium: parseNum(bestMatch.k),
    sodium: parseNum(bestMatch.na),
    magnesium: parseNum(bestMatch.mg),
    phosphorus: parseNum(bestMatch.p),
    copper: parseNum(bestMatch.cu),
    manganese: parseNum(bestMatch.mn),
  };
}

/**
 * Search local food databases (China + Japan) for nutrition data.
 * Returns per-100g values.
 */
export function searchLocalFoodDb(foodNameChinese: string, foodNameEnglish: string): NutritionResult | null {
  // Try Chinese name against China DB first
  const chinaResult = searchChina(foodNameChinese);
  if (chinaResult) return chinaResult;

  // Try Japanese DB (many Chinese food names overlap with Japanese kanji)
  const japanResult = searchJapan(foodNameChinese);
  if (japanResult) return japanResult;

  // Try English name against Japan DB (some entries have English-adjacent names)
  const japanEnResult = searchJapan(foodNameEnglish);
  if (japanEnResult) return japanEnResult;

  return null;
}
