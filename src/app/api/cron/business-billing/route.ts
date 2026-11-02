import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { createMollieClient } from "@/lib/mollie";
import { computeBillingPeriod } from "@/lib/business";
import { applyPendingUnits, isLastDayOfMonthAmsterdam } from "@/lib/billing";
import { invoiceEmail, sendEmail } from "@/lib/email";
import { getActiveRules, ruleFor } from "@/lib/services";

/**
 * Month-end business billing (brief v2 §4): on the last day of each month
 * (Europe/Amsterdam), for every business with active billing:
 *   1. compute this month's period (pro-rated in the first month)
 *   2. create the invoice (sequential number, BTW breakdown)
 *   3. collect by SEPA direct debit via Mollie (recurring payment on mandate)
 *   4. email the invoice; apply any pending unit-count change for next month
 * Idempotent: one billing row per business per period (unique constraint).
 * Runs daily via Vercel Cron; does nothing on other days (use ?force=1 to test).
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const url = new URL(request.url);
  const now = new Date();
  if (!isLastDayOfMonthAmsterdam(now) && url.searchParams.get("force") !== "1") {
    return NextResponse.json({ ok: true, skipped: "not_month_end" });
  }

  const mollie = createMollieClient();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!mollie || !supabaseUrl || !serviceKey) {
    return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 200 });
  }
  const admin = createSupabaseAdmin(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const webhookUrl = `${url.origin}/api/mollie/webhook`;

  const { data: businesses, error } = await admin.rpc("businesses_due_for_billing");
  if (error) return NextResponse.json({ ok: false }, { status: 500 });

  // Phase 1: a business is only billed when an active 'monthly_per_unit' rule exists for its sector
  // (Admin → Pricing). Without one the model is 'none' and the business is skipped entirely.
  const rules = await getActiveRules();
  let billed = 0;
  for (const b of businesses ?? []) {
    const rule = ruleFor(rules, "connect", b.business_type ?? null);
    if (!rule || rule.model !== "monthly_per_unit" || rule.amount_cents <= 0) continue;
    const { billNow, afterBilling } = applyPendingUnits(b.unit_count, null);
    const period = computeBillingPeriod({
      billingStartedAt: new Date(b.billing_started_at),
      now,
      unitCount: billNow,
      unitPriceCents: rule.amount_cents,
    });
    if (!period || period.netCents <= 0) continue;

    // 1+2. Billing row (idempotent) + invoice
    const { data: row } = await admin
      .from("business_billing_periods")
      .insert({
        business_id: b.business_id,
        period_start: period.periodStart,
        period_end: period.periodEnd,
        unit_count: period.unitCount,
        unit_price_cents: period.unitPriceCents,
        billable_days: period.billableDays,
        net_cents: period.netCents,
        btw_cents: period.btwCents,
        gross_cents: period.grossCents,
        status: "invoiced",
      })
      .select()
      .maybeSingle();
    if (!row) continue; // already billed this period

    const { data: invoice } = await admin
      .from("invoices")
      .insert({
        business_id: b.business_id,
        net_cents: period.netCents,
        btw_cents: period.btwCents,
        gross_cents: period.grossCents,
      })
      .select()
      .single();

    // 3. Direct debit on the mandate
    let molliePaymentId: string | null = null;
    try {
      const payment = await mollie.createFirstCharge(b.mollie_customer_id, webhookUrl, {
        value: (period.grossCents / 100).toFixed(2),
        description: `Alieni ${b.company_name} — ${period.periodStart.slice(0, 7)}`,
      });
      molliePaymentId = payment.id;
    } catch {
      // Mollie unreachable — the row stays 'invoiced' and is retried by ops
    }
    await admin
      .from("business_billing_periods")
      .update({ invoice_id: invoice?.id ?? null, mollie_payment_id: molliePaymentId })
      .eq("id", row.id);

    // 4. Email + pending unit count
    const { data: user } = await admin.auth.admin.getUserById(b.user_id);
    if (user?.user?.email && invoice) {
      const mail = invoiceEmail({
        number: invoice.number,
        netCents: invoice.net_cents,
        btwCents: invoice.btw_cents,
        grossCents: invoice.gross_cents,
        issuedAt: invoice.issued_at,
        description: `Alieni zakelijk — ${period.unitCount} eenheden, ${period.periodStart} t/m ${period.periodEnd}`,
      });
      await sendEmail(user.user.email, mail.subject, mail.text);
    }
    const { data: fresh } = await admin.from("business_profiles").select("pending_unit_count").eq("id", b.business_id).single();
    if (fresh?.pending_unit_count) {
      const next = applyPendingUnits(billNow, fresh.pending_unit_count).afterBilling;
      await admin.from("business_profiles").update({ unit_count: next, pending_unit_count: null }).eq("id", b.business_id);
    }
    void afterBilling;
    billed++;
  }

  return NextResponse.json({ ok: true, billed });
}
