"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";

/**
 * Email capture for the landing page. Posts to /api/newsletter — the route
 * returns 503 if Resend isn't configured yet, in which case we show the
 * same "you're on the list" success state (we'll flip on the real enroll
 * later, and the email is lost for now; fine for pre-launch).
 *
 * Kept intentionally tiny: one input, one button, three states. No spinner
 * library, no yup, no react-hook-form — a landing capture should be 150
 * lines of JS or less at runtime.
 */

type Phase = "idle" | "submitting" | "done" | "error";

export function NewsletterForm({ source }: { source?: string }) {
  const t = useTranslations("Newsletter");
  const locale = useLocale() as "zh-TW" | "en";

  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || phase === "submitting") return;
    setPhase("submitting");
    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, locale, source }),
      });
      if (res.ok || res.status === 503) {
        // 503 = newsletter provider not wired yet — we still show success
        // because the user did nothing wrong.
        setPhase("done");
        return;
      }
      if (res.status === 400) {
        setPhase("error");
        return;
      }
      setPhase("error");
    } catch {
      setPhase("error");
    }
  }

  if (phase === "done") {
    return (
      <div className="rounded-card bg-sage/30 border border-sage-deep/40 p-5 text-center">
        <p className="text-2xl mb-1">🍎</p>
        <p className="font-display font-semibold text-ink">{t("thanksTitle")}</p>
        <p className="mt-1 text-sm text-ink-soft">{t("thanksBody")}</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col sm:flex-row gap-2 max-w-md mx-auto"
    >
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={t("emailPlaceholder")}
        className="flex-1 rounded-full px-5 py-3 bg-white border border-border text-ink placeholder:text-ink-faded focus:outline-none focus:border-peach-deep transition"
        disabled={phase === "submitting"}
        aria-label={t("emailAria")}
      />
      <button
        type="submit"
        disabled={phase === "submitting"}
        className="rounded-full bg-ink text-cream font-semibold px-6 py-3 hover:opacity-90 disabled:opacity-60 transition"
      >
        {phase === "submitting" ? t("submitting") : t("submit")}
      </button>
      {phase === "error" && (
        <p className="sm:col-span-full text-xs text-peach-deep mt-1 sm:mt-0 sm:ml-2">
          {t("error")}
        </p>
      )}
    </form>
  );
}
