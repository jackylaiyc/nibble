"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, Link } from "@/i18n/navigation";
import { useChildProfileStore } from "@/stores/childProfileStore";
import { useMealStore, type FoodItem, type PortionUnit } from "@/stores/mealStore";
import { ageInfoFromDob } from "@/lib/pediatric/ageBucket";
import {
  getAllergen,
  type AllergenKey,
} from "@/lib/pediatric/allergenRegistry";
import {
  NUTRIENT_LABELS,
  PRIORITY_NUTRIENTS,
  RDA,
  type Nutrient,
} from "@/lib/pediatric/rdaTables";
import {
  computeCoverage,
  type NutrientTotals,
} from "@/lib/pediatric/rdaGapAnalysis";
import { RDARing } from "@/components/pediatric/RDARing";
import { DISCLAIMERS } from "@/lib/pediatric/disclaimers";
import { ShareCardButton } from "@/components/share/ShareCardButton";
import { useSubscriptionStore } from "@/stores/subscriptionStore";
import { useUsageStore } from "@/stores/usageStore";
import { limitsFor } from "@/lib/pricing/plans";
import { PaywallModal } from "@/components/paywall/PaywallModal";

/**
 * Plate scan page — Nibble's hero feature.
 *
 * Flow:
 *   1. Capture: <input capture="environment"> or gallery pick.
 *   2. Submit to /api/ai/nutrition with base64 image + child context.
 *   3. Render foods list + RDA coverage rings (this meal's contribution
 *      to the child's daily targets) + flagged-allergen banner when
 *      Gemini finds one the parent already knows about.
 *   4. Caregiver chooses a meal type and saves → mealStore.addMeal(),
 *      redirect back to /app.
 *
 * The route itself stays fully client-side: no auth required in MVP,
 * state lives in Zustand + localStorage until Supabase is wired up.
 */

type MealType = "breakfast" | "lunch" | "dinner" | "snack";

interface NutritionApiResponse {
  foods: Array<{
    name: string;
    nameEn: string;
    portionAmount: number;
    portionUnit: PortionUnit;
    gramsEstimate: number;
    nutrients: NutrientTotals;
    allergensPresent: AllergenKey[];
    source: FoodItem["source"];
  }>;
  totals: NutrientTotals;
}

interface ApiErrorPayload {
  error: string;
  code?: "NO_FOODS" | "FACE_DETECTED" | "BAD_INPUT" | "GEMINI_FAILED" | "PARSE_FAILED";
}

// ─── page ─────────────────────────────────────────────────────────────────

