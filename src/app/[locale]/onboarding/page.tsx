"use client";

import { useMemo, useState, useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useChildProfileStore, type FeedingStyle } from "@/stores/childProfileStore";
import {
  AGE_BUCKET_LABELS,
  ageInfoFromDob,
} from "@/lib/pediatric/ageBucket";
import {
  ALLERGENS,
  type AllergenKey,
} from "@/lib/pediatric/allergenRegistry";

/**
 * Onboarding — DOB-first flow.
 *
 * 5 steps:
 *   1. Name + sex + avatar emoji
 *   2. Date of birth (age-bucket preview)
 *   3. Feeding style (BLW / purée / mixed)
 *   4. Known allergens (multi-select)
 *   5. Caregiver consent — legal layer 1 ("I understand this is educational")
 *
 * State lives in local component state; only committed to the
 * childProfileStore on the final Finish tap. This lets the user back out
 * at any step without leaving a half-filled child record behind.
 *
 * Auth + Supabase sync come later; for MVP we lean on localStorage so
 * the flow works end-to-end without a logged-in user.
 */

type Step = 1 | 2 | 3 | 4 | 5;

const TOTAL_STEPS = 5;

const AVATAR_CHOICES = ["🍎", "🍑", "🍐", "🥑", "🥕", "🫐", "🌸", "🐻", "🦊", "🐣"] as const;

type Sex = "female" | "male" | "unspecified";

