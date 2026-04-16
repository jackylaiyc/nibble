import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe/client";
import type { PlanId } from "@/lib/pricing/plans";

/**
 * GET /api/stripe/status?session_id=<checkout_session_id>
 *
 * Called by the success page after the Stripe Checkout redirect. We
 * pull the subscription off the session and return a normalized
 * snapshot the client can drop straight into its subscriptionStore.
 *
 * In the Supabase-connected world the success page would instead read
 * the webhook-written row — but in the absence of a DB we let the
 * client take authority from Stripe directly on this one-shot call.
 */

interface StatusPayload {
  plan: PlanId;
  status: "active" | "trialing" | "past_due" | "canceled" | "none";
  currentPeriodEnd: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  inTrial: boolean;
}

export async function GET(req: NextRequest) {
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json(
      { error: "stripe_not_configured" },
      { status: 503 },
    );
  }

  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "missing_session_id" }, { status: 400 });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription"],
    });

    const rawPlan = (session.metadata?.planId ?? "premium") as PlanId;
    const plan: PlanId =
      rawPlan === "family" ? "family" : rawPlan === "premium" ? "premium" : "free";

    let status: StatusPayload["status"] = "none";
    let currentPeriodEnd: string | null = null;
    let inTrial = false;
    let stripeSubscriptionId: string | null = null;

    const subscription = session.subscription;
    if (subscription && typeof subscription !== "string") {
      const sub = subscription as Stripe.Subscription;
      stripeSubscriptionId = sub.id;
      status = normalizeStatus(sub.status);
      inTrial = sub.status === "trialing";
      const periodEnd = sub.items.data[0]?.current_period_end;
      currentPeriodEnd = periodEnd
        ? new Date(periodEnd * 1000).toISOString()
        : null;
    }

    const payload: StatusPayload = {
      plan,
      status,
      currentPeriodEnd,
      stripeCustomerId:
        typeof session.customer === "string"
          ? session.customer
          : session.customer?.id ?? null,
      stripeSubscriptionId,
      inTrial,
    };

    return NextResponse.json(payload);
  } catch (err) {
    console.error("[stripe/status] error", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "status_failed", message },
      { status: 500 },
    );
  }
}

function normalizeStatus(raw: Stripe.Subscription.Status): StatusPayload["status"] {
  switch (raw) {
    case "active":
    case "trialing":
    case "past_due":
    case "canceled":
      return raw;
    case "unpaid":
      return "past_due";
    case "incomplete":
    case "incomplete_expired":
    case "paused":
      return "none";
    default:
      return "none";
  }
}
