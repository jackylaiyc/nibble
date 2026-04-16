import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { use } from "react";

/**
 * Terms of Service.
 *
 * Copy is intentionally plain-language and education-framed: Nibble is a
 * tracker, not a medical service. This page is the anchor the rest of the
 * product points at (onboarding consent, chat disclaimer footer, landing
 * footer) — so it has to match those promises word-for-word. Swap for a
 * iubenda-generated doc once we engage a lawyer, but this gets us launch-
 * ready and legible.
 */

const SECTION_KEYS = [
  "nature",
  "notMedical",
  "eligibility",
  "account",
  "subscriptions",
  "content",
  "photos",
  "acceptable",
  "liability",
  "changes",
  "governing",
  "contact",
] as const;

export default function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = use(params);
  setRequestLocale(locale);

  const t = useTranslations("Terms");
  const tBrand = useTranslations("Brand");

  return (
    <main className="min-h-screen bg-cream pb-24">
      <header className="sticky top-0 z-20 bg-cream/90 backdrop-blur-md border-b border-border px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <Link href={`/${locale}`} className="text-ink-soft hover:text-ink">
            ←
          </Link>
          <h1 className="font-display text-lg font-semibold text-ink flex-1">
            {t("title")}
          </h1>
        </div>
      </header>

      <article className="max-w-3xl mx-auto px-6 pt-10 space-y-8 text-ink leading-relaxed">
        <header>
          <p className="text-xs tracking-wider uppercase text-ink-faded">
            {tBrand("name")} · {tBrand("nameZh")}
          </p>
          <h2 className="mt-2 font-display text-3xl font-bold">{t("title")}</h2>
          <p className="mt-2 text-sm text-ink-soft">{t("lastUpdated")}</p>
          <p className="mt-4 text-base text-ink-soft">{t("intro")}</p>
        </header>

        {SECTION_KEYS.map((k) => (
          <section key={k} className="space-y-2">
            <h3 className="font-display text-xl font-semibold text-ink">
              {t(`${k}Title` as TermsKey)}
            </h3>
            <p className="text-base text-ink-soft whitespace-pre-line">
              {t(`${k}Body` as TermsKey)}
            </p>
          </section>
        ))}

        <footer className="pt-6 border-t border-border text-sm text-ink-faded">
          <p>{t("contactLine")}</p>
          <p className="mt-2">
            <Link
              href={`/${locale}/privacy`}
              className="underline hover:text-ink"
            >
              {t("seePrivacy")}
            </Link>
          </p>
        </footer>
      </article>
    </main>
  );
}

type TermsKey =
  | "title"
  | "lastUpdated"
  | "intro"
  | "contactLine"
  | "seePrivacy"
  | `${(typeof SECTION_KEYS)[number]}Title`
  | `${(typeof SECTION_KEYS)[number]}Body`;
