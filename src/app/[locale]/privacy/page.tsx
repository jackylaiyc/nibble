import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { use } from "react";

/**
 * Privacy Policy.
 *
 * Focus areas, in this order: (1) we don't store baby photos, (2) Gemini
 * processes images transiently and rejects face-present frames, (3) logs
 * live in the user's own Supabase row with RLS, (4) HK/TW/SG-lean stance,
 * (5) no third-party sale. This maps to what the product actually does —
 * do not add promises the code doesn't keep.
 */

const SECTION_KEYS = [
  "whoWeAre",
  "whatWeCollect",
  "howWeUse",
  "photoHandling",
  "aiProcessing",
  "storage",
  "sharing",
  "retention",
  "rights",
  "cookies",
  "children",
  "international",
  "changes",
  "contact",
] as const;

export default function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = use(params);
  setRequestLocale(locale);

  const t = useTranslations("Privacy");
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

        <aside className="rounded-card bg-sage/20 border border-sage-deep/30 p-5">
          <p className="font-display font-semibold text-ink">
            {t("promiseTitle")}
          </p>
          <ul className="mt-3 space-y-1 text-sm text-ink-soft">
            <li>• {t("promise1")}</li>
            <li>• {t("promise2")}</li>
            <li>• {t("promise3")}</li>
            <li>• {t("promise4")}</li>
          </ul>
        </aside>

        {SECTION_KEYS.map((k) => (
          <section key={k} className="space-y-2">
            <h3 className="font-display text-xl font-semibold text-ink">
              {t(`${k}Title` as PrivacyKey)}
            </h3>
            <p className="text-base text-ink-soft whitespace-pre-line">
              {t(`${k}Body` as PrivacyKey)}
            </p>
          </section>
        ))}

        <footer className="pt-6 border-t border-border text-sm text-ink-faded">
          <p>{t("contactLine")}</p>
          <p className="mt-2">
            <Link
              href={`/${locale}/terms`}
              className="underline hover:text-ink"
            >
              {t("seeTerms")}
            </Link>
          </p>
        </footer>
      </article>
    </main>
  );
}

type PrivacyKey =
  | "title"
  | "lastUpdated"
  | "intro"
  | "promiseTitle"
  | "promise1"
  | "promise2"
  | "promise3"
  | "promise4"
  | "contactLine"
  | "seeTerms"
  | `${(typeof SECTION_KEYS)[number]}Title`
  | `${(typeof SECTION_KEYS)[number]}Body`;
