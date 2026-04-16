import { NextResponse } from "next/server";

/**
 * Newsletter / launch-list signup.
 *
 * Posts the email to a Resend audience when RESEND_API_KEY + RESEND_AUDIENCE_ID
 * are set; otherwise returns 503 so the landing form can show a soft "we'll
 * email you when signup opens" fallback without pretending to enroll anyone.
 *
 * We deliberately don't pull in the Resend SDK to keep the bundle lean —
 * this route is cold-started rarely and the REST endpoint is stable. Using
 * the SDK would also force a build-time env check we don't want.
 *
 * Payload shape: { email: string, locale?: "zh-TW" | "en", source?: string }
 */

type Payload = {
  email: string;
  locale?: "zh-TW" | "en";
  source?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  const apiKey = process.env.RESEND_API_KEY;
  const audienceId = process.env.RESEND_AUDIENCE_ID;

  let body: Payload;
  try {
    body = (await req.json()) as Payload;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  if (!apiKey || !audienceId) {
    // Graceful degradation — we're not configured yet, but we don't want the
    // landing form to show a 500. The UI treats 503 as "thanks, we'll email
    // you when it's open."
    return NextResponse.json(
      {
        error: "newsletter_not_configured",
        queued: false,
      },
      { status: 503 },
    );
  }

  const res = await fetch(
    `https://api.resend.com/audiences/${audienceId}/contacts`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        unsubscribed: false,
        first_name: undefined,
        // Resend audiences don't support arbitrary tags, so we pack locale +
        // source into the contact's metadata-adjacent last_name field as a
        // dumb tag. When we outgrow this, switch to a real CRM.
        last_name: [body.locale, body.source].filter(Boolean).join(":") || undefined,
      }),
    },
  );

  if (!res.ok) {
    // 409 = already exists in audience; treat as success so repeat submits
    // don't surface an error to the user.
    if (res.status === 409) {
      return NextResponse.json({ queued: true, duplicate: true });
    }
    return NextResponse.json(
      { error: "resend_failed", status: res.status },
      { status: 502 },
    );
  }

  return NextResponse.json({ queued: true });
}
