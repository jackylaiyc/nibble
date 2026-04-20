import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { use } from "react";
import { NewsletterForm } from "@/components/marketing/NewsletterForm";

/**
 * Landing page — marketing, not app-shell.
 * Speaks directly to anxious new parents, leads with the plate-scan hero,
 * then pain → how-it-works → features grid → final CTA. Keep everything
 * above the fold reachable on a 360-width phone viewport.
 */

export default function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  // Setting the request locale directly on the page (rather than relying
  // only on the layout) is what next-intl v4 recommends — layout + page run
  // concurrently as server components, so the page needs its own call for
  // useTranslations to resolve to the URL locale, not defaultLocale.
  const { locale } = use(params);
  setRequestLocale(locale);

  const t = useTranslations("Landing");
  const tBrand = useTranslations("Brand");
  const tNav = useTranslations("Nav");
  const tDisclaimer = useTranslations("Disclaimer");

  return (
    <main className="min-h-screen flex flex-col">
      <Header tBrand={tBrand} tNav={tNav} />

      {/* Hero */}
      <section className="relative px-6 pt-16 pb-24 md:pt-24 md:pb-32 text-center overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-10 left-4 size-40 rounded-full bg-butter/60 blur-3xl" />
          <div className="absolute top-32 right-4 size-56 rounded-full bg-peach/50 blur-3xl" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 size-64 rounded-full bg-sage/40 blur-3xl" />
        </div>

        <div className="mx-auto max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-sage/30 px-4 py-1.5 text-sm font-medium text-sage-deep">
            <span className="text-base">🍎</span>
            <span>{tBrand("name")} · {tBrand("nameZh")}</span>
          </span>

          <h1 className="mt-6 font-display text-4xl md:text-6xl font-bold leading-[1.15] text-ink">
            {t("heroTitle")}
          </h1>

          <p className="mt-6 text-lg md:text-xl text-ink-soft leading-relaxed max-w-2xl mx-auto">
            {t("heroSub")}
          </p>

          <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/onboarding"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-peach-deep text-white font-semibold px-8 py-4 text-lg bubble-shadow hover:bg-peach-deep/90 transition"
            >
              {t("heroCta")} →
            </Link>
            <a
              href="#how"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-white/80 text-ink font-medium px-8 py-4 text-lg border border-border hover:bg-white transition"
            >
              {t("heroSecondary")}
            </a>
          </div>

          <p className="mt-4 text-sm text-ink-faded">{t("noCreditCard")}</p>
        </div>

        {/* Mocked scan card */}
        <div className="mx-auto mt-16 max-w-md rounded-bubble bg-white card-pop p-6 text-left">
          <div className="flex items-center gap-3">
            <div className="size-12 rounded-2xl bg-butter flex items-center justify-center text-2xl">🥣</div>
            <div>
              <p className="font-display font-semibold text-ink">{t("demoMealLabel")}</p>
              <p className="text-xs text-ink-faded">{t("demoChildLabel")}</p>
            </div>
            <span className="ml-auto text-xs font-medium text-sage-deep bg-sage/30 rounded-full px-3 py-1">{t("demoStatus")}</span>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <NutrientRing emoji="⚙️" label={t("demoNutrientIron")} pct={72} color="#6fb38a" />
            <NutrientRing emoji="✨" label={t("demoNutrientZinc")} pct={48} color="#f5cf66" />
            <NutrientRing emoji="🦴" label={t("demoNutrientCalcium")} pct={91} color="#a8d5ba" />
          </div>
          <p className="mt-4 text-sm text-ink-soft leading-relaxed">
            {t("demoSuggestion")}
          </p>
        </div>
      </section>

      {/* Pain section */}
      <section className="px-6 py-20 bg-white">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center font-display text-3xl md:text-4xl font-bold text-ink mb-12">
            {t("painTitle")}
          </h2>
          <div className="grid sm:grid-cols-2 gap-5">
            <PainCard emoji="🤷🏻‍♀️" title={t("pain1Title")} desc={t("pain1Desc")} />
            <PainCard emoji="⚙️" title={t("pain2Title")} desc={t("pain2Desc")} />
            <PainCard emoji="💩" title={t("pain3Title")} desc={t("pain3Desc")} />
            <PainCard emoji="🥜" title={t("pain4Title")} desc={t("pain4Desc")} />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="px-6 py-20 bg-cream">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center font-display text-3xl md:text-4xl font-bold text-ink mb-12">
            {t("howTitle")}
          </h2>
          <ol className="grid md:grid-cols-3 gap-6">
            <HowStep num="1" emoji="📸" title={t("how1Title")} desc={t("how1Desc")} />
            <HowStep num="2" emoji="✨" title={t("how2Title")} desc={t("how2Desc")} />
            <HowStep num="3" emoji="💬" title={t("how3Title")} desc={t("how3Desc")} />
          </ol>
        </div>
      </section>

      {/* Features grid */}
      <section className="px-6 py-20 bg-white">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center font-display text-3xl md:text-4xl font-bold text-ink mb-12">
            {t("featuresTitle")}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { emoji: "📸", key: "feature1" },
              { emoji: "💬", key: "feature2" },
              { emoji: "💩", key: "feature3" },
              { emoji: "😴", key: "feature4" },
              { emoji: "🎉", key: "feature5" },
              { emoji: "⚠️", key: "feature6" },
              { emoji: "📈", key: "feature7" },
              { emoji: "💌", key: "feature8" },
            ].map(({ emoji, key }) => (
              <div
                key={key}
                className="flex flex-col items-center text-center p-5 rounded-card bg-cream border border-border wiggle-on-hover"
              >
                <div className="text-3xl mb-2">{emoji}</div>
                <p className="font-medium text-sm text-ink">
                  {t(key as "feature1" | "feature2" | "feature3" | "feature4" | "feature5" | "feature6" | "feature7" | "feature8")}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-6 py-24 bg-gradient-to-b from-cream to-butter/40 text-center">
        <div className="mx-auto max-w-2xl">
          <div className="text-6xl mb-6">🍎</div>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-ink">
            {t("finalCtaTitle")}
          </h2>
          <p className="mt-4 text-lg text-ink-soft">{t("finalCtaDesc")}</p>
          <Link
            href="/onboarding"
            className="mt-8 inline-flex items-center justify-center gap-2 rounded-full bg-peach-deep text-white font-semibold px-10 py-4 text-lg bubble-shadow hover:bg-peach-deep/90 transition"
          >
            {t("finalCta")} →
          </Link>
        </div>
      </section>

      {/* Email capture — for folks who bounce past the trial CTA */}
      <section className="px-6 py-16 bg-white border-t border-border">
        <div className="mx-auto max-w-xl text-center">
          <h3 className="font-display text-2xl md:text-3xl font-bold text-ink">
            {t("emailCaptureTitle")}
          </h3>
          <p className="mt-3 text-ink-soft leading-relaxed">
            {t("emailCaptureSub")}
          </p>
          <div className="mt-6">
            <NewsletterForm source="landing-final" />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-10 bg-white border-t border-border text-center">
        <p className="text-xs text-ink-faded max-w-xl mx-auto leading-relaxed">
          {tDisclaimer("footer")}
        </p>
        <nav className="mt-5 flex items-center justify-center gap-5 text-sm text-ink-soft">
          <Link href="/pricing" className="hover:text-ink">
            {t("footerPricing")}
          </Link>
          <Link href="/terms" className="hover:text-ink">
            {t("footerTerms")}
          </Link>
          <Link href="/privacy" className="hover:text-ink">
            {t("footerPrivacy")}
          </Link>
        </nav>
        <p className="mt-5 text-sm font-display text-ink-soft">
          {tBrand("name")} · {tBrand("nameZh")} © 2026
        </p>
      </footer>
    </main>
  );
}

