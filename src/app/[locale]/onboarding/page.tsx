"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  useChildProfileStore,
  type ProfileKind,
} from "@/stores/childProfileStore";

/**
 * Onboarding — a 6-slide tutorial that ends with a one-line setup.
 *
 * This used to be a multi-step form (name, sex, DOB, feeding style,
 * allergens, consent). Most of those questions were friction without
 * payoff: caregivers don't know their answers up-front and the app
 * can compute reasonable defaults. So we flipped it: the onboarding
 * teaches the app first, then asks for the bare minimum we need to
 * compute daily RDA targets — a name and which life stage to track.
 *
 * Slides 1–5 are pure illustration (no inputs). Slide 6 is "let's go"
 * with name + life-stage chips. Every other field on the Child record
 * gets a sensible default and can be edited later from the dashboard.
 */

type SlideKey =
  | "welcome"
  | "snap"
  | "analyze"
  | "portion"
  | "targets"
  | "ask"
  | "setup";

const SLIDES: SlideKey[] = [
  "welcome",
  "snap",
  "analyze",
  "portion",
  "targets",
  "ask",
  "setup",
];

// Avatar to attach to the new profile based on kind. Caregivers can
// change this from the profile screen later.
const KIND_AVATARS: Record<Exclude<ProfileKind, "newborn">, string> = {
  infant: "🍎",
  pregnant: "🤰",
  breastfeeding: "🤱",
};

// Today minus N days, formatted as YYYY-MM-DD.
function isoDateOffset(daysFromToday: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  return d.toISOString().slice(0, 10);
}

// Sensible profile defaults so the user doesn't have to fill in dates.
// They can edit these later if they're tracking precisely.
function defaultDates(kind: Exclude<ProfileKind, "newborn">) {
  if (kind === "infant") {
    // 12 months old — lands in the 12-23mo bucket which has the broadest
    // RDA targets. Caregivers with younger / older babies will edit.
    return { dob: isoDateOffset(-365), pregnancyDueDate: undefined, breastfeedingStartDate: undefined };
  }
  if (kind === "pregnant") {
    // Due date 20 weeks out → currently second trimester.
    return { dob: isoDateOffset(0), pregnancyDueDate: isoDateOffset(140), breastfeedingStartDate: undefined };
  }
  // breastfeeding — 8 weeks postpartum → currently in the 0-6mo lactation bucket.
  return { dob: isoDateOffset(0), pregnancyDueDate: undefined, breastfeedingStartDate: isoDateOffset(-56) };
}

