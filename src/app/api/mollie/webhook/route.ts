import { NextResponse } from "next/server";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { createMollieClient } from "@/lib/mollie";

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
  if (!household) {
    return NextResponse.json({ ok: false, reason: "unknown_customer" }, { status: 200 });
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
      await admin.from("invoices").insert({
        household_id: paymentRow.household_id,
        connection_id: paymentRow.connection_id,
        payment_id: paymentRow.id,
        net_cents: net,
        btw_cents: amountCents - net,
        gross_cents: amountCents,
      });
      // Invoice email (Resend) is sent from here in the launch config.
    }
  }

  return NextResponse.json({ ok: true });
}
