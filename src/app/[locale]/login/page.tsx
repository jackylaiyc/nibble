"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuthStore } from "@/stores/authStore";

/**
 * Login screen — the ONLY way in to the app and onboarding.
 *
 * Nibble is pre-account in localStorage; once a parent is ready to track
 * a real child they sign in with Google so their data (eventually) syncs
 * across devices and survives cache-clears. The 7-day free trial starts
 * *after* sign-in.
 *
 * Uses Supabase's browser OAuth — we redirect to Google, the provider
 * redirects back to /auth/callback with a code, and the callback route
 * exchanges the code for a session cookie that the middleware then trusts.
 */

export default function LoginPage() {
  const locale = useLocale() as "zh-TW" | "en";
  const t = useTranslations("Login");
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If the user is already signed in (e.g. hit this page via a bookmark),
  // send them straight into the app — no point making them click Google again.
  useEffect(() => {
    if (!loading && user) {
      const redirect = searchParams.get("redirect") || "/app";
      router.replace(redirect);
    }
  }, [loading, user, router, searchParams]);

  async function signInWithGoogle() {
    setError(null);
    setBusy(true);
    try {
      const supabase = createClient();
      // Carry the post-login redirect through the OAuth round-trip so users
      // who were bumped from /app/scan end up back there after signing in.
      const redirect = searchParams.get("redirect") || "/app";
      const origin = window.location.origin;
      const callback = `${origin}/auth/callback?next=${encodeURIComponent(redirect)}`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: callback },
      });
      if (error) throw error;
      // Supabase does the redirect for us — nothing else to do.
    } catch (err) {
      console.error("[login] google sign-in failed:", err);
      setError(
        err instanceof Error
          ? err.message
          : locale === "en"
          ? "Something went wrong starting sign-in."
          : "登入啟動失敗，請再試一次。",
      );
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-cream flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        {/* Logo / brand */}
        <div className="text-center mb-10">
          <div className="text-6xl mb-4">🍎</div>
          <h1 className="font-display font-bold text-ink text-3xl">
            {locale === "en" ? "Nibble" : "寶貝小口"}
          </h1>
          <p className="mt-2 text-ink-soft">
            {t("tagline")}
          </p>
        </div>

        {/* Sign-in card */}
        <div className="rounded-bubble bg-white card-pop p-6 space-y-5">
          <div>
            <p className="font-display font-semibold text-ink text-lg">
              {t("title")}
            </p>
            <p className="mt-1 text-sm text-ink-faded leading-relaxed">
              {t("sub")}
            </p>
          </div>

          <button
            type="button"
            onClick={signInWithGoogle}
            disabled={busy || loading}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-full bg-white border border-border hover:border-peach-deep transition disabled:opacity-60 font-medium text-ink"
          >
            {busy ? (
              <span className="text-xl">⏳</span>
            ) : (
              <GoogleG />
            )}
            <span>
              {busy ? t("signingIn") : t("googleButton")}
            </span>
          </button>

          {error && (
            <p className="text-xs text-peach-deep text-center leading-snug">
              {error}
            </p>
          )}

          <p className="text-[11px] text-ink-faded text-center leading-relaxed">
            {t.rich("legal", {
              terms: (chunks) => (
                <Link href="/terms" className="underline hover:text-ink">
                  {chunks}
                </Link>
              ),
              privacy: (chunks) => (
                <Link href="/privacy" className="underline hover:text-ink">
                  {chunks}
                </Link>
              ),
            })}
          </p>
        </div>

        {/* Back to marketing */}
        <div className="text-center mt-6">
          <Link
            href="/"
            className="text-sm text-ink-faded hover:text-ink"
          >
            ← {t("backHome")}
          </Link>
        </div>
      </div>
    </main>
  );
}

/** Google's multi-color "G" mark. Inline SVG so we don't ship the full Google
 *  brand font. Sizes to 20×20 to match the button's text. */
function GoogleG() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 48 48"
      aria-hidden="true"
    >
      <path
        fill="#FFC107"
        d="M43.61 20.08H42V20H24v8h11.3c-1.65 4.66-6.08 8-11.3 8a12 12 0 0 1 0-24c3.06 0 5.85 1.15 7.96 3.04l5.66-5.66A20 20 0 1 0 24 44c11.05 0 20-8.95 20-20 0-1.34-.14-2.65-.39-3.92z"
      />
      <path
        fill="#FF3D00"
        d="M6.31 14.69l6.57 4.82A12 12 0 0 1 24 12c3.06 0 5.85 1.15 7.96 3.04l5.66-5.66A20 20 0 0 0 6.31 14.69z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.17 0 9.87-1.98 13.41-5.2l-6.19-5.24A12 12 0 0 1 24 36c-5.2 0-9.62-3.32-11.28-7.95l-6.51 5.02A20 20 0 0 0 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.61 20.08H42V20H24v8h11.3a12.06 12.06 0 0 1-4.09 5.56l6.2 5.24C41.21 34.98 44 30 44 24c0-1.34-.14-2.65-.39-3.92z"
      />
    </svg>
  );
}
