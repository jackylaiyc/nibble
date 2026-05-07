"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  useChildProfileStore,
  type ProfileKind,
} from "@/stores/childProfileStore";
import {
  AGE_BUCKET_LABELS,
  ageInfoFromDob,
  trimesterFromWeeks,
  weeksPostpartumFromStart,
  weeksPregnantFromDueDate,
} from "@/lib/pediatric/ageBucket";

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

// YYYY-MM-DD for today (used as min/max bounds and as a fallback so the
// shape stays consistent for non-infant profiles whose bucket comes from
// pregnancyDueDate / breastfeedingStartDate instead).
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
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
  // Date fields are kind-specific. We keep all three pieces of state so
  // toggling between kinds doesn't lose what the user already entered.
  const [dob, setDob] = useState<string>("");
  const [dueDate, setDueDate] = useState<string>("");
  const [bfStart, setBfStart] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // Whether the date for the active kind has been filled in. The
  // "Start tracking" button is disabled until it is — without a real
  // date the RDA bucket is wrong, which defeats the point of the app.
  const dateFilled = useMemo(() => {
    if (kind === "infant") return dob !== "";
    if (kind === "pregnant") return dueDate !== "";
    return bfStart !== "";
  }, [kind, dob, dueDate, bfStart]);

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
    if (!dateFilled) return; // guard — the button is disabled but be safe
    setSaving(true);
    try {
      const trimmed = name.trim();
      const fallbackName = locale === "en" ? "Me" : "我";
      // The Child schema always carries a `dob` field (even for non-infant
      // kinds, where it's just a placeholder for the row shape). For infants
      // it carries the real DOB the caregiver picked; for pregnant /
      // breastfeeding profiles the bucket is computed off the kind-specific
      // date and the dob is set to today as a meaningless filler.
      const realDob = kind === "infant" ? dob : todayIso();
      const id = addChild({
        name: trimmed || fallbackName,
        avatar: KIND_AVATARS[kind],
        allergens: [],
        notes: "",
        kind,
        dob: realDob,
        sex: "unspecified",
        feedingStyle: kind === "infant" ? "mixed" : undefined,
        pregnancyDueDate: kind === "pregnant" ? dueDate : undefined,
        breastfeedingStartDate: kind === "breastfeeding" ? bfStart : undefined,
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
            dob={dob}
            setDob={setDob}
            dueDate={dueDate}
            setDueDate={setDueDate}
            bfStart={bfStart}
            setBfStart={setBfStart}
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
              disabled={saving || !dateFilled}
              className="flex-[2] py-3 rounded-full bg-peach-deep text-white font-semibold bubble-shadow hover:bg-peach-deep/90 transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving
                ? locale === "en" ? "Setting up…" : "建立中⋯⋯"
                : !dateFilled
                  ? locale === "en" ? "Pick a date to continue" : "請先選擇日期"
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
  dob,
  setDob,
  dueDate,
  setDueDate,
  bfStart,
  setBfStart,
}: {
  locale: "en" | "zh-TW";
  name: string;
  setName: (v: string) => void;
  kind: Exclude<ProfileKind, "newborn">;
  setKind: (k: Exclude<ProfileKind, "newborn">) => void;
  dob: string;
  setDob: (v: string) => void;
  dueDate: string;
  setDueDate: (v: string) => void;
  bfStart: string;
  setBfStart: (v: string) => void;
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

  const today = todayIso();
  // For an infant DOB picker, allow up to 14 years back. The RDA tables
  // cap at 13y; anything older falls into the 48mo+ bucket which is fine.
  const fourteenYrsAgo = (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 14);
    return d.toISOString().slice(0, 10);
  })();
  // Pregnancy lasts ~40 weeks → due date can be up to ~280 days out.
  const ninetyMonthsOut = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 280);
    return d.toISOString().slice(0, 10);
  })();

  return (
    <div className="max-w-md w-full">
      <div className="text-6xl mb-4">🚀</div>
      <h2 className="font-display font-bold text-3xl text-ink leading-tight">
        {locale === "en" ? "You're almost set" : "差一點點就好！"}
      </h2>
      <p className="mt-3 text-ink-soft leading-relaxed">
        {locale === "en"
          ? "A few quick details so we can compute the right daily nutrient targets — these depend on age and life stage."
          : "幾個小問題，幫我們算出對應你的每日營養目標——這些會依年齡與生命階段而不同。"}
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

        {/* Date — kind-specific. The RDA bucket is computed from this, so
            without a real value the daily targets default to a meaningless
            placeholder. Required to continue. */}
        {kind === "infant" && (
          <DateField
            id="setup-dob"
            label={locale === "en" ? "Baby's date of birth" : "寶貝的出生日期"}
            hint={locale === "en"
              ? "Used to pick the right age-bucket targets (6-8mo, 9-11mo, 12-23mo, …)."
              : "用來推算月齡分組目標（6-8、9-11、12-23 個月⋯）。"}
            value={dob}
            onChange={setDob}
            min={fourteenYrsAgo}
            max={today}
            preview={dob ? dobPreview(dob, locale) : null}
          />
        )}
        {kind === "pregnant" && (
          <DateField
            id="setup-due"
            label={locale === "en" ? "Estimated due date" : "預產期"}
            hint={locale === "en"
              ? "Used to pick trimester-specific targets — folate, iron, choline shift across T1/T2/T3."
              : "用來推算所在孕期——不同三個月對葉酸、鐵、膽鹼的需求不同。"}
            value={dueDate}
            onChange={setDueDate}
            min={today}
            max={ninetyMonthsOut}
            preview={dueDate ? duePreview(dueDate, locale) : null}
          />
        )}
        {kind === "breastfeeding" && (
          <DateField
            id="setup-bf"
            label={locale === "en"
              ? "When did breastfeeding start?"
              : "哺乳從什麼時候開始？"}
            hint={locale === "en"
              ? "Usually baby's birth date. Targets shift slightly between 0–6mo and 7+mo postpartum."
              : "通常是寶寶的出生日。0-6 個月與 7 個月以後的目標略有不同。"}
            value={bfStart}
            onChange={setBfStart}
            min={fourteenYrsAgo}
            max={today}
            preview={bfStart ? bfPreview(bfStart, locale) : null}
          />
        )}
      </div>
    </div>
  );
}

