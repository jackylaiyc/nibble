import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/client";

/**
 * POST /api/stripe/portal
 *
 * Body: { customerId: string, locale?: "zh-TW" | "en" }
 *
 * Returns: { url } — Stripe Customer Portal session URL. The client
 * redirects the user there to manage card, invoices, cancel, etc.
 *
 * The customerId comes from our local subscriptionStore (populated after
 * checkout). In the Supabase-connected world this endpoint would look
 * up the current authenticated user's stripe_customer_id server-side
 * instead of trusting the body.
 */

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json(
      { error: "stripe_not_configured" },
      { status: 503 },
    );
  }

  let body: { customerId?: string; locale?: "zh-TW" | "en" };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.customerId) {
    return NextResponse.json(
      { error: "missing_customer_id" },
      { status: 400 },
    );
  }

  const origin =
    req.nextUrl.origin ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://trynibble.app";
  const localeSegment = body.locale === "en" ? "en" : "zh-TW";

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: body.customerId,
      return_url: `${origin}/${localeSegment}/app`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    // Log details server-side; never echo Stripe internals to clients.
    console.error("[stripe/portal] error", err);
    return NextResponse.json(
      { error: "portal_failed" },
      { status: 500 },
    );
  }
}