export default function ScanPage() {
  const locale = useLocale() as "zh-TW" | "en";
  const t = useTranslations("Scan");
  const tCommon = useTranslations("Common");
  const router = useRouter();

  const loadChildren = useChildProfileStore((s) => s.loadFromStorage);
  const childLoaded = useChildProfileStore((s) => s.loaded);
  const activeChild = useChildProfileStore((s) => s.getActiveChild());
  const addMeal = useMealStore((s) => s.addMeal);

  const loadSub = useSubscriptionStore((s) => s.loadFromStorage);
  const currentPlan = useSubscriptionStore((s) => s.currentPlan);
  const loadUsage = useUsageStore((s) => s.loadFromStorage);
  const usageLoaded = useUsageStore((s) => s.loaded);
  const recordUsage = useUsageStore((s) => s.record);
  const todayScans = useUsageStore((s) => s.scan);

  useEffect(() => {
    loadChildren();
    loadSub();
    loadUsage();
  }, [loadChildren, loadSub, loadUsage]);

  const [paywallOpen, setPaywallOpen] = useState(false);

  // Capture / preview state.
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Meal-type, submission, results.
  const [mealType, setMealType] = useState<MealType>("lunch");
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<NutritionApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedToast, setSavedToast] = useState(false);

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setResult(null);
    setError(null);
  }

  async function analyze() {
    if (!file || !activeChild) return;

    // Enforce free-tier daily scan cap. We key by local date so a Taipei
    // parent's "day" matches their clock, not UTC.
    const plan = currentPlan();
    const cap = limitsFor(plan).scansPerDay;
    if (Number.isFinite(cap)) {
      const d = new Date();
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const usedToday = todayScans[key] ?? 0;
      if (usedToday >= cap) {
        setPaywallOpen(true);
        return;
      }
    }
    recordUsage("scan");

    setAnalyzing(true);
    setError(null);
    setResult(null);
    try {
      const imageBase64 = await fileToBase64(file);
      const bucket = ageInfoFromDob(activeChild.dob).bucket;
      const res = await fetch("/api/ai/nutrition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: imageBase64,
          mimeType: file.type,
          ageBucket: bucket,
          knownAllergens: activeChild.allergens,
        }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as ApiErrorPayload;
        setError(
          payload.code === "FACE_DETECTED"
            ? t("faceDetectedError")
            : payload.code === "NO_FOODS"
              ? t("noFoodsError")
              : t("genericError", { message: payload.error ?? "unknown" }),
        );
        return;
      }
      const data = (await res.json()) as NutritionApiResponse;
      setResult(data);
    } catch (err) {
      setError(
        t("genericError", {
          message: err instanceof Error ? err.message : String(err),
        }),
      );
    } finally {
      setAnalyzing(false);
    }
  }

  function save() {
    if (!result || !activeChild) return;
    const bucket = ageInfoFromDob(activeChild.dob).bucket;
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    addMeal({
      childId: activeChild.id,
      mealType,
      ageBucketAtMeal: bucket,
      foods: result.foods.map((f) => ({
        name: f.name,
        portionAmount: f.portionAmount,
        portionUnit: f.portionUnit,
        gramsEstimate: f.gramsEstimate,
        nutrients: f.nutrients,
        allergensPresent: f.allergensPresent,
        source: f.source,
      })),
      totals: result.totals,
      date,
      time,
      notes: "",
      aiAnalyzed: true,
    });
    setSavedToast(true);
    // Give the toast a beat, then go home.
    setTimeout(() => router.push("/app"), 900);
  }

  // ─── derived state ─────────────────────────────────────────────────────
  // Hooks live above the early returns so React sees a stable call order.
  // Each useMemo tolerates a null activeChild by returning an empty result —
  // the JSX below never reaches the paths that read these when no child.

  const knownAllergenHits = useMemo(() => {
    if (!result || !activeChild) return [] as AllergenKey[];
    const known = new Set(activeChild.allergens);
    const hits = new Set<AllergenKey>();
    for (const food of result.foods) {
      for (const a of food.allergensPresent) {
        if (known.has(a)) hits.add(a);
      }
    }
    return [...hits];
  }, [result, activeChild]);

  const coverage = useMemo(() => {
    if (!result || !activeChild) return [];
    const b = ageInfoFromDob(activeChild.dob).bucket;
    return computeCoverage(result.totals, b);
  }, [result, activeChild]);

  const coverageByNutrient = useMemo(() => {
    const map: Partial<Record<Nutrient, (typeof coverage)[number]>> = {};
    for (const cell of coverage) map[cell.nutrient] = cell;
    return map;
  }, [coverage]);

  // ─── render ─────────────────────────────────────────────────────────────

  if (!childLoaded) {
    return (
      <main className="min-h-screen flex items-center justify-center text-ink-faded">
        {tCommon("loading")}
      </main>
    );
  }

  if (!activeChild) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-8 text-center">
        <div className="text-6xl mb-4">🍎</div>
        <p className="text-ink-soft mb-6">{t("noChildWarning")}</p>
        <Link
          href="/onboarding"
          className="rounded-full bg-peach-deep text-white font-semibold px-8 py-3 bubble-shadow"
        >
          {t("goToOnboarding")} →
        </Link>
      </main>
    );
  }

  const bucket = ageInfoFromDob(activeChild.dob).bucket;
  const priorityNutrients = PRIORITY_NUTRIENTS[bucket];

  return (
    <main className="min-h-screen pb-32">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-cream/90 backdrop-blur-md border-b border-border px-6 py-4">
        <div className="max-w-xl mx-auto flex items-center gap-3">
          <Link href="/app" className="text-ink-soft hover:text-ink">
            ←
          </Link>
          <h1 className="font-display text-lg font-semibold text-ink">
            {t("title")}
          </h1>
        </div>
      </header>

      <div className="max-w-xl mx-auto px-6 pt-8 space-y-6">
        {/* Sub-hero */}
        {!result && <p className="text-ink-soft">{t("sub")}</p>}

        {/* Photo capture / preview */}
        <section>
          {preview ? (
            <div className="relative rounded-bubble overflow-hidden bg-black card-pop">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview}
                alt="Plate preview"
                className="w-full max-h-[420px] object-contain"
              />
              {!result && (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="absolute bottom-3 right-3 rounded-full bg-white/90 backdrop-blur text-ink text-sm font-medium px-4 py-2 bubble-shadow"
                >
                  {t("retake")}
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full aspect-[4/3] rounded-bubble bg-white border-2 border-dashed border-border flex flex-col items-center justify-center gap-3 text-ink-soft hover:border-peach-deep hover:text-peach-deep transition"
            >
              <div className="text-5xl">📸</div>
              <span className="font-medium">{t("choosePhoto")}</span>
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onPickFile}
            className="hidden"
          />
        </section>

        {/* Meal-type chips — only shown before analysis so we can bake the
            choice into the record; after analyze the chips are hidden. */}
        {preview && !result && !analyzing && (
          <section>
            <p className="text-sm font-medium text-ink mb-2">
              {t("mealTypeLabel")}
            </p>
            <div className="grid grid-cols-4 gap-2">
              {(["breakfast", "lunch", "dinner", "snack"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMealType(m)}
                  className={`px-3 py-2 rounded-card text-sm font-medium transition-all ${
                    mealType === m
                      ? "bg-sage/40 ring-2 ring-sage-deep text-ink"
                      : "bg-white border border-border text-ink-soft hover:border-sage-deep"
                  }`}
                >
                  {t(`meal${cap(m)}` as "mealBreakfast")}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-card bg-peach/30 border border-peach-deep/30 p-4 text-sm text-ink">
            {error}
          </div>
        )}

        {/* Analyzing state */}
        {analyzing && (
          <div className="rounded-bubble bg-white card-pop p-8 flex flex-col items-center text-center">
            <div className="size-14 rounded-full bg-butter flex items-center justify-center text-3xl animate-pulse">
              ✨
            </div>
            <p className="mt-4 text-ink font-medium">{t("analyzing")}</p>
          </div>
        )}

        {/* Results */}
        {result && (
          <section className="space-y-6">
            {knownAllergenHits.length > 0 && (
              <div className="rounded-card bg-peach/30 border border-peach-deep/40 p-4">
                <p className="font-display font-semibold text-ink">
                  {t("allergenWarningTitle")}
                </p>
                <p className="mt-1 text-sm text-ink leading-relaxed">
                  {t("allergenWarningBody", {
                    allergens: knownAllergenHits
                      .map(
                        (k) => `${getAllergen(k)?.emoji ?? ""} ${getAllergen(k)?.label[locale] ?? k}`,
                      )
                      .join("、"),
                  })}
                </p>
              </div>
            )}

            {/* Foods */}
            <div>
              <h2 className="font-display font-semibold text-ink mb-3">
                {t("foodsTitle")}
              </h2>
              <ul className="space-y-2">
                {result.foods.map((food, i) => {
                  const unitLabel = t(
                    `unit_${food.portionUnit}` as "unit_tsp",
                  );
                  return (
                    <li
                      key={`${food.nameEn}-${i}`}
                      className="flex items-center gap-3 p-4 rounded-card bg-white border border-border"
                    >
                      <div className="size-10 rounded-2xl bg-butter/60 flex items-center justify-center text-lg">
                        🍴
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-ink truncate">
                          {food.name}
                        </p>
                        <p className="text-xs text-ink-faded">
                          {t("portionLabel", {
                            amount: food.portionAmount,
                            unit: unitLabel,
                            grams: Math.round(food.gramsEstimate),
                          })}
                        </p>
                      </div>
                      {food.allergensPresent.length > 0 && (
                        <div className="flex items-center gap-0.5 text-base">
                          {food.allergensPresent.slice(0, 3).map((k) => (
                            <span key={k} title={getAllergen(k)?.label[locale]}>
                              {getAllergen(k)?.emoji}
                            </span>
                          ))}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* RDA rings */}
            <div>
              <h2 className="font-display font-semibold text-ink mb-1">
                {t("nutrientsTitle")}
              </h2>
              <p className="text-xs text-ink-faded mb-4">
                {t("nutrientsHint")}
              </p>
              <div className="grid grid-cols-3 gap-3 rounded-bubble bg-white card-pop p-5">
                {priorityNutrients.map((nutrient) => {
                  const cell = coverageByNutrient[nutrient];
                  const target = RDA[bucket][nutrient];
                  if (!cell) {
                    return (
                      <RDARing
                        key={nutrient}
                        nutrient={nutrient}
                        coverage={0}
                        status="unknown"
                        actual={0}
                        unit={target.unit}
                        locale={locale}
                        size="sm"
                      />
                    );
                  }
                  return (
                    <RDARing
                      key={nutrient}
                      nutrient={nutrient}
                      coverage={cell.coverage}
                      status={cell.status}
                      actual={cell.actual}
                      unit={cell.target.unit}
                      locale={locale}
                      size="sm"
                    />
                  );
                })}
              </div>
              <p className="mt-3 text-[11px] text-ink-faded text-center">
                {t("disclaimer")} · {DISCLAIMERS.rdaResults[locale]}
              </p>
              <div className="mt-4 flex justify-center">
                <ShareCardButton
                  type="scan"
                  size="square"
                  label={locale === "en" ? "Share today's plate" : "分享今日餐盤"}
                  className="bg-peach/60 text-ink px-5 py-2.5 hover:bg-peach-deep hover:text-white"
                  filename="nibble-plate.png"
                  params={{
                    childName: activeChild.name,
                    ageText: ageInfoFromDob(activeChild.dob).displayShort,
                    nutrients: JSON.stringify(
                      priorityNutrients.slice(0, 4).map((n) => [
                        n,
                        NUTRIENT_LABELS[n][locale],
                        coverageByNutrient[n]?.coverage ?? 0,
                      ]),
                    ),
                  }}
                />
              </div>
            </div>
          </section>
        )}
      </div>

      {/* Sticky CTA — analyze or save depending on state */}
      {preview && !analyzing && (
        <nav className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-md border-t border-border px-6 py-4">
          <div className="max-w-xl mx-auto">
            {!result ? (
              <button
                onClick={analyze}
                className="w-full px-8 py-4 rounded-full bg-peach-deep text-white font-semibold text-lg bubble-shadow hover:bg-peach-deep/90 transition"
              >
                {t("analyze")} ✨
              </button>
            ) : (
              <button
                onClick={save}
                disabled={savedToast}
                className="w-full px-8 py-4 rounded-full bg-sage-deep text-white font-semibold text-lg bubble-shadow hover:bg-sage-deep/90 transition"
              >
                {savedToast ? t("savedToast") : t("saveMeal")}
              </button>
            )}
          </div>
        </nav>
      )}

      <PaywallModal
        open={paywallOpen}
        reason="scan"
        usedToday={
          usageLoaded
            ? todayScans[
                `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`
              ] ?? 0
            : 0
        }
        dailyCap={limitsFor(currentPlan()).scansPerDay}
        locale={locale}
        onClose={() => setPaywallOpen(false)}
      />
    </main>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Unexpected FileReader result"));
        return;
      }
      // Strip "data:image/jpeg;base64," prefix.
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("FileReader error"));
    reader.readAsDataURL(file);
  });
}

function cap<T extends string>(s: T): Capitalize<T> {
  return (s.charAt(0).toUpperCase() + s.slice(1)) as Capitalize<T>;
}

// Silence unused imports on the nutrient label map — keep for future
// ring-level tooltips with localized nutrient names.
void NUTRIENT_LABELS;
