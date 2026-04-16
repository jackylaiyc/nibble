"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  FOUNDING_MEMBER,
  PLANS,
  type BillingCycle,
  type PlanId,
} from "@/lib/pricing/plans";
import { useSubscriptionStore } from "@/stores/subscriptionStore";

/**
 * Pricing page — works as both the public marketing surface (landing CTA
 * target) and the in-app upgrade path (paywall target). It reads the
 * user's current tier from the subscriptionStore so the right CTA shows
 * on each card (Start trial vs. Current plan vs. Manage subscription).
 *
 * Checkout flow:
 *   1. Click "Start trial" → POST /api/stripe/checkout with planId + cycle
 *   2. Route returns a Stripe Checkout URL → we redirect
 *   3. Stripe handles card capture → redirects to /app/paywall/success
 *   4. Success page reads session_id, pulls status, updates the store
 *
 * We intentionally keep the page copy-first rather than feature-matrix
 * heavy: parents decide on price + promises, not spec sheets.
 */

export default function PricingPage() {
  const locale = useLocale() as "zh-TW" | "en";
  const t = useTranslations("Pricing");

  const loadSub = useSubscriptionStore((s) => s.loadFromStorage);
  const currentPlan = useSubscriptionStore((s) => s.currentPlan);
  const customerId = useSubscriptionStore((s) => s.stripeCustomerId);
  const subLoaded = useSubscriptionStore((s) => s.loaded);

  useEffect(() => {
    loadSub();
  }, [loadSub]);

  const [cycle, setCycle] = useState<BillingCycle>("annual");
  const [busyPlan, setBusyPlan] = useState<PlanId | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout(planId: PlanId) {
    setBusyPlan(planId);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId,
          billingCycle: cycle,
          locale,
          referralVia: readReferral(),
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        if (payload.error === "price_id_unset" || payload.error === "stripe_not_configured") {
          setError(t("cantCheckout"));
        } else {
          setError(t("checkoutError"));
        }
        return;
      }
      const data = (await res.json()) as { url: string };
      window.location.href = data.url;
    } catch {
      setError(t("checkoutError"));
    } finally {
      setBusyPlan(null);
    }
  }

  async function openPortal() {
    if (!customerId) return;
    try {
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId, locale }),
      });
      if (!res.ok) {
        setError(t("checkoutError"));
        return;
      }
      const data = (await res.json()) as { url: string };
      window.location.href = data.url;
    } catch {
      setError(t("checkoutError"));
    }
  }

  const plan = subLoaded ? currentPlan() : "free";

  return (
    <main className="min-h-screen bg-cream pb-24">
      <header className="sticky top-0 z-20 bg-cream/90 backdrop-blur-md border-b border-border px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <Link href="/app" className="text-ink-soft hover:text-ink">
            ←
          </Link>
          <h1 className="font-display text-lg font-semibold text-ink flex-1">
            {t("title")}
          </h1>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 pt-10 space-y-10">
        <section className="text-center">
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-ink leading-tight">
            {t("title")}
          </h2>
          <p className="mt-3 text-ink-soft text-base sm:text-lg">{t("sub")}</p>
          <div className="mt-6 inline-flex items-center gap-1 rounded-full bg-white p-1 border border-border">
            <ToggleBtn
              active={cycle === "monthly"}
              onClick={() => setCycle("monthly")}
            >
              {t("billingMonthly")}
            </ToggleBtn>
            <ToggleBtn
              active={cycle === "annual"}
              onClick={() => setCycle("annual")}
            >
              {t("billingAnnual")}{" "}
              <span className="ml-1 text-[11px] font-semibold text-sage-deep tabular-nums">
                {t("annualSave")}
              </span>
            </ToggleBtn>
          </div>
        </section>

        {error && (
          <div className="rounded-card border border-peach/70 bg-peach/20 p-4 text-sm text-ink">
            {error}
          </div>
        )}

        {/* Plan cards */}
        <section className="grid gap-4 md:grid-cols-3">
          <PlanCard
            name={t("planFreeName")}
            blurb={t("planFreeBlurb")}
            priceMain={locale === "en" ? "$0" : "NT$0"}
            priceHint={locale === "en" ? "Forever" : "永久免費"}
            features={[
              t("featuresFreeChildren"),
              t("featuresScansFree"),
              t("featuresChatsFree"),
              t("featuresPoopSleep"),
              t("featuresPercentilesBasic"),
              t("featuresShareBasic"),
            ]}
            cta={
              plan === "free" ? (
                <span className="block w-full text-center py-3 rounded-full border border-border text-ink-soft text-sm">
                  {t("ctaCurrent")}
                </span>
              ) : null
            }
            tone="neutral"
          />

          <PlanCard
            name={t("planPremiumName")}
            blurb={t("planPremiumBlurb")}
            priceMain={
              cycle === "annual"
                ? t("planPremiumAnnual")
                : t("planPremiumMonthly")
            }
            priceHint={
              cycle === "annual"
                ? t("annualSave")
                : locale === "en"
                  ? "Billed monthly"
                  : "每月續約"
            }
            features={[
              t("featuresUnlimitedChildren"),
              t("featuresScansUnlimited"),
              t("featuresChatsUnlimited"),
              t("featuresPoopSleep"),
              t("featuresPercentilesFull"),
              t("featuresShareClean"),
              t("featuresPdfReports"),
            ]}
            badge={t("planPremiumBadge")}
            cta={
              plan === "premium" ? (
                <button
                  type="button"
                  onClick={openPortal}
                  className="block w-full text-center py-3 rounded-full bg-ink text-cream font-semibold"
                >
                  {t("ctaManage")}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busyPlan === "premium"}
                  onClick={() => startCheckout("premium")}
                  className="block w-full text-center py-3 rounded-full bg-peach-deep text-white font-semibold bubble-shadow hover:bg-peach-deep/90 disabled:opacity-60"
                >
                  {busyPlan === "premium" ? "…" : t("ctaStart")}
                </button>
              )
            }
            tone="highlight"
          />

          <PlanCard
            name={t("planFamilyName")}
            blurb={t("planFamilyBlurb")}
            priceMain={
              cycle === "annual"
                ? t("planFamilyAnnual")
                : t("planFamilyMonthly")
            }
            priceHint={
              cycle === "annual"
                ? t("annualSave")
                : locale === "en"
                  ? "Billed monthly"
                  : "每月續約"
            }
            features={[
              t("featuresUnlimitedChildren"),
              t("featuresScansUnlimited"),
              t("featuresChatsUnlimited"),
              t("featuresPoopSleep"),
              t("featuresPercentilesFull"),
              t("featuresShareClean"),
              t("featuresPdfReports"),
              t("featuresCaregivers", { n: PLANS.family.limits.caregivers }),
            ]}
            cta={
              plan === "family" ? (
                <button
                  type="button"
                  onClick={openPortal}
                  className="block w-full text-center py-3 rounded-full bg-ink text-cream font-semibold"
                >
                  {t("ctaManage")}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busyPlan === "family"}
                  onClick={() => startCheckout("family")}
                  className="block w-full text-center py-3 rounded-full bg-sage-deep text-white font-semibold bubble-shadow hover:bg-sage-deep/90 disabled:opacity-60"
                >
                  {busyPlan === "family" ? "…" : t("ctaStart")}
                </button>
              )
            }
            tone="neutral"
          />
        </section>

        {/* Founding member */}
        <section className="rounded-bubble bg-butter/60 border border-butter-deep p-6 text-center">
          <p className="text-xs font-semibold tracking-wider text-peach-deep uppercase">
            {t("foundingTitle")}
          </p>
          <p className="mt-2 font-display text-2xl font-bold text-ink">
            {locale === "en"
              ? `$${FOUNDING_MEMBER.priceUsd} one-time · lifetime Premium`
              : `NT$${FOUNDING_MEMBER.priceTwd.toLocaleString("zh-TW")} 一次付費 · 終身高級版`}
          </p>
          <p className="mt-2 text-sm text-ink-soft max-w-xl mx-auto leading-relaxed">
            {t("foundingBody")}
          </p>
        </section>

        {/* FAQ */}
        <section className="space-y-4">
          <h3 className="font-display text-xl font-semibold text-ink text-center">
            {t("faqTitle")}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <FaqCard q={t("faq1Q")} a={t("faq1A")} />
            <FaqCard q={t("faq2Q")} a={t("faq2A")} />
            <FaqCard q={t("faq3Q")} a={t("faq3A")} />
            <FaqCard q={t("faq4Q")} a={t("faq4A")} />
          </div>
        </section>

        <p className="text-center text-xs text-ink-faded">{t("trustLine")}</p>
      </div>
    </main>
  );
}

function ToggleBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-5 py-2 rounded-full text-sm font-medium transition ${
        active ? "bg-ink text-cream" : "text-ink-soft hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function PlanCard({
  name,
  blurb,
  priceMain,
  priceHint,
  features,
  cta,
  badge,
  tone,
}: {
  name: string;
  blurb: string;
  priceMain: string;
  priceHint: string;
  features: string[];
  cta: React.ReactNode;
  badge?: string;
  tone: "neutral" | "highlight";
}) {
  return (
    <div
      className={`relative rounded-bubble p-6 card-pop ${
        tone === "highlight"
          ? "bg-white border-2 border-peach-deep"
          : "bg-white border border-border"
      }`}
    >
      {badge && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-peach-deep text-white text-[11px] font-semibold tracking-wide rounded-full px-3 py-1">
          {badge}
        </span>
      )}
      <p className="font-display text-xl font-semibold text-ink">{name}</p>
      <p className="mt-1 text-sm text-ink-soft leading-relaxed min-h-[2.5rem]">
        {blurb}
      </p>
      <p className="mt-4 font-display text-lg font-bold text-ink tabular-nums leading-tight">
        {priceMain}
      </p>
      <p className="text-xs text-ink-faded">{priceHint}</p>

      <ul className="mt-5 space-y-2 text-sm text-ink">
        {features.map((f, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-sage-deep font-semibold shrink-0">✓</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <div className="mt-6">{cta}</div>
    </div>
  );
}

function FaqCard({ q, a }: { q: string; a: string }) {
  return (
    <div className="rounded-card bg-white border border-border p-4">
      <p className="font-display font-semibold text-ink">{q}</p>
      <p className="mt-2 text-sm text-ink-soft leading-relaxed">{a}</p>
    </div>
  );
}

// Persist `?via=<code>` referral tag across navigation. Rewardful sets
// its own cookie, but we also forward the raw code so the Stripe
// metadata carries it to the webhook even if cookies are blocked.
function readReferral(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const params = new URLSearchParams(window.location.search);
    const via = params.get("via") ?? params.get("ref");
    if (via) {
      try {
        sessionStorage.setItem("nibble_ref", via);
      } catch {
        /* ignore */
      }
      return via;
    }
    return sessionStorage.getItem("nibble_ref") ?? undefined;
  } catch {
    return undefined;
  }
}
