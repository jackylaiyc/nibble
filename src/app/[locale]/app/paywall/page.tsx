"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";

/**
 * In-app paywall landing.
 *
 * Right now this is just a soft redirect to the public pricing page
 * with a short explainer banner if the user bounced here from a canceled
 * Stripe checkout. Kept as its own route so scan/chat/modal CTAs have a
 * stable deep-link target, and so we can later swap in a condensed
 * in-app upsell experiment without touching consumers.
 */

export default function InAppPaywallPage() {
  const router = useRouter();
  const locale = useLocale() as "zh-TW" | "en";
  const t = useTranslations("Paywall");
  const search = useSearchParams();
  const canceled = search.get("canceled") === "1";

  useEffect(() => {
    if (canceled) return; // show the banner instead of redirecting
    router.replace("/pricing");
  }, [canceled, router]);

  if (!canceled) {
    return (
      <main className="min-h-screen flex items-center justify-center text-ink-faded">
        …
      </main>
    );
  }

  return (
    <main className="min-h-screen px-6 py-10 bg-cream">
      <div className="max-w-xl mx-auto space-y-5">
        <div className="rounded-card bg-butter/60 border border-butter-deep p-4 text-sm text-ink">
          {t("canceledBanner")}
        </div>
        <p className="font-display text-2xl font-bold text-ink">
          {locale === "en"
            ? "No worries — when you're ready:"
            : "沒關係，準備好再說："}
        </p>
        <div className="flex gap-3">
          <Link
            href="/pricing"
            className="px-6 py-3 rounded-full bg-peach-deep text-white font-semibold bubble-shadow"
          >
            {locale === "en" ? "See plans" : "看看方案"} →
          </Link>
          <Link
            href="/app"
            className="px-6 py-3 rounded-full border border-border text-ink-soft"
          >
            {locale === "en" ? "Back to app" : "回到主頁"}
          </Link>
        </div>
      </div>
    </main>
  );
}
