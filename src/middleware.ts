import createIntlMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { type NextRequest } from "next/server";
import { updateSession } from "./lib/supabase/middleware";

const intlMiddleware = createIntlMiddleware(routing);

/**
 * Top-level middleware: runs Supabase session refresh + auth gate first, then
 * layers next-intl on top for locale routing. The two must be composed in that
 * order because:
 *
 *   1. updateSession() may return a redirect (auth gate fired → bounce to
 *      /login). When it does, we MUST return that response verbatim —
 *      running next-intl on top would strip the Location header and leave
 *      the user stranded on the protected route they can't access.
 *   2. When no redirect is needed, we merge Supabase's refreshed session
 *      cookies onto the intl response so they reach the browser.
 *
 * The matcher excludes `/auth/*` so the OAuth callback (/auth/callback)
 * doesn't get locale-rewritten — Google's redirect URI is registered as a
 * locale-free path and mustn't turn into /zh-TW/auth/callback.
 *
 * IMPORTANT: this file MUST live at src/middleware.ts (not the project root)
 * because the project uses the src/ directory layout. `next dev` only picks
 * up middleware at src/middleware.ts in that case; a root-level file is
 * silently ignored in dev (though older docs claimed both worked).
 */
export default async function middleware(request: NextRequest) {
  const supabaseResponse = await updateSession(request);

  // If the auth gate fired, updateSession returned a redirect. Honor it —
  // next-intl would overwrite the Location header with a locale rewrite.
  if (supabaseResponse.headers.get("location")) {
    return supabaseResponse;
  }

  const intlResponse = intlMiddleware(request);

  // Copy refreshed Supabase cookies onto the intl response so the browser
  // persists them. Without this, the client-side supabase SDK can't see the
  // refreshed session on the next request.
  supabaseResponse.cookies.getAll().forEach((cookie) => {
    intlResponse.cookies.set(cookie.name, cookie.value);
  });

  return intlResponse;
}

export const config = {
  // Exclude /auth/* (OAuth callback is locale-free) and the usual static/api
  // paths. Everything else runs through auth + intl.
  matcher: ["/((?!api|auth|_next|_vercel|.*\\..*).*)"],
};
