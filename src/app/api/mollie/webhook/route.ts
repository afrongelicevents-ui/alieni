import { NextResponse } from "next/server";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { createMollieClient } from "@/lib/mollie";
import { invoiceEmail, paymentFailedEmail, sendEmail } from "@/lib/email";
import { connectionStatusFor, paymentTransition } from "@/lib/billing";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Mollie webhook (brief §7: verify authenticity, handle idempotently,
 * never trust client-side payment state).
 *
 * Mollie POSTs only a payment id. Authenticity comes from fetching that id
 * back from the Mollie API with our secret key — a forged id simply won't
 * resolve to a real payment of ours. Idempotency comes from upserting on
 * the unique mollie_payment_id column, so replays are harmless.
 */
export async function POST(request: Request) {
  // Abuse damping: each forged id still costs us a Mollie API lookup,
  // so cap per-IP attempts (real Mollie retries stay far below this).
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`mollie-webhook:${ip}`, 120, 60_000)) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  const mollie = createMollieClient();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!mollie || !supabaseUrl || !serviceKey) {
    // Not configured yet — acknowledge so Mollie does not retry forever.
    return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 200 });
  }

  const form = await request.formData();
  const paymentId = form.get("id");
  if (typeof paymentId !== "string" || !/^tr_[A-Za-z0-9]+$/.test(paymentId)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // 1. Verify by fetching from Mollie with our API key.
  let payment;
  try {
    payment = await mollie.getPayment(paymentId);
  } catch {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  const admin = createSupabaseAdmin(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // 2. Resolve the household behind the Mollie customer. An unmatched
  // customer (e.g. deleted account) is acknowledged with 200 so Mollie
  // does not retry forever — the payment is simply not recorded.
  const { data: household } = await admin
    .from("profiles")
    .select("id")
    .eq("mollie_customer_id", payment.customerId ?? "")
    .maybeSingle();

  // ---- Business month-end direct debit (brief v2 §4, §11) ----
  if (!household) {
    const { data: business } = await admin
      .from("business_profiles")
      .select("id, user_id")
      .eq("mollie_customer_id", payment.customerId ?? "")
      .maybeSingle();
    if (!business) {
      return NextResponse.json({ ok: false, reason: "unknown_customer" }, { status: 200 });
    }
    const transition = paymentTransition(payment);
    const periodStatus =
      transition === "paid" ? "paid" : transition === "reversed" ? "reversed" : transition === "failed" ? "failed" : null;
    if (periodStatus) {
      await admin
        .from("business_billing_periods")
        .update({ status: periodStatus })
        .eq("mollie_payment_id", payment.id);
    }
    const connStatus = connectionStatusFor(transition);
    if (connStatus === "paused") {
      // Pause billing + every connection of this business → contacts re-masked
      await admin.from("business_profiles").update({ billing_paused_at: new Date().toISOString(), payment_failed_at: new Date().toISOString() }).eq("id", business.id);
      await admin.from("connections").update({ status: "paused" }).eq("household_id", business.user_id).eq("status", "active");
      const { data: user } = await admin.auth.admin.getUserById(business.user_id);
      if (user?.user?.email) {
        const mail = paymentFailedEmail();
        await sendEmail(user.user.email, mail.subject, mail.text);
      }
    } else if (connStatus === "active") {
      await admin.from("business_profiles").update({ billing_paused_at: null, payment_failed_at: null }).eq("id", business.id);
      await admin.from("connections").update({ status: "active" }).eq("household_id", business.user_id).eq("status", "paused");
    }
    return NextResponse.json({ ok: true, business: true, transition });
  }

  // 3. Idempotent upsert of the payment row.
  const amountCents = Math.round(Number(payment.amount.value) * 100);
  const { data: paymentRow, error } = await admin
    .from("payments")
    .upsert(
      {
        mollie_payment_id: payment.id,
        type: payment.sequenceType === "first" ? "verification" : "subscription",
        status: payment.status,
        amount_cents: amountCents,
        paid_at: payment.paidAt ?? null,
        household_id: household.id,
      },
      { onConflict: "mollie_payment_id" },
    )
    .select()
    .single();

  if (error || !paymentRow) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  // 3. Follow-up actions, each safe to repeat.
  if (payment.status === "paid" && payment.sequenceType === "first" && payment.customerId) {
    // Mandate established: store it and refund the €0.01 verification.
    const mandates = await mollie.listMandates(payment.customerId);
    const valid = mandates._embedded?.mandates.find((m) => m.status === "valid" || m.status === "pending");
    if (valid) {
      await admin
        .from("profiles")
        .update({ mollie_mandate_id: valid.id })
        .eq("mollie_customer_id", payment.customerId);
    }
    if (amountCents > 0) {
      try {
        await mollie.refundPayment(payment.id, payment.amount.value);
      } catch {
        // Already refunded on a webhook replay — fine.
      }
    }

    // Mandate in place → charge €14.95 now for each active connection that
    // has no subscription yet, and start the monthly subscription (brief §3.7).
    if (valid) {
      const webhookUrl = `${new URL(request.url).origin}/api/mollie/webhook`;
      const { data: conns } = await admin
        .from("connections")
        .select("id")
        .eq("household_id", household.id)
        .eq("status", "active")
        .is("mollie_subscription_id", null);
      for (const conn of conns ?? []) {
        // Claim the connection first so a webhook replay cannot double-charge.
        const { data: claimed } = await admin
          .from("connections")
          .update({ mollie_customer_id: payment.customerId, mollie_subscription_id: "pending" })
          .eq("id", conn.id)
          .is("mollie_subscription_id", null)
          .select("id")
          .maybeSingle();
        if (!claimed) continue;
        try {
          const charge = await mollie.createFirstCharge(payment.customerId, webhookUrl);
          await admin.from("payments").upsert(
            { mollie_payment_id: charge.id, type: "subscription", status: charge.status, amount_cents: Math.round(Number(charge.amount.value) * 100), household_id: household.id, connection_id: conn.id },
            { onConflict: "mollie_payment_id" },
          );
          const start = new Date();
          start.setUTCMonth(start.getUTCMonth() + 1);
          const sub = await mollie.createSubscription(payment.customerId, start.toISOString().slice(0, 10), webhookUrl);
          await admin.from("connections").update({ mollie_subscription_id: sub.id }).eq("id", conn.id);
        } catch {
          // Release the claim so the next webhook (or a retry) can try again.
          await admin.from("connections").update({ mollie_subscription_id: null }).eq("id", conn.id).eq("mollie_subscription_id", "pending");
        }
      }
    }
  }

  if (payment.status === "paid" && payment.sequenceType === "recurring" && paymentRow.connection_id) {
    // First monthly charge paid → issue the invoice (sequential number,
    // btw breakdown) exactly once per payment.
    const { data: existing } = await admin
      .from("invoices")
      .select("id")
      .eq("payment_id", paymentRow.id)
      .maybeSingle();
    if (!existing) {
      const net = Math.round(amountCents / 1.21);
      const { data: invoice } = await admin
        .from("invoices")
        .insert({
          household_id: paymentRow.household_id,
          connection_id: paymentRow.connection_id,
          payment_id: paymentRow.id,
          net_cents: net,
          btw_cents: amountCents - net,
          gross_cents: amountCents,
        })
        .select()
        .single();

      // Invoice email with btw breakdown (brief §3.7) — once per invoice,
      // because the insert above runs only once per payment.
      if (invoice) {
        const { data: user } = await admin.auth.admin.getUserById(paymentRow.household_id);
        if (user?.user?.email) {
          const mail = invoiceEmail({
            number: invoice.number,
            netCents: invoice.net_cents,
            btwCents: invoice.btw_cents,
            grossCents: invoice.gross_cents,
            issuedAt: invoice.issued_at,
            description: "Alieni verbinding — maandbedrag",
          });
          await sendEmail(user.user.email, mail.subject, mail.text);
        }
      }
    }
  }

  // ---- Household SEPA failure / chargeback → pause (re-masks contacts) ----
  if (payment.sequenceType === "recurring") {
    const transition = paymentTransition(payment);
    const connStatus = connectionStatusFor(transition);
    if (connStatus === "paused") {
      await admin.from("connections").update({ status: "paused" }).eq("household_id", household.id).eq("status", "active");
      const { data: user } = await admin.auth.admin.getUserById(household.id);
      if (user?.user?.email) {
        const mail = paymentFailedEmail();
        await sendEmail(user.user.email, mail.subject, mail.text);
      }
    } else if (connStatus === "active") {
      await admin.from("connections").update({ status: "active" }).eq("household_id", household.id).eq("status", "paused");
    }
  }

  return NextResponse.json({ ok: true });
}