function DateField({
  id,
  label,
  hint,
  value,
  onChange,
  min,
  max,
  preview,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  min: string;
  max: string;
  preview: string | null;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink mb-2">
        {label}
      </label>
      <input
        id={id}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        min={min}
        max={max}
        className="w-full px-4 py-3 rounded-card bg-white border border-border focus:border-peach-deep outline-none text-ink tabular-nums"
      />
      <p className="mt-1.5 text-xs text-ink-faded leading-snug">{hint}</p>
      {preview && (
        <p className="mt-2 text-sm text-sage-deep font-medium">{preview}</p>
      )}
    </div>
  );
}

// ─── Date previews — give the caregiver immediate feedback that the
//     date they picked maps to the right life-stage bucket. ──────────

function dobPreview(dob: string, locale: "en" | "zh-TW"): string {
  try {
    const info = ageInfoFromDob(dob);
    const bucketLabel = AGE_BUCKET_LABELS[info.bucket]?.[locale] ?? info.bucket;
    if (locale === "en") {
      return info.months < 24
        ? `~${info.months} months old · ${bucketLabel}`
        : `~${info.years}y ${info.months % 12}m · ${bucketLabel}`;
    }
    return info.months < 24
      ? `約 ${info.months} 個月 · ${bucketLabel}`
      : `約 ${info.years} 歲 ${info.months % 12} 個月 · ${bucketLabel}`;
  } catch {
    return "";
  }
}

function duePreview(due: string, locale: "en" | "zh-TW"): string {
  try {
    const weeks = weeksPregnantFromDueDate(due);
    if (weeks <= 0) {
      return locale === "en"
        ? "Due date is in the future — that doesn't look like a current pregnancy."
        : "預產期看起來還沒進入孕期。";
    }
    const tri = trimesterFromWeeks(weeks);
    const labels = {
      en: { 1: "1st trimester", 2: "2nd trimester", 3: "3rd trimester" },
      "zh-TW": { 1: "第一孕期", 2: "第二孕期", 3: "第三孕期" },
    } as const;
    return locale === "en"
      ? `~${weeks} weeks pregnant · ${labels.en[tri]}`
      : `懷孕約 ${weeks} 週 · ${labels["zh-TW"][tri]}`;
  } catch {
    return "";
  }
}

function bfPreview(start: string, locale: "en" | "zh-TW"): string {
  try {
    const weeks = weeksPostpartumFromStart(start);
    const months = Math.floor(weeks / 4.345);
    const phase =
      months < 7
        ? locale === "en" ? "0-6 month phase" : "0-6 個月哺乳期"
        : locale === "en" ? "7+ month phase" : "7 個月以上哺乳期";
    return locale === "en"
      ? `~${weeks} weeks postpartum · ${phase}`
      : `產後約 ${weeks} 週 · ${phase}`;
  } catch {
    return "";
  }
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
