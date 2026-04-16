import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/client";
import { PLANS, TRIAL_DAYS, type BillingCycle, type PlanId } from "@/lib/pricing/plans";

/**
 * POST /api/stripe/checkout
 *
 * Body: { planId: "premium" | "family", billingCycle: "monthly" | "annual",
 *         locale: "zh-TW" | "en", referralVia?: string, email?: string }
 *
 * Returns: { url: string } — Stripe Checkout Session URL the client
 * should redirect to. Session is configured with a 7-day trial and we
 * attach the referral code (if present) as metadata so Rewardful can
 * pick it up in the webhook.
 *
 * This route is intentionally tolerant of missing env vars: if Stripe
 * isn't configured yet (local without keys), we return 503 with a
 * developer-friendly error instead of a cryptic 500. Pricing page shows
 * that state as a "Coming soon" banner.
 */

interface CheckoutBody {
  planId: PlanId;
  billingCycle: BillingCycle;
  locale: "zh-TW" | "en";
  referralVia?: string;
  email?: string;
}

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json(
      { error: "stripe_not_configured" },
      { status: 503 },
    );
  }

  let body: CheckoutBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (body.planId !== "premium" && body.planId !== "family") {
    return NextResponse.json({ error: "invalid_plan" }, { status: 400 });
  }
  if (body.billingCycle !== "monthly" && body.billingCycle !== "annual") {
    return NextResponse.json({ error: "invalid_cycle" }, { status: 400 });
  }

  const plan = PLANS[body.planId];
  const envKey = plan.stripePriceEnv[body.billingCycle];
  if (!envKey) {
    return NextResponse.json({ error: "price_env_missing" }, { status: 500 });
  }
  const priceId = process.env[envKey];
  if (!priceId) {
    return NextResponse.json(
      { error: "price_id_unset", expected: envKey },
      { status: 503 },
    );
  }

  const origin =
    req.nextUrl.origin ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://trynibble.app";
  const localeSegment = body.locale === "en" ? "en" : "zh-TW";

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: TRIAL_DAYS,
        metadata: {
          planId: body.planId,
          billingCycle: body.billingCycle,
          referralVia: body.referralVia ?? "",
        },
      },
      metadata: {
        planId: body.planId,
        billingCycle: body.billingCycle,
        referralVia: body.referralVia ?? "",
      },
      allow_promotion_codes: true,
      // Locale is best-effort — Stripe's supported list is fixed and
      // zh-TW falls back to zh automatically.
      locale: body.locale === "en" ? "en" : "zh",
      customer_email: body.email || undefined,
      success_url: `${origin}/${localeSegment}/app/paywall/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/${localeSegment}/app/paywall?canceled=1`,
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "session_url_missing" },
        { status: 500 },
      );
    }
    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    // Log details server-side; never echo Stripe internals to clients.
    console.error("[stripe/checkout] error", err);
    return NextResponse.json(
      { error: "checkout_failed" },
      { status: 500 },
    );
  }
}