function Header({
  tBrand,
  tNav,
}: {
  tBrand: (k: "name" | "nameZh") => string;
  tNav: (k: "home" | "features" | "pricing" | "login" | "signup") => string;
}) {
  return (
    <header className="px-6 py-4 flex items-center justify-between bg-cream/80 backdrop-blur-md sticky top-0 z-30 border-b border-border/60">
      <div className="flex items-center gap-2 font-display font-bold text-ink">
        <span className="text-xl">🍎</span>
        <span>{tBrand("name")}</span>
      </div>
      <nav className="hidden md:flex items-center gap-6 text-sm text-ink-soft">
        <a href="#how" className="hover:text-ink">{tNav("features")}</a>
        <Link href="/pricing" className="hover:text-ink">{tNav("pricing")}</Link>
        <Link href="/login" className="hover:text-ink">{tNav("login")}</Link>
      </nav>
      <Link
        href="/onboarding"
        className="rounded-full bg-peach-deep text-white text-sm font-semibold px-5 py-2 hover:bg-peach-deep/90 transition"
      >
        {tNav("signup")}
      </Link>
    </header>
  );
}

function NutrientRing({
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
  const stroke = 6;
  const r = 28;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.min(pct, 100) / 100);
  return (
    <div className="flex flex-col items-center">
      <div className="relative size-16">
        <svg viewBox="0 0 64 64" className="-rotate-90 size-16">
          <circle cx="32" cy="32" r={r} stroke="#f0e6d2" strokeWidth={stroke} fill="none" />
          <circle
            cx="32"
            cy="32"
            r={r}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-lg">{emoji}</div>
      </div>
      <p className="mt-2 text-xs text-ink-soft">{label}</p>
      <p className="font-display font-semibold text-sm text-ink">{pct}%</p>
    </div>
  );
}

function PainCard({ emoji, title, desc }: { emoji: string; title: string; desc: string }) {
  return (
    <div className="flex gap-4 p-5 rounded-card bg-cream border border-border">
      <div className="text-3xl flex-shrink-0">{emoji}</div>
      <div>
        <p className="font-display font-semibold text-ink">{title}</p>
        <p className="mt-1 text-sm text-ink-soft leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

function HowStep({
  num,
  emoji,
  title,
  desc,
}: {
  num: string;
  emoji: string;
  title: string;
  desc: string;
}) {
  return (
    <li className="relative flex flex-col items-center text-center p-6 rounded-bubble bg-white card-pop">
      <div className="absolute -top-4 size-8 rounded-full bg-peach text-white font-display font-bold flex items-center justify-center text-sm">
        {num}
      </div>
      <div className="text-4xl mt-2">{emoji}</div>
      <p className="mt-3 font-display font-semibold text-lg text-ink">{title}</p>
      <p className="mt-2 text-sm text-ink-soft leading-relaxed">{desc}</p>
    </li>
  );
}
