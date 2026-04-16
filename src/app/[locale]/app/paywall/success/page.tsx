"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useSubscriptionStore } from "@/stores/subscriptionStore";

/**
 * Checkout success landing.
 *
 * Stripe redirects here with ?session_id=cs_test_…  We call
 * /api/stripe/status to read the subscription off the Checkout session
 * and write it into the local subscriptionStore, so the rest of the app
 * immediately reflects the new tier.
 *
 * Later (when Supabase exists) the webhook is the source of truth; this
 * page becomes a thin confirmation screen. For now it's both.
 */

type SyncPhase = "syncing" | "done" | "failed";

export default function CheckoutSuccessPage() {
  const locale = useLocale() as "zh-TW" | "en";
  const t = useTranslations("Paywall");
  const search = useSearchParams();
  const sessionId = search.get("session_id");
  const setSnapshot = useSubscriptionStore((s) => s.setSnapshot);

  const [phase, setPhase] = useState<SyncPhase>("syncing");

  useEffect(() => {
    if (!sessionId) {
      setPhase("failed");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/stripe/status?session_id=${encodeURIComponent(sessionId)}`,
        );
        if (!res.ok) throw new Error("status_failed");
        const data = (await res.json()) as {
          plan: "free" | "premium" | "family";
          status: "active" | "trialing" | "past_due" | "canceled" | "none";
          currentPeriodEnd: string | null;
          stripeCustomerId: string | null;
          stripeSubscriptionId: string | null;
          inTrial: boolean;
        };
        if (cancelled) return;
        setSnapshot({
          plan: data.plan,
          status: data.status,
          currentPeriodEnd: data.currentPeriodEnd,
          stripeCustomerId: data.stripeCustomerId,
          stripeSubscriptionId: data.stripeSubscriptionId,
          inTrial: data.inTrial,
        });
        setPhase("done");
      } catch {
        if (!cancelled) setPhase("failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, setSnapshot]);

  return (
    <main className="min-h-screen px-6 py-12 bg-cream flex items-center justify-center">
      <div className="max-w-md mx-auto text-center space-y-5">
        {phase === "syncing" && (
          <>
            <div className="text-5xl">🍎</div>
            <p className="font-display text-2xl font-bold text-ink">
              {t("syncingTitle")}
            </p>
            <p className="text-ink-soft text-sm">{t("syncingBody")}</p>
          </>
        )}

        {phase === "done" && (
          <>
            <div className="text-6xl">🎉</div>
            <h1 className="font-display text-3xl font-bold text-ink leading-tight">
              {t("successTitle")}
            </h1>
            <p className="text-ink-soft text-base leading-relaxed">
              {t("successBody")}
            </p>
            <Link
              href="/app"
              className="inline-block mt-2 px-8 py-3 rounded-full bg-peach-deep text-white font-semibold bubble-shadow"
            >
              {t("successCta")} →
            </Link>
          </>
        )}

        {phase === "failed" && (
          <>
            <div className="text-4xl">😅</div>
            <p className="font-display text-xl font-bold text-ink">
              {t("syncFailedTitle")}
            </p>
            <p className="text-ink-soft text-sm leading-relaxed">
              {t("syncFailedBody")}
            </p>
            <Link
              href="/app"
              className="inline-block mt-2 px-8 py-3 rounded-full border border-border text-ink-soft"
            >
              {locale === "en" ? "Back to app" : "回到主頁"}
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
