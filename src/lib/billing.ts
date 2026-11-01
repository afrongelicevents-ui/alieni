/**
 * Pure billing decisions shared by the Mollie webhook and the month-end
 * cron (brief v2 §4, §11): payment transitions, SEPA reversals, pending
 * unit-count changes. Tested without a database.
 */

export type MolliePaymentLike = {
  status: "open" | "pending" | "paid" | "failed" | "canceled" | "expired";
  amountChargedBack?: { value: string } | null;
  amountRefunded?: { value: string } | null;
};

export type PaymentTransition = "paid" | "failed" | "reversed" | "pending" | "ignore";

/**
 * What a payment webhook means for the subscription/connection:
 * - paid      → (re)activate
 * - failed    → pause, re-mask contacts, ask for a new payment method
 * - reversed  → SEPA chargeback after a paid status: same as failed
 */
export function paymentTransition(p: MolliePaymentLike): PaymentTransition {
  const chargedBack = Number(p.amountChargedBack?.value ?? "0");
  if (chargedBack > 0) return "reversed";
  if (p.status === "paid") return "paid";
  if (p.status === "failed" || p.status === "canceled" || p.status === "expired") return "failed";
  if (p.status === "open" || p.status === "pending") return "pending";
  return "ignore";
}

/** Connection status to apply for a transition (null = leave unchanged). */
export function connectionStatusFor(t: PaymentTransition): "active" | "paused" | null {
  if (t === "paid") return "active";
  if (t === "failed" || t === "reversed") return "paused";
  return null;
}

/**
 * Unit-count changes apply from the next billing month: the month that
 * just ended is billed with the old count, then the pending count becomes
 * current.
 */
export function applyPendingUnits(current: number, pending: number | null): { billNow: number; afterBilling: number } {
  return { billNow: current, afterBilling: pending ?? current };
}

/** Is `date` the last day of its month in the Europe/Amsterdam calendar? */
export function isLastDayOfMonthAmsterdam(date: Date): boolean {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" });
  const [y, m, d] = fmt.format(date).split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d === lastDay;
}
