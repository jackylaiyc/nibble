"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, Link } from "@/i18n/navigation";
import { useChildProfileStore } from "@/stores/childProfileStore";
import { useMealStore, type FoodItem, type PortionUnit } from "@/stores/mealStore";
import { ageInfoFromDob, type AgeBucket } from "@/lib/pediatric/ageBucket";
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
  sumMeals,
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
    benefit?: string;
    benefitEn?: string;
    risk?: string;
    riskEn?: string;
    suitability?: "excellent" | "good" | "caution" | "avoid";
  }>;
  totals: NutrientTotals;
}

interface ApiErrorPayload {
  error: string;
  code?: "NO_FOODS" | "BAD_INPUT" | "GEMINI_FAILED" | "PARSE_FAILED" | "AI_NOT_CONFIGURED";
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
  const loadMeals = useMealStore((s) => s.loadFromStorage);
  const getMealsForDate = useMealStore((s) => s.getMealsForDate);

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
    loadMeals();
  }, [loadChildren, loadSub, loadUsage, loadMeals]);

  const [paywallOpen, setPaywallOpen] = useState(false);

  // Capture / preview state. Two refs: one input forces the rear camera
  // (`capture="environment"`), the other is a plain library picker.
  // Splitting them lets the parent choose at the moment of upload instead
  // of being shoehorned into a single iOS UA decision.
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const libraryInputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  // Hold the data URL alongside the File so we can persist it on save without
  // re-reading the file (FileReader is async; ObjectURLs aren't serialisable).
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      setPhotoDataUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    // Compute the data URL eagerly. We downscale before saving so localStorage
    // doesn't blow past its quota — most phones produce 4MB photos.
    void compressToDataUrl(file).then(setPhotoDataUrl).catch(() => setPhotoDataUrl(null));
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Meal-type, submission, results.
  const [mealType, setMealType] = useState<MealType>("lunch");
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<NutritionApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedToast, setSavedToast] = useState(false);
  const [showAllNutrients, setShowAllNutrients] = useState(false);

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setResult(null);
    setError(null);
  }

  async function analyze() {
    // Guard against double-clicks and missing prerequisites
    if (!file || !activeChild || analyzing) return;

    // Enforce free-tier daily scan cap. We key by local date so a Taipei
    // parent's "day" matches their clock, not UTC.
    const plan = currentPlan();
    const capLimit = limitsFor(plan).scansPerDay;
    if (Number.isFinite(capLimit)) {
      const d = new Date();
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const usedToday = todayScans[key] ?? 0;
      if (usedToday >= capLimit) {
        setPaywallOpen(true);
        return;
      }
    }

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
        // Always include status code so a silent network/auth failure is
        // legible from the caregiver's screen instead of just "something
        // went wrong" — that was the iPhone bug report.
        const detail = `${res.status}: ${payload.error ?? "unknown"}`;
        setError(
          payload.code === "NO_FOODS"
            ? t("noFoodsError")
            : t("genericError", { message: detail }),
        );
        return;
      }
      const data = (await res.json()) as NutritionApiResponse;
      setResult(data);
      // Record usage only AFTER a successful scan — never charge for failures
      recordUsage("scan");
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
        nameEn: f.nameEn,
        portionAmount: f.portionAmount,
        portionUnit: f.portionUnit,
        gramsEstimate: f.gramsEstimate,
        nutrients: f.nutrients,
        allergensPresent: f.allergensPresent,
        source: f.source,
        benefit: f.benefit,
        benefitEn: f.benefitEn,
        risk: f.risk,
        riskEn: f.riskEn,
        suitability: f.suitability,
      })),
      totals: result.totals,
      date,
      time,
      notes: "",
      aiAnalyzed: true,
      photoDataUrl: photoDataUrl ?? undefined,
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

  // Daily accumulated totals (previous meals today + this scan)
  const dailyCoverage = useMemo(() => {
    if (!result || !activeChild) return [];
    const bucket = ageInfoFromDob(activeChild.dob).bucket;
    const todayMeals = getMealsForDate(activeChild.id, new Date());
    const previousTotals = todayMeals.map((m) => m.totals);
    const combined = sumMeals([...previousTotals, result.totals]);
    return computeCoverage(combined, bucket);
  }, [result, activeChild, getMealsForDate]);

  const dailyCoverageByNutrient = useMemo(() => {
    const map: Partial<Record<Nutrient, (typeof dailyCoverage)[number]>> = {};
    for (const cell of dailyCoverage) map[cell.nutrient] = cell;
    return map;
  }, [dailyCoverage]);

  const todayMealCount = useMemo(() => {
    if (!activeChild) return 0;
    return getMealsForDate(activeChild.id, new Date()).length;
  }, [activeChild, getMealsForDate]);

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
          <h1 className="font-display text-lg font-semibold text-ink flex-1">
            {t("title")}
          </h1>
          <Link
            href="/app/scan/history"
            className="text-xs font-medium text-ink-soft hover:text-ink"
          >
            {t("historyLink")}
          </Link>
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
                <div className="absolute bottom-3 right-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => libraryInputRef.current?.click()}
                    className="rounded-full bg-white/90 backdrop-blur text-ink text-sm font-medium px-4 py-2 bubble-shadow"
                  >
                    🖼️ {t("fromLibrary")}
                  </button>
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="rounded-full bg-white/90 backdrop-blur text-ink text-sm font-medium px-4 py-2 bubble-shadow"
                  >
                    📸 {t("retake")}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="aspect-[4/3] rounded-bubble bg-white border-2 border-dashed border-border flex flex-col items-center justify-center gap-3 text-ink-soft hover:border-peach-deep hover:text-peach-deep transition"
              >
                <div className="text-5xl">📸</div>
                <span className="font-medium text-center px-2">{t("choosePhoto")}</span>
              </button>
              <button
                type="button"
                onClick={() => libraryInputRef.current?.click()}
                className="aspect-[4/3] rounded-bubble bg-white border-2 border-dashed border-border flex flex-col items-center justify-center gap-3 text-ink-soft hover:border-sage-deep hover:text-sage-deep transition"
              >
                <div className="text-5xl">🖼️</div>
                <span className="font-medium text-center px-2">{t("fromLibrary")}</span>
              </button>
            </div>
          )}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onPickFile}
            className="hidden"
          />
          <input
            ref={libraryInputRef}
            type="file"
            accept="image/*"
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
                      .join(locale === "en" ? ", " : "、"),
                  })}
                </p>
              </div>
            )}

            {/* Foods with insights */}
            <div>
              <h2 className="font-display font-semibold text-ink mb-3">
                {t("foodsTitle")}
              </h2>
              <ul className="space-y-3">
                {result.foods.map((food, i) => {
                  const unitLabel = t(
                    `unit_${food.portionUnit}` as "unit_tsp",
                  );
                  const benefit = locale === "en" ? food.benefitEn : food.benefit;
                  const risk = locale === "en" ? food.riskEn : food.risk;
                  const suitability = food.suitability;
                  const suitBadge = suitability === "excellent"
                    ? { bg: "bg-sage/20", text: "text-sage-deep", label: locale === "en" ? "Excellent" : "非常適合" }
                    : suitability === "good"
                      ? { bg: "bg-butter/30", text: "text-ink", label: locale === "en" ? "Good" : "適合" }
                      : suitability === "caution"
                        ? { bg: "bg-peach/30", text: "text-peach-deep", label: locale === "en" ? "Caution" : "注意" }
                        : suitability === "avoid"
                          ? { bg: "bg-red-100", text: "text-red-700", label: locale === "en" ? "Avoid" : "避免" }
                          : null;
                  return (
                    <li
                      key={`${food.nameEn}-${i}`}
                      className="rounded-card bg-white border border-border overflow-hidden"
                    >
                      {/* Food header row */}
                      <div className="flex items-center gap-3 p-4">
                        <div className="size-10 rounded-2xl bg-butter/60 flex items-center justify-center text-lg shrink-0">
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
                        <div className="flex items-center gap-1.5 shrink-0">
                          {suitBadge && (
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${suitBadge.bg} ${suitBadge.text}`}>
                              {suitBadge.label}
                            </span>
                          )}
                          {food.allergensPresent.length > 0 && (
                            <div className="flex items-center gap-0.5 text-base">
                              {food.allergensPresent.slice(0, 3).map((k) => (
                                <span key={k} title={getAllergen(k)?.label[locale]}>
                                  {getAllergen(k)?.emoji}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Insights section */}
                      {(benefit || risk) && (
                        <div className="px-4 pb-4 space-y-1.5">
                          {benefit && (
                            <div className="flex items-start gap-2 text-sm">
                              <span className="shrink-0 mt-0.5">💡</span>
                              <p className="text-ink-faded leading-snug">{benefit}</p>
                            </div>
                          )}
                          {risk && (
                            <div className="flex items-start gap-2 text-sm">
                              <span className="shrink-0 mt-0.5">⚠️</span>
                              <p className="text-peach-deep leading-snug">{risk}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Daily progress — accumulated across all meals today */}
            {todayMealCount > 0 && (
              <div>
                <h2 className="font-display font-semibold text-ink mb-1">
                  {locale === "en"
                    ? `Today's total (${todayMealCount + 1} meals)`
                    : `今日累計 (${todayMealCount + 1} 餐)`}
                </h2>
                <p className="text-xs text-ink-faded mb-4">
                  {locale === "en"
                    ? "Including previous meals today + this scan"
                    : "包含今天之前的餐點 + 這次掃描"}
                </p>
                <div className="grid grid-cols-3 gap-3 rounded-bubble bg-sage/10 border border-sage/30 card-pop p-5">
                  {priorityNutrients.map((nutrient) => {
                    const cell = dailyCoverageByNutrient[nutrient];
                    const target = RDA[bucket]?.[nutrient];
                    if (!target) return null;
                    return (
                      <RDARing
                        key={nutrient}
                        nutrient={nutrient}
                        coverage={cell?.coverage ?? 0}
                        status={cell?.status ?? "unknown"}
                        actual={cell?.actual ?? 0}
                        unit={target.unit}
                        locale={locale}
                        size="sm"
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {/* This meal's nutrients — priority rings + expandable full list */}
            <div>
              <h2 className="font-display font-semibold text-ink mb-1">
                {todayMealCount > 0
                  ? (locale === "en" ? "This meal" : "本餐營養")
                  : t("nutrientsTitle")}
              </h2>
              <p className="text-xs text-ink-faded mb-4">
                {t("nutrientsHint")}
              </p>
              <div className="grid grid-cols-3 gap-3 rounded-bubble bg-white card-pop p-5">
                {priorityNutrients.map((nutrient) => {
                  const cell = coverageByNutrient[nutrient];
                  const target = RDA[bucket]?.[nutrient];
                  if (!target) return null;
                  return (
                    <RDARing
                      key={nutrient}
                      nutrient={nutrient}
                      coverage={cell?.coverage ?? 0}
                      status={cell?.status ?? "unknown"}
                      actual={cell?.actual ?? 0}
                      unit={target.unit}
                      locale={locale}
                      size="sm"
                    />
                  );
                })}
              </div>

              {/* Expandable: every other tracked nutrient */}
              <button
                type="button"
                onClick={() => setShowAllNutrients((v) => !v)}
                className="mt-3 w-full text-sm font-medium text-sage-deep hover:text-ink py-2 rounded-card border border-border bg-white"
              >
                {showAllNutrients ? t("hideExtraNutrients") : t("showAllNutrients")}
              </button>
              {showAllNutrients && (
                <div className="mt-3 rounded-bubble bg-white card-pop p-5 space-y-3">
                  {coverage
                    .filter((c) => !priorityNutrients.includes(c.nutrient))
                    .map((cell) => (
                      <NutrientBar
                        key={cell.nutrient}
                        label={NUTRIENT_LABELS[cell.nutrient][locale]}
                        emoji={NUTRIENT_LABELS[cell.nutrient].emoji}
                        actual={cell.actual}
                        target={cell.target.value}
                        unit={cell.target.unit}
                        coverage={cell.coverage}
                        isUpperLimit={!!cell.target.isUpperLimit}
                        locale={locale}
                      />
                    ))}
                </div>
              )}

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
                        Math.round((coverageByNutrient[n]?.coverage ?? 0) * 100),
                      ]),
                    ),
                  }}
                />
              </div>
            </div>

            {/* Per-food breakdown — for each identified food, show how it
                contributes to the priority nutrients today. Helps parents
                see "this is where the iron came from". */}
            <div>
              <h2 className="font-display font-semibold text-ink mb-1">
                {t("perFoodTitle")}
              </h2>
              <p className="text-xs text-ink-faded mb-4">{t("perFoodHint")}</p>
              <ul className="space-y-3">
                {result.foods.map((food, i) => (
                  <PerFoodCard
                    key={`${food.nameEn}-${i}`}
                    name={food.name}
                    portionLabel={t("portionLabel", {
                      amount: food.portionAmount,
                      unit: t(`unit_${food.portionUnit}` as "unit_tsp"),
                      grams: Math.round(food.gramsEstimate),
                    })}
                    nutrients={food.nutrients}
                    bucket={bucket}
                    priorityNutrients={priorityNutrients}
                    locale={locale}
                  />
                ))}
              </ul>
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

// ─── components ────────────────────────────────────────────────────────────

/**
 * Slim percent-bar row for a single nutrient — used in the "show all" panel
 * so parents can scan the secondary nutrients without giving them ring real
 * estate.
 */
function NutrientBar({
  label,
  emoji,
  actual,
  target,
  unit,
  coverage,
  isUpperLimit,
  locale,
}: {
  label: string;
  emoji: string;
  actual: number;
  target: number;
  unit: string;
  coverage: number;
  isUpperLimit: boolean;
  locale: "zh-TW" | "en";
}) {
  const pct = Math.min(coverage, 1.5) * 100;
  // Color rules differ for limits vs. RDAs: under-cap is good for sodium,
  // bad for iron. Same color logic the rings use.
  const color = isUpperLimit
    ? coverage > 1
      ? "bg-peach-deep"
      : "bg-sage-deep"
    : coverage >= 0.9
      ? coverage > 1.5
        ? "bg-butter-deep"
        : "bg-sage-deep"
      : coverage >= 0.5
        ? "bg-butter-deep"
        : "bg-peach";
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-sm font-medium text-ink flex items-center gap-1.5">
          <span>{emoji}</span>
          <span>{label}</span>
        </span>
        <span className="text-xs text-ink-faded tabular-nums">
          {Math.round(actual * 10) / 10}{unit} / {target}{unit}{" "}
          <span className="font-semibold text-ink ml-1">
            {Math.round(coverage * 100)}%
          </span>
        </span>
      </div>
      <div className="h-2.5 rounded-full bg-cream overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all duration-700`}
          style={{ width: `${Math.max(2, pct)}%` }}
          aria-label={`${Math.round(coverage * 100)}% of ${target}${unit} ${locale === "en" ? "daily target" : "每日目標"}`}
        />
      </div>
    </div>
  );
}

/**
 * Card for one food showing its top-contributing nutrients to today's daily
 * RDA. We ignore zero/trivial entries so a piece of broccoli doesn't have
 * fourteen 0% lines.
 */
function PerFoodCard({
  name,
  portionLabel,
  nutrients,
  bucket,
  priorityNutrients,
  locale,
}: {
  name: string;
  portionLabel: string;
  nutrients: NutrientTotals;
  bucket: AgeBucket;
  priorityNutrients: Nutrient[];
  locale: "zh-TW" | "en";
}) {
  const targets = RDA[bucket];

  // Walk every tracked nutrient, compute its share of the daily target,
  // sort priority-aware so iron/zinc/calcium win ties even at small contributions.
  const rows = (Object.keys(targets) as Nutrient[])
    .map((n) => {
      const actual = nutrients[n] ?? 0;
      const target = targets[n].value;
      const coverage = target > 0 ? actual / target : 0;
      return {
        nutrient: n,
        actual,
        target,
        coverage,
        unit: targets[n].unit,
        isUpperLimit: !!targets[n].isUpperLimit,
        priority: priorityNutrients.includes(n),
      };
    })
    .filter((r) => r.actual > 0 && r.coverage >= 0.01)
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority ? -1 : 1;
      return b.coverage - a.coverage;
    })
    .slice(0, 6);

  return (
    <li className="rounded-bubble bg-white card-pop p-4">
      <div className="flex items-baseline justify-between mb-3">
        <div className="min-w-0">
          <p className="font-display font-semibold text-ink truncate">{name}</p>
          <p className="text-xs text-ink-faded">{portionLabel}</p>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-ink-faded">
          {locale === "en"
            ? "No significant nutrient contribution."
            : "對主要營養素貢獻較少。"}
        </p>
      ) : (
        <div className="space-y-2.5">
          {rows.map((r) => (
            <NutrientBar
              key={r.nutrient}
              label={NUTRIENT_LABELS[r.nutrient][locale]}
              emoji={NUTRIENT_LABELS[r.nutrient].emoji}
              actual={r.actual}
              target={r.target}
              unit={r.unit}
              coverage={r.coverage}
              isUpperLimit={r.isUpperLimit}
              locale={locale}
            />
          ))}
        </div>
      )}
    </li>
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

/**
 * Downscale an image and return a JPEG data URL. Phones produce 4–8MB
 * photos; localStorage caps at ~5MB across the entire origin, so we shrink
 * to 800px on the long edge before persisting. Used for thumbnails — the
 * full-quality file still goes to Gemini for analysis.
 */
function compressToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      if (typeof dataUrl !== "string") {
        reject(new Error("Reader returned non-string"));
        return;
      }
      const img = new Image();
      img.onload = () => {
        const maxEdge = 800;
        const ratio = Math.min(1, maxEdge / Math.max(img.width, img.height));
        const w = Math.round(img.width * ratio);
        const h = Math.round(img.height * ratio);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          // Canvas unavailable (rare) — fall back to the original data URL.
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        try {
          resolve(canvas.toDataURL("image/jpeg", 0.7));
        } catch {
          resolve(dataUrl);
        }
      };
      img.onerror = () => reject(new Error("Image decode failed"));
      img.src = dataUrl;
    };
    reader.onerror = () => reject(reader.error ?? new Error("Reader error"));
    reader.readAsDataURL(file);
  });
}

function cap<T extends string>(s: T): Capitalize<T> {
  return (s.charAt(0).toUpperCase() + s.slice(1)) as Capitalize<T>;
}
