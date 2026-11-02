import "server-only";

/**
 * Minimal server-side Mollie API client (brief §6): iDEAL/SEPA mandates and
 * €14.95/month subscriptions. The API key never reaches the client.
 * Returns null while MOLLIE_API_KEY is not configured (demo mode).
 */

const BASE = "https://api.mollie.com/v2";

export const HOUSEHOLD_SUBSCRIPTION = {
  amount: { currency: "EUR", value: "14.95" }, // incl. 21% btw (brief §6)
  interval: "1 month",
  description: "Alieni verbinding — maandbedrag",
} as const;

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

export function createMollieClient() {
  const key = process.env.MOLLIE_API_KEY;
  if (!key) return null;

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
     * Charge on the customer's mandate: €14.95 immediately when both sides
     * confirm a household deal, or a business's month-end amount.
     */
    createFirstCharge(
      customerId: string,
      webhookUrl: string,
      override?: { value: string; description: string },
    ) {
      return mollieFetch<MolliePayment>(key, "/payments", {
        method: "POST",
        body: JSON.stringify({
          amount: override ? { currency: "EUR", value: override.value } : HOUSEHOLD_SUBSCRIPTION.amount,
          customerId,
          sequenceType: "recurring",
          description: override?.description ?? HOUSEHOLD_SUBSCRIPTION.description,
          webhookUrl,
        }),
      });
    },

    /** Then the monthly subscription, starting one month later. */
    createSubscription(customerId: string, startDate: string, webhookUrl: string) {
      return mollieFetch<{ id: string }>(key, `/customers/${customerId}/subscriptions`, {
        method: "POST",
        body: JSON.stringify({
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
