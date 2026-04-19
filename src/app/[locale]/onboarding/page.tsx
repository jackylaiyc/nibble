"use client";

import { useMemo, useState, useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  useChildProfileStore,
  type FeedingStyle,
  type ProfileKind,
} from "@/stores/childProfileStore";
import {
  AGE_BUCKET_LABELS,
  ageInfoFromDob,
  weeksPregnantFromDueDate,
  trimesterFromWeeks,
  weeksPostpartumFromStart,
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

type Step = 0 | 1 | 2 | 3 | 4 | 5;

const TOTAL_STEPS = 6;          // Step 0 (kind picker) + Steps 1-5

const AVATAR_CHOICES = ["🍎", "🍑", "🍐", "🥑", "🥕", "🫐", "🌸", "🐻", "🦊", "🐣", "🤰", "🤱"] as const;

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

  const [step, setStep] = useState<Step>(0);

  // ─── New: profile kind discriminator ────────────────────────────────────
  const [kind, setKind] = useState<ProfileKind>("infant");
  const [pregnancyDueDate, setPregnancyDueDate] = useState<string>("");
  const [breastfeedingStartDate, setBreastfeedingStartDate] = useState<string>("");

  const [name, setName] = useState("");
  const [sex, setSex] = useState<Sex>("unspecified");
  const [avatar, setAvatar] = useState<string>(AVATAR_CHOICES[0]);
  const [dob, setDob] = useState<string>(""); // YYYY-MM-DD (infant only)
  const [feedingStyle, setFeedingStyle] = useState<FeedingStyle>("mixed");
  const [allergens, setAllergens] = useState<AllergenKey[]>([]);
  const [noneKnown, setNoneKnown] = useState(false);
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);

  const ageInfo = useMemo(() => (dob ? ageInfoFromDob(dob) : null), [dob]);

  // Pregnancy / breastfeeding live previews so the user sees their derived
  // trimester / weeks-postpartum the moment they pick a date.
  const pregnancyPreview = useMemo(() => {
    if (kind !== "pregnant" || !pregnancyDueDate) return null;
    const w = weeksPregnantFromDueDate(pregnancyDueDate);
    return { weeks: w, trimester: trimesterFromWeeks(w) };
  }, [kind, pregnancyDueDate]);

  const lactationPreview = useMemo(() => {
    if (kind !== "breastfeeding" || !breastfeedingStartDate) return null;
    const w = weeksPostpartumFromStart(breastfeedingStartDate);
    return { weeks: w, months: Math.floor(w / 4.345) };
  }, [kind, breastfeedingStartDate]);

  // Per-step gate for the Next button. Step 2's gate branches on the
  // selected kind because each kind asks for a different date.
  const canAdvance: Record<Step, boolean> = {
    0: !!kind,
    1: name.trim().length > 0,
    2:
      kind === "infant"
        ? !!dob && !Number.isNaN(new Date(dob).getTime())
        : kind === "pregnant"
          ? !!pregnancyDueDate && !Number.isNaN(new Date(pregnancyDueDate).getTime())
          : !!breastfeedingStartDate &&
            !Number.isNaN(new Date(breastfeedingStartDate).getTime()),
    3: !!feedingStyle, // only reached for infants
    4: true,
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
    // Skip Step 3 (feeding style) for non-infant kinds — those users don't
    // have a feeding-style choice to make; jump straight to allergens.
    if (step === 2 && kind !== "infant") {
      setStep(4);
      return;
    }
    if (step === 5) {
      finish();
      return;
    }
    setStep((s) => (s + 1) as Step);
  }

  function back() {
    if (step === 0) return;
    // Mirror the skip in reverse: from Step 4 for non-infants, back to 2.
    if (step === 4 && kind !== "infant") {
      setStep(2);
      return;
    }
    setStep((s) => (s - 1) as Step);
  }

  async function finish() {
    if (!consent || saving) return;
    setSaving(true);

    // For non-infant profiles `dob` is unused downstream but must be a valid
    // ISO string (the Child interface requires it). Store today to keep the
    // field stable and non-breaking for any legacy code that still reads it.
    const todayIso = new Date().toISOString().slice(0, 10);
    const storedDob =
      kind === "infant"
        ? dob
        : kind === "breastfeeding"
          ? breastfeedingStartDate || todayIso
          : todayIso;

    const newId = addChild({
      name: name.trim(),
      kind,
      dob: storedDob,
      sex: kind === "infant" ? sex : undefined,
      avatar,
      feedingStyle: kind === "infant" ? feedingStyle : undefined,
      pregnancyDueDate: kind === "pregnant" ? pregnancyDueDate : undefined,
      breastfeedingStartDate:
        kind === "breastfeeding" ? breastfeedingStartDate : undefined,
      allergens: noneKnown ? [] : allergens,
      notes: "",
    });
    setActiveChild(newId);
    router.push("/app");
  }

  return (
    <main className="min-h-screen flex flex-col">
      <ProgressBar step={step} />

      <div className="flex-1 flex flex-col px-6 pt-8 pb-36 max-w-xl mx-auto w-full">
        {step === 0 && (
          <Step0KindPicker
            locale={locale}
            kind={kind}
            setKind={(k) => {
              setKind(k);
              // Reset kind-specific fields so stale values can't leak.
              setDob("");
              setPregnancyDueDate("");
              setBreastfeedingStartDate("");
              // Switch to a kind-appropriate default avatar if still on the
              // first apple — keeps the chosen kind visible at a glance.
              if (avatar === AVATAR_CHOICES[0]) {
                setAvatar(k === "pregnant" ? "🤰" : k === "breastfeeding" ? "🤱" : "🍎");
              }
            }}
          />
        )}
        {step === 1 && (
          <Step1NameSex
            t={t}
            name={name}
            setName={setName}
            sex={sex}
            setSex={setSex}
            avatar={avatar}
            setAvatar={setAvatar}
            kind={kind}
          />
        )}
        {step === 2 && kind === "infant" && (
          <Step2Dob
            t={t}
            locale={locale}
            dob={dob}
            setDob={setDob}
            ageInfo={ageInfo}
          />
        )}
        {step === 2 && kind === "pregnant" && (
          <Step2PregnancyDueDate
            locale={locale}
            dueDate={pregnancyDueDate}
            setDueDate={setPregnancyDueDate}
            preview={pregnancyPreview}
          />
        )}
        {step === 2 && kind === "breastfeeding" && (
          <Step2LactationStart
            locale={locale}
            startDate={breastfeedingStartDate}
            setStartDate={setBreastfeedingStartDate}
            preview={lactationPreview}
          />
        )}
        {step === 3 && kind === "infant" && (
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
          {step > 0 ? (
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
              : step === 5
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
  // User-facing step number is 1-based: Step 0 (kind picker) displays as "1 / 6".
  const displayStep = step + 1;
  const pct = (displayStep / TOTAL_STEPS) * 100;
  return (
    <div className="sticky top-0 z-20 bg-cream/90 backdrop-blur-md border-b border-border px-6 pt-5 pb-4">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-ink-soft">
            🍎 Nibble
          </span>
          <span className="text-xs text-ink-faded tabular-nums">
            {displayStep} / {TOTAL_STEPS}
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
  kind,
}: {
  t: ReturnType<typeof useTranslations<"Onboarding">>;
  name: string;
  setName: (s: string) => void;
  sex: Sex;
  setSex: (s: Sex) => void;
  avatar: string;
  setAvatar: (s: string) => void;
  kind: ProfileKind;
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

      {kind === "infant" && (
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
      )}
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
  // Bound to today (no future DOBs) and 13 years back. Nibble supports
  // 6mo–13yr inclusive via `child-9-13yr`; above 13 is teen/adult
  // territory that lives in other products.
  const today = new Date().toISOString().slice(0, 10);
  const minDate = new Date();
  minDate.setFullYear(minDate.getFullYear() - 13);
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

// ─── Step 0: profile kind picker ──────────────────────────────────────────
// First step of the onboarding flow. Determines which RDA table, food-caution
// rules, and subsequent steps the rest of the flow uses.

function Step0KindPicker({
  locale,
  kind,
  setKind,
}: {
  locale: "zh-TW" | "en";
  kind: ProfileKind;
  setKind: (k: ProfileKind) => void;
}) {
  const L = (en: string, zh: string) => (locale === "en" ? en : zh);
  const choices: Array<{
    key: ProfileKind;
    emoji: string;
    titleEn: string;
    titleZh: string;
    subEn: string;
    subZh: string;
  }> = [
    {
      key: "infant",
      emoji: "👶",
      titleEn: "A baby or toddler",
      titleZh: "寶寶或幼兒",
      subEn: "6 months to 4 years old. Track iron, zinc, DHA & more.",
      subZh: "6 個月到 4 歲，追蹤鐵、鋅、DHA 等關鍵營養。",
    },
    {
      key: "pregnant",
      emoji: "🤰",
      titleEn: "I'm pregnant",
      titleZh: "我正在懷孕",
      subEn: "Track folate, iron, DHA. Flag alcohol, raw fish & high-caffeine.",
      subZh: "追蹤葉酸、鐵、DHA，提醒避免酒精、生食與過量咖啡因。",
    },
    {
      key: "breastfeeding",
      emoji: "🤱",
      titleEn: "I'm breastfeeding",
      titleZh: "我正在哺乳",
      subEn: "Track iodine, DHA, calcium. Mind caffeine & timing of alcohol.",
      subZh: "追蹤碘、DHA、鈣，留意咖啡因與哺乳前的酒精。",
    },
  ];
  return (
    <div className="space-y-6">
      <StepHeader
        title={L("Who are we tracking?", "要追蹤誰的營養？")}
        sub={L(
          "Nibble tailors nutrient targets and food cautions to who you're tracking.",
          "Nibble 會依照對象調整每日營養目標與食物注意事項。",
        )}
      />
      <div className="space-y-3">
        {choices.map((c) => {
          const selected = kind === c.key;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => setKind(c.key)}
              className={`w-full text-left flex items-start gap-4 p-5 rounded-card transition-all duration-200 ${
                selected
                  ? "bg-peach/30 ring-2 ring-peach-deep"
                  : "bg-white border border-border hover:border-peach-deep"
              }`}
            >
              <div className="text-3xl flex-shrink-0">{c.emoji}</div>
              <div className="flex-1">
                <p className="font-display font-semibold text-ink">
                  {locale === "en" ? c.titleEn : c.titleZh}
                </p>
                <p className="mt-1 text-sm text-ink-soft leading-relaxed">
                  {locale === "en" ? c.subEn : c.subZh}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Step 2 variant: pregnancy due date ───────────────────────────────────

function Step2PregnancyDueDate({
  locale,
  dueDate,
  setDueDate,
  preview,
}: {
  locale: "zh-TW" | "en";
  dueDate: string;
  setDueDate: (s: string) => void;
  preview: { weeks: number; trimester: 1 | 2 | 3 } | null;
}) {
  const L = (en: string, zh: string) => (locale === "en" ? en : zh);
  // Due date must be in the future but within ~10 months.
  const todayDate = new Date();
  const today = todayDate.toISOString().slice(0, 10);
  const maxDate = new Date(todayDate);
  maxDate.setMonth(maxDate.getMonth() + 10);
  const max = maxDate.toISOString().slice(0, 10);
  return (
    <div className="space-y-8">
      <StepHeader
        title={L("When's your due date?", "預產期是什麼時候？")}
        sub={L(
          "We use the standard 40-week convention to estimate your current trimester — not a medical prediction.",
          "我們用標準的 40 週懷孕週期計算目前孕期，僅供參考，非醫療預測。",
        )}
      />
      <div>
        <label
          htmlFor="pregnancy-due-date"
          className="block text-sm font-medium text-ink mb-2"
        >
          {L("Estimated due date", "預產期")}
        </label>
        <input
          id="pregnancy-due-date"
          type="date"
          value={dueDate}
          min={today}
          max={max}
          onChange={(e) => setDueDate(e.target.value)}
          className="w-full px-5 py-4 rounded-card bg-white border border-border text-lg focus:outline-none focus:ring-2 focus:ring-peach-deep/40 focus:border-peach-deep transition"
        />
      </div>
      {preview && (
        <div className="rounded-card bg-sage/20 border border-sage/40 p-5">
          <p className="text-sm font-medium text-sage-deep">
            {L(
              `You're about ${preview.weeks} weeks pregnant.`,
              `您目前約懷孕 ${preview.weeks} 週。`,
            )}
          </p>
          <p className="mt-1 text-lg font-display font-semibold text-ink">
            {L(
              `Trimester ${preview.trimester}`,
              `第 ${preview.trimester === 1 ? "一" : preview.trimester === 2 ? "二" : "三"} 孕期`,
            )}
          </p>
          <p className="mt-2 text-xs text-ink-faded">
            {L(
              "Daily targets adjust each trimester — you'll see updated rings the moment you log your first meal.",
              "每個孕期的營養目標會自動調整，您記錄第一餐時就會看到更新後的指標。",
            )}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Step 2 variant: breastfeeding start date ─────────────────────────────

function Step2LactationStart({
  locale,
  startDate,
  setStartDate,
  preview,
}: {
  locale: "zh-TW" | "en";
  startDate: string;
  setStartDate: (s: string) => void;
  preview: { weeks: number; months: number } | null;
}) {
  const L = (en: string, zh: string) => (locale === "en" ? en : zh);
  // Start date must be in the past within the last ~2 years (cover extended BF).
  const today = new Date().toISOString().slice(0, 10);
  const minDate = new Date();
  minDate.setFullYear(minDate.getFullYear() - 2);
  const min = minDate.toISOString().slice(0, 10);
  return (
    <div className="space-y-8">
      <StepHeader
        title={L("When did you start breastfeeding?", "開始哺乳的日期？")}
        sub={L(
          "Usually your baby's birthday. We use this to calculate your nutrient needs — they're highest in the first 6 months.",
          "通常是寶寶的出生日。我們用這個日期計算每日營養需求，前 6 個月需求最高。",
        )}
      />
      <div>
        <label
          htmlFor="lactation-start"
          className="block text-sm font-medium text-ink mb-2"
        >
          {L("Breastfeeding start date", "哺乳開始日期")}
        </label>
        <input
          id="lactation-start"
          type="date"
          value={startDate}
          min={min}
          max={today}
          onChange={(e) => setStartDate(e.target.value)}
          className="w-full px-5 py-4 rounded-card bg-white border border-border text-lg focus:outline-none focus:ring-2 focus:ring-peach-deep/40 focus:border-peach-deep transition"
        />
      </div>
      {preview && (
        <div className="rounded-card bg-sage/20 border border-sage/40 p-5">
          <p className="text-sm font-medium text-sage-deep">
            {L(
              `${preview.months} months postpartum (${preview.weeks} weeks).`,
              `產後 ${preview.months} 個月（${preview.weeks} 週）。`,
            )}
          </p>
          <p className="mt-1 text-lg font-display font-semibold text-ink">
            {preview.months < 7
              ? L("0-6 month phase — higher calorie needs", "0-6 個月階段 — 熱量需求較高")
              : L("7+ month phase", "7 個月以上階段")}
          </p>
        </div>
      )}
    </div>
  );
}
