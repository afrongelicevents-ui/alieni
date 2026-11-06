import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Minimal server-side Mollie API client (brief §6): iDEAL/SEPA mandates and
 * €14.95/month subscriptions. The API key never reaches the client.
 * Returns null while payments are not active (no key, or PAYMENTS_ACTIVE is not 'true').
 */

const BASE = "https://api.mollie.com/v2";

/** Fallback when the `household_fee_cents` setting row is missing: 0 = nothing is charged until an admin sets a price. */
export const DEFAULT_HOUSEHOLD_FEE_CENTS = 0;

export const HOUSEHOLD_SUBSCRIPTION = {
  interval: "1 month",
  description: "Alieni verbinding — maandbedrag",
} as const;

/** Integer cents → Mollie amount string ("14.95"). */
export function centsToMollieValue(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * Household monthly amount in cents (incl. btw) from the admin-editable
 * `settings` row `household_fee_cents`. Missing row → 0 (no charge).
 * Throws when the lookup fails or the stored value is not a non-negative
 * integer, so callers never charge a guessed amount. 0 means "do not charge".
 */
export async function getHouseholdFeeCents(admin: SupabaseClient): Promise<number> {
  const { data, error } = await admin.from("settings").select("value").eq("key", "household_fee_cents").maybeSingle<{ value: unknown }>();
  if (error) throw new Error("household_fee_cents lookup failed");
  if (!data) return DEFAULT_HOUSEHOLD_FEE_CENTS;
  const n = typeof data.value === "string" ? Number(data.value) : data.value;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 0) throw new Error("household_fee_cents is invalid");
  return n;
}

type MolliePayment = {
  id: string;
  status: "open" | "pending" | "paid" | "failed" | "canceled" | "expired";
  amount: { currency: string; value: string };
  sequenceType: "first" | "recurring" | "oneoff";
  customerId?: string;
  metadata?: Record<string, string> | null;
  paidAt?: string;
  amountChargedBack?: { currency: string; value: string } | null;
  _links?: { checkout?: { href: string } };
};

type MollieMandate = {
  id: string;
  status: "valid" | "pending" | "invalid";
};

async function mollieFetch<T>(key: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Mollie ${path} failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

/**
 * Charging is armed only when BOTH the payment provider key is present AND the explicit switch PAYMENTS_ACTIVE=true is set.
 * Having a key alone (for example to test in the provider's dashboard) never starts a charge.
 */
export function paymentsActive(): boolean {
  return Boolean(process.env.MOLLIE_API_KEY) && process.env.PAYMENTS_ACTIVE === "true";
}

export function createMollieClient() {
  const key = process.env.MOLLIE_API_KEY;
  if (!key || !paymentsActive()) return null;

  return {
    createCustomer(name: string, email: string) {
      return mollieFetch<{ id: string }>(key, "/customers", {
        method: "POST",
        body: JSON.stringify({ name, email }),
      });
    },

    /**
     * Verification payment that establishes the SEPA mandate at meeting
     * request time (brief §3.4): €0.01 via iDEAL, refunded automatically
     * after the mandate becomes valid. Returns the checkout URL.
     */
    createMandatePayment(customerId: string, redirectUrl: string, webhookUrl: string, metadata?: Record<string, string>) {
      return mollieFetch<MolliePayment>(key, "/payments", {
        method: "POST",
        body: JSON.stringify({
          amount: { currency: "EUR", value: "0.01" },
          customerId,
          sequenceType: "first",
          description: "Alieni — verificatie betaalmethode",
          redirectUrl,
          webhookUrl,
          metadata,
        }),
      });
    },

    getPayment(paymentId: string) {
      return mollieFetch<MolliePayment>(key, `/payments/${paymentId}`);
    },

    refundPayment(paymentId: string, amountValue: string) {
      return mollieFetch<{ id: string }>(key, `/payments/${paymentId}/refunds`, {
        method: "POST",
        body: JSON.stringify({ amount: { currency: "EUR", value: amountValue } }),
      });
    },

    listMandates(customerId: string) {
      return mollieFetch<{ _embedded?: { mandates: MollieMandate[] } }>(
        key,
        `/customers/${customerId}/mandates`,
      );
    },

    /**
     * Charge on the customer's mandate: the configured household amount
     * immediately when both sides confirm a deal, or a business's month-end amount.
     */
    createFirstCharge(
      customerId: string,
      webhookUrl: string,
      override: { value: string; description: string },
      metadata?: Record<string, string>,
    ) {
      return mollieFetch<MolliePayment>(key, "/payments", {
        method: "POST",
        body: JSON.stringify({
          amount: { currency: "EUR", value: override.value },
          customerId,
          sequenceType: "recurring",
          description: override.description,
          webhookUrl,
          metadata,
        }),
      });
    },

    /** Then the monthly subscription, starting one month later. */
    createSubscription(customerId: string, startDate: string, webhookUrl: string, amountCents: number) {
      return mollieFetch<{ id: string }>(key, `/customers/${customerId}/subscriptions`, {
        method: "POST",
        body: JSON.stringify({
          amount: { currency: "EUR", value: centsToMollieValue(amountCents) }, // incl. 21% btw (brief §6)
          ...HOUSEHOLD_SUBSCRIPTION,
          startDate,
          webhookUrl,
        }),
      });
    },

    /** One-tap cancellation (brief §3.9): stops at end of current month. */
    cancelSubscription(customerId: string, subscriptionId: string) {
      return mollieFetch<{ id: string }>(key, `/customers/${customerId}/subscriptions/${subscriptionId}`, {
        method: "DELETE",
      });
    },
  };
}
