import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe/client";

/**
 * POST /api/stripe/webhook
 *
 * Stripe calls this endpoint with subscription lifecycle events. We
 * verify the signature header (never trust the body alone) and dispatch
 * to a handler that will, once Supabase is wired, upsert into the
 * `subscriptions` table keyed by stripe_customer_id.
 *
 * Handled events (MVP):
 *   - customer.subscription.created       → create subscription row
 *   - customer.subscription.updated       → update status / period end
 *   - customer.subscription.deleted       → mark canceled
 *   - invoice.paid                         → upgrade out of trial
 *   - invoice.payment_failed               → mark past_due
 *
 * Until the Supabase project exists, we log + return 200. The client
 * polls `/api/stripe/status?session_id=…` after checkout redirect to
 * read the subscription directly from Stripe, so signup still works.
 *
 * Runtime note: must read the raw request body for signature
 * verification — do NOT parse JSON before validating.
 */

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripe || !webhookSecret) {
    console.warn(
      "[stripe/webhook] not configured — STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET missing",
    );
    return NextResponse.json({ ok: true, skipped: true });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "no_signature" }, { status: 400 });
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[stripe/webhook] signature verification failed", message);
    return NextResponse.json(
      { error: "signature_verification_failed", message },
      { status: 400 },
    );
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        console.info("[stripe/webhook] subscription", {
          id: sub.id,
          customer: sub.customer,
          status: sub.status,
          currentPeriodEnd: sub.items.data[0]?.current_period_end,
          planId: sub.metadata?.planId,
          billingCycle: sub.metadata?.billingCycle,
          referralVia: sub.metadata?.referralVia,
        });
        // TODO(supabase): upsert into `subscriptions` table keyed by
        // stripe_customer_id. Include trial_end, current_period_end,
        // cancel_at_period_end, latest_invoice_id.
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        console.info("[stripe/webhook] subscription canceled", {
          id: sub.id,
          customer: sub.customer,
        });
        // TODO(supabase): set status = 'canceled' in subscriptions row.
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        console.info("[stripe/webhook] invoice paid", {
          id: invoice.id,
          customer: invoice.customer,
          amountPaid: invoice.amount_paid,
          currency: invoice.currency,
        });
        // TODO(supabase): if trial → active transition, flip inTrial = false.
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        console.warn("[stripe/webhook] invoice payment failed", {
          id: invoice.id,
          customer: invoice.customer,
        });
        // TODO(supabase): set status = 'past_due', email the customer.
        break;
      }

      default:
        // We listen to everything Stripe sends but only act on the
        // subset above. Everything else is logged in debug mode for
        // future scope.
        if (process.env.NODE_ENV !== "production") {
          console.debug("[stripe/webhook] ignored event", event.type);
        }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[stripe/webhook] handler error", err);
    // Return 500 so Stripe retries; webhook handlers are idempotent by
    // design so retry is safe.
    return NextResponse.json(
      { error: "handler_failed" },
      { status: 500 },
    );
  }
}