export default function OnboardingPage() {
  const locale = useLocale() as "zh-TW" | "en";
  const t = useTranslations("Onboarding");
  const tCommon = useTranslations("Common");
  const router = useRouter();
  const addChild = useChildProfileStore((s) => s.addChild);
  const setActiveChild = useChildProfileStore((s) => s.setActiveChild);
  const loadFromStorage = useChildProfileStore((s) => s.loadFromStorage);

  // Hydrate any existing store state so re-runs don't overwrite the first child.
  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  const [step, setStep] = useState<Step>(1);

  const [name, setName] = useState("");
  const [sex, setSex] = useState<Sex>("unspecified");
  const [avatar, setAvatar] = useState<string>(AVATAR_CHOICES[0]);
  const [dob, setDob] = useState<string>(""); // YYYY-MM-DD
  const [feedingStyle, setFeedingStyle] = useState<FeedingStyle>("mixed");
  const [allergens, setAllergens] = useState<AllergenKey[]>([]);
  const [noneKnown, setNoneKnown] = useState(false);
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);

  const ageInfo = useMemo(() => (dob ? ageInfoFromDob(dob) : null), [dob]);

  // Per-step gate for the Next button.
  const canAdvance: Record<Step, boolean> = {
    1: name.trim().length > 0,
    2: !!dob && !Number.isNaN(new Date(dob).getTime()),
    3: !!feedingStyle,
    4: true, // allergens always optional
    5: consent,
  };

  function toggleAllergen(key: AllergenKey) {
    if (noneKnown) setNoneKnown(false);
    setAllergens((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  function toggleNone() {
    setNoneKnown((v) => !v);
    if (!noneKnown) setAllergens([]);
  }

  function next() {
    if (!canAdvance[step]) return;
    if (step < TOTAL_STEPS) {
      setStep((s) => (s + 1) as Step);
    } else {
      finish();
    }
  }

  function back() {
    if (step > 1) setStep((s) => (s - 1) as Step);
  }

  async function finish() {
    if (!consent || saving) return;
    setSaving(true);
    const newId = addChild({
      name: name.trim(),
      dob,
      sex,
      avatar,
      feedingStyle,
      allergens: noneKnown ? [] : allergens,
      notes: "",
    });
    // Onboarding always lands the caregiver on the just-added child —
    // otherwise siblings added after the first one stay invisible because
    // addChild preserves the previous activeChildId.
    setActiveChild(newId);
    router.push("/app");
  }

  return (
    <main className="min-h-screen flex flex-col">
      <ProgressBar step={step} />

      <div className="flex-1 flex flex-col px-6 pt-8 pb-36 max-w-xl mx-auto w-full">
        {step === 1 && (
          <Step1NameSex
            t={t}
            name={name}
            setName={setName}
            sex={sex}
            setSex={setSex}
            avatar={avatar}
            setAvatar={setAvatar}
          />
        )}
        {step === 2 && (
          <Step2Dob
            t={t}
            locale={locale}
            dob={dob}
            setDob={setDob}
            ageInfo={ageInfo}
          />
        )}
        {step === 3 && (
          <Step3FeedingStyle
            t={t}
            feedingStyle={feedingStyle}
            setFeedingStyle={setFeedingStyle}
          />
        )}
        {step === 4 && (
          <Step4Allergens
            t={t}
            locale={locale}
            allergens={allergens}
            toggle={toggleAllergen}
            noneKnown={noneKnown}
            toggleNone={toggleNone}
          />
        )}
        {step === 5 && (
          <Step5Consent t={t} consent={consent} setConsent={setConsent} />
        )}
      </div>

      {/* Sticky footer nav */}
      <nav className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-md border-t border-border px-6 py-4">
        <div className="max-w-xl mx-auto flex items-center gap-3">
          {step > 1 ? (
            <button
              onClick={back}
              className="flex-shrink-0 px-5 py-3 rounded-full text-ink-soft font-medium hover:text-ink transition"
            >
              ← {tCommon("back")}
            </button>
          ) : (
            <span className="flex-shrink-0 w-[88px]" aria-hidden />
          )}

          <button
            onClick={next}
            disabled={!canAdvance[step] || saving}
            className="flex-1 px-8 py-4 rounded-full bg-peach-deep text-white font-semibold text-lg bubble-shadow hover:bg-peach-deep/90 disabled:bg-ink-faded disabled:cursor-not-allowed transition"
          >
            {saving
              ? t("saving")
              : step === TOTAL_STEPS
                ? t("finish")
                : tCommon("next")}
          </button>
        </div>
      </nav>
    </main>
  );
}

// ─── Progress bar ─────────────────────────────────────────────────────────

function ProgressBar({ step }: { step: Step }) {
  const pct = (step / TOTAL_STEPS) * 100;
  return (
    <div className="sticky top-0 z-20 bg-cream/90 backdrop-blur-md border-b border-border px-6 pt-5 pb-4">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-ink-soft">
            🍎 Nibble
          </span>
          <span className="text-xs text-ink-faded tabular-nums">
            {step} / {TOTAL_STEPS}
          </span>
        </div>
        <div className="h-1.5 bg-border rounded-full overflow-hidden">
          <div
            className="h-full bg-peach-deep transition-all duration-300 ease-out rounded-full"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Step 1: name + sex + avatar ──────────────────────────────────────────

function Step1NameSex({
  t,
  name,
  setName,
  sex,
  setSex,
  avatar,
  setAvatar,
}: {
  t: ReturnType<typeof useTranslations<"Onboarding">>;
  name: string;
  setName: (s: string) => void;
  sex: Sex;
  setSex: (s: Sex) => void;
  avatar: string;
  setAvatar: (s: string) => void;
}) {
  return (
    <div className="space-y-8">
      <StepHeader title={t("step1Title")} sub={t("step1Sub")} />

      <div>
        <label
          htmlFor="child-name"
          className="block text-sm font-medium text-ink mb-2"
        >
          {t("nameLabel")}
        </label>
        <input
          id="child-name"
          autoFocus
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("namePlaceholder")}
          className="w-full px-5 py-4 rounded-card bg-white border border-border text-lg focus:outline-none focus:ring-2 focus:ring-peach-deep/40 focus:border-peach-deep transition"
          maxLength={40}
        />
      </div>

      <div>
        <span className="block text-sm font-medium text-ink mb-2">
          {t("avatarLabel")}
        </span>
        <div className="flex flex-wrap gap-2">
          {AVATAR_CHOICES.map((emoji) => (
            <button
              key={emoji}
              onClick={() => setAvatar(emoji)}
              type="button"
              className={`size-12 rounded-2xl text-2xl transition-all duration-200 ${
                avatar === emoji
                  ? "bg-peach/50 ring-2 ring-peach-deep scale-105"
                  : "bg-white border border-border hover:bg-cream"
              }`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="block text-sm font-medium text-ink mb-2">
          {t("sexLabel")}
        </span>
        <div className="grid grid-cols-3 gap-2">
          {(["female", "male", "unspecified"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSex(s)}
              className={`px-4 py-3 rounded-card text-sm font-medium transition-all duration-200 ${
                sex === s
                  ? "bg-sage/40 ring-2 ring-sage-deep text-ink"
                  : "bg-white border border-border text-ink-soft hover:border-sage-deep"
              }`}
            >
              {s === "female"
                ? t("sexFemale")
                : s === "male"
                  ? t("sexMale")
                  : t("sexUnspecified")}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-faded">{t("sexHint")}</p>
      </div>
    </div>
  );
}

// ─── Step 2: DOB ──────────────────────────────────────────────────────────

function Step2Dob({
  t,
  locale,
  dob,
  setDob,
  ageInfo,
}: {
  t: ReturnType<typeof useTranslations<"Onboarding">>;
  locale: "zh-TW" | "en";
  dob: string;
  setDob: (s: string) => void;
  ageInfo: ReturnType<typeof ageInfoFromDob> | null;
}) {
  // Bound to today — prevents future DOBs — and 8 years back (we serve
  // through 4yr but leave headroom for siblings the caregiver may add later).
  const today = new Date().toISOString().slice(0, 10);
  const minDate = new Date();
  minDate.setFullYear(minDate.getFullYear() - 8);
  const min = minDate.toISOString().slice(0, 10);

  return (
    <div className="space-y-8">
      <StepHeader title={t("step2Title")} sub={t("step2Sub")} />

      <div>
        <label
          htmlFor="child-dob"
          className="block text-sm font-medium text-ink mb-2"
        >
          {t("dobLabel")}
        </label>
        <input
          id="child-dob"
          type="date"
          value={dob}
          max={today}
          min={min}
          onChange={(e) => setDob(e.target.value)}
          className="w-full px-5 py-4 rounded-card bg-white border border-border text-lg focus:outline-none focus:ring-2 focus:ring-peach-deep/40 focus:border-peach-deep transition"
        />
      </div>

      {ageInfo && (
        <div className="rounded-card bg-sage/20 border border-sage/40 p-5">
          <p className="text-sm font-medium text-sage-deep">
            {ageInfo.months < 24
              ? t("dobPreviewMonths", { months: ageInfo.months })
              : t("dobPreviewYears", {
                  years: ageInfo.years,
                  months: ageInfo.months % 12,
                })}
          </p>
          <p className="mt-1 text-lg font-display font-semibold text-ink">
            {t("dobBucket", { bucket: AGE_BUCKET_LABELS[ageInfo.bucket][locale] })}
          </p>
          {!ageInfo.isSupportedAge && (
            <p className="mt-3 text-sm text-warning">
              {t("dobUnsupported")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Step 3: feeding style ────────────────────────────────────────────────

function Step3FeedingStyle({
  t,
  feedingStyle,
  setFeedingStyle,
}: {
  t: ReturnType<typeof useTranslations<"Onboarding">>;
  feedingStyle: FeedingStyle;
  setFeedingStyle: (s: FeedingStyle) => void;
}) {
  const choices: Array<{ key: FeedingStyle; titleKey: string; descKey: string; emoji: string }> = [
    { key: "blw", titleKey: "feedingBlw", descKey: "feedingBlwDesc", emoji: "🖐️" },
    { key: "puree", titleKey: "feedingPuree", descKey: "feedingPureeDesc", emoji: "🥄" },
    { key: "mixed", titleKey: "feedingMixed", descKey: "feedingMixedDesc", emoji: "🍽️" },
  ];

  return (
    <div className="space-y-6">
      <StepHeader title={t("step3Title")} sub={t("step3Sub")} />

      <div className="space-y-3">
        {choices.map(({ key, titleKey, descKey, emoji }) => {
          const selected = feedingStyle === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setFeedingStyle(key)}
              className={`w-full text-left flex items-start gap-4 p-5 rounded-card transition-all duration-200 ${
                selected
                  ? "bg-peach/30 ring-2 ring-peach-deep"
                  : "bg-white border border-border hover:border-peach-deep"
              }`}
            >
              <div className="text-3xl flex-shrink-0">{emoji}</div>
              <div className="flex-1">
                <p className="font-display font-semibold text-ink">
                  {t(titleKey as Parameters<typeof t>[0])}
                </p>
                <p className="mt-1 text-sm text-ink-soft leading-relaxed">
                  {t(descKey as Parameters<typeof t>[0])}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Step 4: allergens ────────────────────────────────────────────────────

function Step4Allergens({
  t,
  locale,
  allergens,
  toggle,
  noneKnown,
  toggleNone,
}: {
  t: ReturnType<typeof useTranslations<"Onboarding">>;
  locale: "zh-TW" | "en";
  allergens: AllergenKey[];
  toggle: (k: AllergenKey) => void;
  noneKnown: boolean;
  toggleNone: () => void;
}) {
  const top9 = ALLERGENS.filter((a) => !a.regional);
  const regional = ALLERGENS.filter((a) => a.regional);

  return (
    <div className="space-y-6">
      <StepHeader title={t("step4Title")} sub={t("step4Sub")} />

      <button
        type="button"
        onClick={toggleNone}
        className={`w-full flex items-center gap-3 p-4 rounded-card transition-all duration-200 ${
          noneKnown
            ? "bg-sage/30 ring-2 ring-sage-deep"
            : "bg-white border border-border hover:border-sage-deep"
        }`}
      >
        <div
          className={`size-6 rounded-md flex items-center justify-center transition ${
            noneKnown ? "bg-sage-deep text-white" : "bg-cream border border-border"
          }`}
        >
          {noneKnown && "✓"}
        </div>
        <span className="font-medium text-ink">{t("allergensNone")}</span>
      </button>

      <div>
        <p className="text-sm font-medium text-ink-soft mb-3">
          {t("knownAllergensLabel")}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {top9.map((a) => (
            <AllergenChip
              key={a.key}
              emoji={a.emoji}
              label={a.label[locale]}
              selected={allergens.includes(a.key) && !noneKnown}
              disabled={noneKnown}
              onClick={() => toggle(a.key)}
            />
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs text-ink-faded mb-2">{t("allergensRegionalHint")}</p>
        <div className="grid grid-cols-2 gap-2">
          {regional.map((a) => (
            <AllergenChip
              key={a.key}
              emoji={a.emoji}
              label={a.label[locale]}
              selected={allergens.includes(a.key) && !noneKnown}
              disabled={noneKnown}
              onClick={() => toggle(a.key)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function AllergenChip({
  emoji,
  label,
  selected,
  disabled,
  onClick,
}: {
  emoji: string;
  label: string;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3 rounded-card text-sm font-medium transition-all duration-200 ${
        selected
          ? "bg-peach/40 ring-2 ring-peach-deep text-ink"
          : "bg-white border border-border text-ink-soft hover:border-peach-deep"
      } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
    >
      <span className="text-xl">{emoji}</span>
      <span>{label}</span>
    </button>
  );
}

// ─── Step 5: consent ──────────────────────────────────────────────────────

function Step5Consent({
  t,
  consent,
  setConsent,
}: {
  t: ReturnType<typeof useTranslations<"Onboarding">>;
  consent: boolean;
  setConsent: (v: boolean) => void;
}) {
  return (
    <div className="space-y-6">
      <StepHeader title={t("step5Title")} sub={t("step5Sub")} />

      <div className="rounded-card bg-white border border-border p-6">
        <p className="font-medium text-ink mb-4">{t("consentPrompt")}</p>
        <ul className="space-y-3 text-sm text-ink-soft leading-relaxed">
          <li className="flex gap-3">
            <span className="flex-shrink-0 text-peach-deep font-bold">•</span>
            <span>{t("consentItem1")}</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 text-peach-deep font-bold">•</span>
            <span>{t("consentItem2")}</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 text-peach-deep font-bold">•</span>
            <span>{t("consentItem3")}</span>
          </li>
        </ul>
      </div>

      <button
        type="button"
        onClick={() => setConsent(!consent)}
        className={`w-full flex items-start gap-3 p-5 rounded-card text-left transition-all duration-200 ${
          consent
            ? "bg-sage/30 ring-2 ring-sage-deep"
            : "bg-white border border-border hover:border-sage-deep"
        }`}
      >
        <div
          className={`mt-0.5 size-6 flex-shrink-0 rounded-md flex items-center justify-center transition ${
            consent ? "bg-sage-deep text-white" : "bg-cream border border-border"
          }`}
        >
          {consent && "✓"}
        </div>
        <span className="font-medium text-ink">{t("consentCheckbox")}</span>
      </button>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function StepHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <header>
      <h1 className="font-display text-2xl md:text-3xl font-bold text-ink leading-tight">
        {title}
      </h1>
      <p className="mt-2 text-base text-ink-soft leading-relaxed">{sub}</p>
    </header>
  );
}
