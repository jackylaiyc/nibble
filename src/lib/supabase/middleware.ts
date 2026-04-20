import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Session refresh + auth gate. Runs on every non-api/_next request via the
 * top-level middleware.ts.
 *
 * Returns either:
 *   - A pass-through NextResponse (cookies refreshed, continue to intl) — callers
 *     should run next-intl on top of this.
 *   - A NextResponse.redirect() when the auth gate fires — callers MUST return
 *     it directly without running intl, otherwise the redirect gets replaced.
 *
 * Route classification (after stripping the locale prefix):
 *   - `/app*`, `/onboarding` → protected. Unauth users get bounced to /login.
 *   - `/login` → public but authenticated users get redirected into the app.
 *   - everything else → public.
 */

// Locales that next-intl can prefix paths with. Keep in sync with i18n/routing.
const LOCALES = ["zh-TW", "en"] as const;

function stripLocalePrefix(pathname: string): {
  path: string;
  locale: string | null;
} {
  for (const locale of LOCALES) {
    if (pathname === `/${locale}`) return { path: "/", locale };
    if (pathname.startsWith(`/${locale}/`)) {
      return { path: pathname.slice(locale.length + 1), locale };
    }
  }
  return { path: pathname, locale: null };
}

function isProtectedPath(path: string): boolean {
  return path === "/app" || path.startsWith("/app/") || path === "/onboarding";
}

function isLoginPath(path: string): boolean {
  return path === "/login";
}

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let supabaseResponse = NextResponse.next({ request });

  // If Supabase env vars aren't configured (local dev without creds), skip the
  // whole dance — auth is effectively disabled. This keeps the app usable
  // offline while the feature is being set up.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return supabaseResponse;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // Triggers a session refresh if the access token is stale. Must be awaited
  // so any refreshed cookies land on supabaseResponse before we return.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { path, locale } = stripLocalePrefix(request.nextUrl.pathname);
  const lc = locale ?? "zh-TW"; // fall back to default locale for redirects

  // Unauthenticated + hitting a protected route → send to login, preserving
  // the destination so we can route them back after sign-in.
  if (!user && isProtectedPath(path)) {
    const loginUrl = new URL(`/${lc}/login`, request.url);
    // Include the original path+search so /login can read ?redirect=...
    const originalDest = path + (request.nextUrl.search || "");
    loginUrl.searchParams.set("redirect", originalDest);
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated + hitting /login → no reason to show the login screen;
  // send them home. Honor a ?redirect= param when present.
  if (user && isLoginPath(path)) {
    const redirectParam = request.nextUrl.searchParams.get("redirect");
    const target = redirectParam && redirectParam.startsWith("/")
      ? `/${lc}${redirectParam}`
      : `/${lc}/app`;
    return NextResponse.redirect(new URL(target, request.url));
  }

  return supabaseResponse;
}
