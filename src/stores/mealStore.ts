"use client";

import { create } from "zustand";
import type { AgeBucket } from "@/lib/pediatric/ageBucket";
import type { AllergenKey } from "@/lib/pediatric/allergenRegistry";

export type PortionUnit = "tsp" | "tbsp" | "piece" | "ml" | "g";

export interface FoodItem {
  name: string;
  nameEn?: string;
  portionAmount: number;
  portionUnit: PortionUnit;
  gramsEstimate: number;
  /** Per-item nutrient contribution (already scaled to portion). */
  nutrients: {
    calories?: number;
    protein?: number;
    fat?: number;
    carbs?: number;
    fiber?: number;
    iron?: number;
    zinc?: number;
    calcium?: number;
    vitaminD?: number;
    vitaminA?: number;
    vitaminC?: number;
    dha?: number;
    sodium?: number;
    sugar?: number;
    // Maternal life-stage nutrients (populated only when food actually contains them).
    folate?: number;
    choline?: number;
    iodine?: number;
    caffeine?: number;
    alcohol?: number;
  };
  allergensPresent?: AllergenKey[];
  /** Which data source provided the nutrients. */
  source?: "local-db" | "usda" | "calorieninjas" | "gemini-estimate";
  /** One-sentence benefit for this food at the child's age (zh-TW). */
  benefit?: string;
  /** One-sentence benefit (English). */
  benefitEn?: string;
  /** Risk or caution if any (zh-TW). */
  risk?: string;
  /** Risk or caution (English). */
  riskEn?: string;
  /** Overall suitability for the child's age bucket. */
  suitability?: "excellent" | "good" | "caution" | "avoid";
}

export interface MealRecord {
  id: string;
  childId: string;
  mealType: "breakfast" | "lunch" | "dinner" | "snack";
  /** Age bucket at time of the meal — immutable snapshot so historical reports don't shift. */
  ageBucketAtMeal: AgeBucket;
  foods: FoodItem[];
  /** Aggregated totals across foods — cached for fast dashboards. */
  totals: {
    calories?: number;
    protein?: number;
    fat?: number;
    carbs?: number;
    fiber?: number;
    iron?: number;
    zinc?: number;
    calcium?: number;
    vitaminD?: number;
    vitaminA?: number;
    vitaminC?: number;
    dha?: number;
    sodium?: number;
    sugar?: number;
    // Maternal life-stage nutrients
    folate?: number;
    choline?: number;
    iodine?: number;
    caffeine?: number;
    alcohol?: number;
  };
  date: string;              // "YYYY-MM-DD"
  time: string;              // "HH:MM"
  notes: string;
  /** Child refused to eat this meal (affects intake calc). */
  refused?: boolean;
  /** Names of foods introduced for the first time in this meal. */
  newFoods?: string[];
  /** Thumbnail/full photo as a data URL (small images only). */
  photoDataUrl?: string;
  aiAnalyzed?: boolean;
  createdAt: string;
}

interface MealState {
  meals: MealRecord[];
  loaded: boolean;
  loadFromStorage: () => void;
  addMeal: (meal: Omit<MealRecord, "id" | "createdAt">) => string;
  updateMeal: (id: string, updates: Partial<Omit<MealRecord, "id" | "createdAt">>) => void;
  removeMeal: (id: string) => void;
  getMealsForDate: (childId: string, date: Date) => MealRecord[];
  getMealsForChild: (childId: string) => MealRecord[];
}

const STORAGE_KEY = "nibble_meals";

function loadMeals(): MealRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {
    /* ignore */
  }
  return [];
}

function saveMeals(meals: MealRecord[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(meals));
  } catch {
    /* storage full */
  }
}

function formatDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const useMealStore = create<MealState>((set, get) => ({
  meals: [],
  loaded: false,

  loadFromStorage: () => {
    set({ meals: loadMeals(), loaded: true });
  },

  addMeal: (mealData) => {
    const id = `m_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const meal: MealRecord = {
      ...mealData,
      id,
      createdAt: new Date().toISOString(),
    };
    const updated = [...get().meals, meal];
    set({ meals: updated });
    saveMeals(updated);
    return id;
  },

  updateMeal: (id, updates) => {
    const updated = get().meals.map((m) => (m.id === id ? { ...m, ...updates } : m));
    set({ meals: updated });
    saveMeals(updated);
  },

  removeMeal: (id) => {
    const updated = get().meals.filter((m) => m.id !== id);
    set({ meals: updated });
    saveMeals(updated);
  },

  getMealsForDate: (childId, date) => {
    const dateKey = formatDateKey(date);
    return get()
      .meals.filter((meal) => meal.childId === childId && meal.date === dateKey)
      .sort((a, b) => a.time.localeCompare(b.time));
  },

  getMealsForChild: (childId) => {
    return get()
      .meals.filter((meal) => meal.childId === childId)
      .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  },
}));