export default function OnboardingPage() {
  const locale = useLocale() as "zh-TW" | "en";
  const router = useRouter();
  const addChild = useChildProfileStore((s) => s.addChild);
  const setActiveChild = useChildProfileStore((s) => s.setActiveChild);
  const loadFromStorage = useChildProfileStore((s) => s.loadFromStorage);

  // Hydrate so re-runs don't double-create a profile.
  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  const [slideIdx, setSlideIdx] = useState(0);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Exclude<ProfileKind, "newborn">>("infant");
  const [saving, setSaving] = useState(false);

  const slide = SLIDES[slideIdx];
  const isLast = slide === "setup";
  const isFirst = slideIdx === 0;

  function next() {
    if (slideIdx < SLIDES.length - 1) setSlideIdx((i) => i + 1);
  }

  function prev() {
    if (slideIdx > 0) setSlideIdx((i) => i - 1);
  }

  function skipToSetup() {
    setSlideIdx(SLIDES.length - 1);
  }

  async function finish() {
    if (saving) return;
    setSaving(true);
    try {
      const trimmed = name.trim();
      const fallbackName = locale === "en" ? "Me" : "我";
      const dates = defaultDates(kind);
      const id = addChild({
        name: trimmed || fallbackName,
        avatar: KIND_AVATARS[kind],
        allergens: [],
        notes: "",
        kind,
        dob: dates.dob,
        sex: "unspecified",
        feedingStyle: kind === "infant" ? "mixed" : undefined,
        pregnancyDueDate: dates.pregnancyDueDate,
        breastfeedingStartDate: dates.breastfeedingStartDate,
      });
      setActiveChild(id);
      router.replace("/app");
    } catch (err) {
      console.error("[onboarding] finish failed:", err);
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-cream flex flex-col">
      {/* Top bar — Skip on tutorial slides only */}
      <div className="px-6 pt-6 flex items-center justify-between">
        <span className="text-2xl">🍎</span>
        {!isLast && (
          <button
            type="button"
            onClick={skipToSetup}
            className="text-sm text-ink-faded hover:text-ink"
          >
            {locale === "en" ? "Skip" : "略過"} →
          </button>
        )}
      </div>

      {/* Slide stage */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 text-center">
        {slide === "welcome" && <WelcomeSlide locale={locale} />}
        {slide === "snap" && <SnapSlide locale={locale} />}
        {slide === "analyze" && <AnalyzeSlide locale={locale} />}
        {slide === "portion" && <PortionSlide locale={locale} />}
        {slide === "targets" && <TargetsSlide locale={locale} />}
        {slide === "ask" && <AskSlide locale={locale} />}
        {slide === "setup" && (
          <SetupSlide
            locale={locale}
            name={name}
            setName={setName}
            kind={kind}
            setKind={setKind}
          />
        )}
      </div>

      {/* Bottom controls — dots + nav buttons */}
      <div className="px-6 pb-10 space-y-6">
        <div className="flex justify-center gap-2">
          {SLIDES.map((s, i) => (
            <button
              key={s}
              type="button"
              onClick={() => setSlideIdx(i)}
              aria-label={`Slide ${i + 1}`}
              className={`h-2 rounded-full transition-all ${
                i === slideIdx
                  ? "w-8 bg-peach-deep"
                  : "w-2 bg-border hover:bg-peach/40"
              }`}
            />
          ))}
        </div>

        <div className="max-w-sm mx-auto flex gap-3">
          {!isFirst && (
            <button
              type="button"
              onClick={prev}
              className="flex-1 py-3 rounded-full border border-border text-ink font-medium hover:border-peach-deep transition"
            >
              ← {locale === "en" ? "Back" : "上一步"}
            </button>
          )}
          {!isLast ? (
            <button
              type="button"
              onClick={next}
              className="flex-[2] py-3 rounded-full bg-peach-deep text-white font-semibold bubble-shadow hover:bg-peach-deep/90 transition"
            >
              {locale === "en" ? "Next" : "下一步"} →
            </button>
          ) : (
            <button
              type="button"
              onClick={finish}
              disabled={saving}
              className="flex-[2] py-3 rounded-full bg-peach-deep text-white font-semibold bubble-shadow hover:bg-peach-deep/90 transition disabled:opacity-60"
            >
              {saving
                ? locale === "en" ? "Setting up…" : "建立中⋯⋯"
                : locale === "en" ? "Start tracking" : "開始追蹤"}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

/* ─── Individual slides ──────────────────────────────────────────────────── */

function SlideShell({
  emoji,
  title,
  body,
  children,
}: {
  emoji: string;
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="max-w-md w-full">
      <div className="text-7xl mb-6">{emoji}</div>
      <h2 className="font-display font-bold text-3xl text-ink leading-tight">
        {title}
      </h2>
      <p className="mt-4 text-ink-soft text-lg leading-relaxed">{body}</p>
      {children}
    </div>
  );
}

function WelcomeSlide({ locale }: { locale: "en" | "zh-TW" }) {
  return (
    <SlideShell
      emoji="🍎"
      title={locale === "en" ? "Welcome to Nibble" : "歡迎使用 Nibble"}
      body={
        locale === "en"
          ? "Snap a photo of any meal — we'll tell you exactly what nutrients it covered for the day."
          : "拍張任何一餐的照片，我們會告訴你今天的營養補了多少。"
      }
    />
  );
}

function SnapSlide({ locale }: { locale: "en" | "zh-TW" }) {
  return (
    <SlideShell
      emoji="📸"
      title={locale === "en" ? "Snap any meal" : "拍下你的餐"}
      body={
        locale === "en"
          ? "One photo. No weighing, no typing, no manual logging."
          : "一張照片，免秤重、免輸入、免手動記錄。"
      }
    >
      <div className="mt-8 mx-auto max-w-xs rounded-bubble bg-white card-pop p-4 flex items-center justify-center gap-3">
        <span className="text-3xl">🥗</span>
        <span className="text-3xl animate-pulse">→</span>
        <span className="text-3xl">📊</span>
      </div>
    </SlideShell>
  );
}

function AnalyzeSlide({ locale }: { locale: "en" | "zh-TW" }) {
  // 19 tracked nutrients across macros, vitamins, minerals, omega-3s,
  // and exposure trackers (caffeine, alcohol). Showing a curated mix
  // here so the slide reads "we cover everything," not just headline
  // micronutrients.
  const chips = locale === "en"
    ? [
        { emoji: "🔥", label: "Calories", pct: 64, color: "#f5cf66" },
        { emoji: "🥩", label: "Protein", pct: 88, color: "#e6a87c" },
        { emoji: "🌾", label: "Fiber", pct: 52, color: "#a8d5ba" },
        { emoji: "⚙️", label: "Iron", pct: 72, color: "#6fb38a" },
        { emoji: "🦴", label: "Calcium", pct: 91, color: "#a8d5ba" },
        { emoji: "🐟", label: "DHA", pct: 48, color: "#86b7e8" },
      ]
    : [
        { emoji: "🔥", label: "熱量", pct: 64, color: "#f5cf66" },
        { emoji: "🥩", label: "蛋白質", pct: 88, color: "#e6a87c" },
        { emoji: "🌾", label: "纖維", pct: 52, color: "#a8d5ba" },
        { emoji: "⚙️", label: "鐵", pct: 72, color: "#6fb38a" },
        { emoji: "🦴", label: "鈣", pct: 91, color: "#a8d5ba" },
        { emoji: "🐟", label: "DHA", pct: 48, color: "#86b7e8" },
      ];
  return (
    <SlideShell
      emoji="✨"
      title={locale === "en" ? "AI breaks it all down" : "AI 全方位分析"}
      body={
        locale === "en"
          ? "Calories, protein, fiber, every vitamin and mineral, omega-3s — 19 nutrients, calculated in seconds."
          : "熱量、蛋白質、纖維、所有維生素與礦物質、Omega-3——共 19 項營養素，幾秒鐘搞定。"
      }
    >
      <div className="mt-8 mx-auto max-w-xs grid grid-cols-3 gap-2 text-xs">
        {chips.map((c) => (
          <NutrientChip key={c.label} {...c} />
        ))}
      </div>
      <p className="mt-3 text-xs text-ink-faded">
        {locale === "en" ? "+ 13 more tracked" : "另加 13 項持續追蹤"}
      </p>
    </SlideShell>
  );
}

function PortionSlide({ locale }: { locale: "en" | "zh-TW" }) {
  const presets = [
    { label: "¼", on: false },
    { label: "½", on: true },
    { label: "¾", on: false },
    { label: "1×", on: false },
  ];
  return (
    <SlideShell
      emoji="⚖️"
      title={locale === "en" ? "Didn't finish? No problem." : "沒吃完？沒關係。"}
      body={
        locale === "en"
          ? "Tap a food and adjust the amount — by serving (¼, ½, ¾, 1×) or by exact weight in grams. Nutrients re-scale to what you actually ate."
          : "點任何一樣食物調整份量——選比例（¼、½、¾、1×）或直接輸入克數。營養素會依實際攝取量重新計算。"
      }
    >
      <div className="mt-8 mx-auto max-w-xs rounded-bubble bg-white card-pop p-4 text-left">
        <p className="text-xs text-ink-faded mb-2">
          {locale === "en" ? "How much did you eat?" : "你吃了多少？"}
        </p>
        <div className="flex gap-2 mb-3">
          {presets.map((p) => (
            <span
              key={p.label}
              className={`flex-1 text-center py-2 rounded-full text-sm font-semibold border ${
                p.on
                  ? "bg-peach text-white border-peach"
                  : "bg-cream text-ink-faded border-border"
              }`}
            >
              {p.label}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="flex-1 px-3 py-2 rounded-card bg-cream text-ink tabular-nums">
            120
          </span>
          <span className="text-ink-faded">g</span>
        </div>
      </div>
    </SlideShell>
  );
}

function TargetsSlide({ locale }: { locale: "en" | "zh-TW" }) {
  // Show a small mix of "covered" and "needs more" badges so the slide
  // reads as a real day rather than a perfect-score celebration.
  const badges = locale === "en"
    ? [
        { tone: "good" as const, text: "Protein · 100%" },
        { tone: "good" as const, text: "Calcium · 95%" },
        { tone: "warn" as const, text: "Iron · 60%" },
      ]
    : [
        { tone: "good" as const, text: "蛋白質 · 100%" },
        { tone: "good" as const, text: "鈣 · 95%" },
        { tone: "warn" as const, text: "鐵 · 60%" },
      ];
  return (
    <SlideShell
      emoji="🎯"
      title={locale === "en" ? "Daily targets, made visible" : "每日目標，一目了然"}
      body={
        locale === "en"
          ? "Each meal adds to the day's totals. See at a glance which nutrients are covered and which need a top-up."
          : "每一餐都會累加到今天的進度。哪些補夠了、哪些還差一點，一眼就懂。"
      }
    >
      <div className="mt-8 flex flex-col gap-2 items-center">
        {badges.map((b) => (
          <span
            key={b.text}
            className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-sm font-medium ${
              b.tone === "good"
                ? "bg-sage/30 border-sage-deep/30 text-sage-deep"
                : "bg-butter/40 border-butter-deep/30 text-ink"
            }`}
          >
            <span className="text-base">{b.tone === "good" ? "✅" : "🌱"}</span>
            {b.text}
          </span>
        ))}
      </div>
    </SlideShell>
  );
}

function AskSlide({ locale }: { locale: "en" | "zh-TW" }) {
  return (
    <SlideShell
      emoji="💬"
      title={locale === "en" ? "Ask anything" : "什麼都能問"}
      body={
        locale === "en"
          ? "Solids, allergens, picky eaters, daily nutrition — Nibble has answers."
          : "副食品、過敏原、挑食、每日營養——Nibble 都知道。"
      }
    >
      <div className="mt-8 mx-auto max-w-xs rounded-bubble bg-white card-pop p-4 text-left text-sm">
        <p className="text-ink-faded text-xs mb-2">
          {locale === "en" ? "You" : "你"}
        </p>
        <p className="text-ink mb-4">
          {locale === "en"
            ? "How much iron does my baby need?"
            : "寶寶一天需要多少鐵？"}
        </p>
        <p className="text-peach-deep text-xs mb-2">Nibble 🍎</p>
        <p className="text-ink leading-relaxed">
          {locale === "en"
            ? "About 11mg/day at 7-12mo — try egg yolk, beef purée, lentils."
            : "7-12 個月約 11mg/天 — 蛋黃、紅肉泥、扁豆都是好選擇。"}
        </p>
      </div>
    </SlideShell>
  );
}

function SetupSlide({
  locale,
  name,
  setName,
  kind,
  setKind,
}: {
  locale: "en" | "zh-TW";
  name: string;
  setName: (v: string) => void;
  kind: Exclude<ProfileKind, "newborn">;
  setKind: (k: Exclude<ProfileKind, "newborn">) => void;
}) {
  const KIND_OPTIONS: Array<{
    key: Exclude<ProfileKind, "newborn">;
    emoji: string;
    en: string;
    zh: string;
  }> = [
    { key: "infant", emoji: "👶", en: "A baby / toddler", zh: "寶寶" },
    { key: "pregnant", emoji: "🤰", en: "I'm pregnant", zh: "懷孕中" },
    { key: "breastfeeding", emoji: "🤱", en: "I'm breastfeeding", zh: "哺乳中" },
  ];

  return (
    <div className="max-w-md w-full">
      <div className="text-6xl mb-4">🚀</div>
      <h2 className="font-display font-bold text-3xl text-ink leading-tight">
        {locale === "en" ? "You're all set" : "準備好了！"}
      </h2>
      <p className="mt-3 text-ink-soft leading-relaxed">
        {locale === "en"
          ? "Two quick details so we can compute your daily nutrient targets."
          : "最後兩個小問題，幫我們算出你的每日營養目標。"}
      </p>

      <div className="mt-8 space-y-6 text-left">
        {/* Name */}
        <div>
          <label
            htmlFor="setup-name"
            className="block text-sm font-medium text-ink mb-2"
          >
            {locale === "en" ? "Your name (or baby's name)" : "你的名字（或寶寶的名字）"}
          </label>
          <input
            id="setup-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={locale === "en" ? "e.g. Coco, Mia, Me" : "例如：小豆、Coco、我"}
            className="w-full px-4 py-3 rounded-card bg-white border border-border focus:border-peach-deep outline-none text-ink"
          />
        </div>

        {/* Kind picker */}
        <div>
          <p className="text-sm font-medium text-ink mb-2">
            {locale === "en" ? "What are we tracking?" : "要追蹤誰？"}
          </p>
          <div className="grid grid-cols-1 gap-2">
            {KIND_OPTIONS.map((opt) => {
              const active = kind === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setKind(opt.key)}
                  className={`flex items-center gap-3 p-4 rounded-card border transition text-left ${
                    active
                      ? "bg-peach/10 border-peach-deep"
                      : "bg-white border-border hover:border-peach/40"
                  }`}
                >
                  <span className="text-2xl">{opt.emoji}</span>
                  <span className="font-medium text-ink flex-1">
                    {locale === "en" ? opt.en : opt.zh}
                  </span>
                  {active && <span className="text-peach-deep text-xl">✓</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Tiny helpers ───────────────────────────────────────────────────────── */

function NutrientChip({
  emoji,
  label,
  pct,
  color,
}: {
  emoji: string;
  label: string;
  pct: number;
  color: string;
}) {
  return (
    <div className="rounded-card bg-white card-pop p-3 flex flex-col items-center">
      <div className="text-xl">{emoji}</div>
      <div className="font-display font-bold text-ink mt-1" style={{ color }}>
        {pct}%
      </div>
      <div className="text-ink-faded text-[11px] mt-0.5">{label}</div>
    </div>
  );
}
