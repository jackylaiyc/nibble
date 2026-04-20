import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * OAuth callback — the URL Google redirects back to after the user grants
 * access on the consent screen. Lives at the top level (outside `[locale]`)
 * so the callback URL configured in the Google Cloud Console stays locale-
 * agnostic: "/auth/callback", not "/zh-TW/auth/callback".
 *
 * Flow:
 *   1. Google redirects here with ?code=xxx (+ ?next= we passed through
 *      from the login page so we can honor post-login destinations).
 *   2. We swap the code for a session cookie using Supabase's built-in
 *      PKCE exchange. The cookie is written onto the response — the next
 *      request from the browser will carry it and the middleware will see
 *      the user as authenticated.
 *   3. Redirect to `next` (falling back to `/app`), which will then be
 *      rewritten by next-intl to the user's locale prefix.
 *
 * No locale awareness needed on this route — the redirect target is a
 * locale-free path that next-intl handles at the middleware layer.
 */

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/app";
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  // User cancelled, denied consent, or Google returned an error — bounce
  // back to the login page with the error propagated for display.
  if (error || !code) {
    const loginUrl = new URL("/login", origin);
    if (error) loginUrl.searchParams.set("error", error);
    if (errorDescription) {
      loginUrl.searchParams.set("error_description", errorDescription);
    }
    return NextResponse.redirect(loginUrl);
  }

  // Build a response up-front so Supabase can stamp the session cookies
  // onto it during the exchange; we reuse the same response for redirect.
  const response = NextResponse.redirect(new URL(next, origin));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    console.error("[auth/callback] exchange failed:", exchangeError.message);
    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set("error", "exchange_failed");
    loginUrl.searchParams.set("error_description", exchangeError.message);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}
