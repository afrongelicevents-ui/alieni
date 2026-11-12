/**
 * Business pricing model, chosen by the admin in Admin → Settings → Business pricing and stored in the
 * `settings` row `business_pricing`. It only controls what the website shows and calculates; payments stay
 * off (the billing functions in the database are unchanged). All amounts are in cents, excl. BTW.
 *
 *  a) per_location  fixed monthly fee per location — the amount per business type comes from Admin → Pricing
 *  b) per_job_post  a fee per job post
 *  c) tiers         monthly subscription tiers (name, up to N locations, price per month)
 *  d) free          businesses pay nothing
 *
 * Pure and safe in client components.
 */
export const BUSINESS_PRICING_MODELS = ["per_location", "per_job_post", "tiers", "free"] as const;
export type BusinessPricingModel = (typeof BUSINESS_PRICING_MODELS)[number];

export type PricingTier = { name: string; maxLocations: number; priceCents: number };
export type BusinessPricing = { model: BusinessPricingModel; jobPostCents: number | null; tiers: PricingTier[] };

export const MAX_TIERS = 5;
export const DEFAULT_BUSINESS_PRICING: BusinessPricing = { model: "per_location", jobPostCents: null, tiers: [] };

const cents = (v: unknown): number | null => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 10_000_000 ? n : null;
};

/** Reads the stored value; unknown or older shapes fall back to the default (per location). */
export function parseBusinessPricing(value: unknown): BusinessPricing {
  if (!value || typeof value !== "object") return DEFAULT_BUSINESS_PRICING;
  const v = value as Record<string, unknown>;
  // older values written by migrations 0006 / 0008
  const legacy: Record<string, BusinessPricingModel> = { per_unit_monthly: "per_location", per_job: "per_job_post" };
  const raw = typeof v.model === "string" ? (legacy[v.model] ?? v.model) : "per_location";
  const model = (BUSINESS_PRICING_MODELS as readonly string[]).includes(raw) ? (raw as BusinessPricingModel) : "per_location";
  const jobPostCents = cents(v.job_post_cents ?? v.price_excl_btw_cents);
  const tiers: PricingTier[] = Array.isArray(v.tiers)
    ? (v.tiers as unknown[])
        .map((t) => {
          const o = (t ?? {}) as Record<string, unknown>;
          const name = typeof o.name === "string" ? o.name.trim().slice(0, 40) : "";
          const maxLocations = Number(o.max_locations);
          const priceCents = cents(o.price_cents);
          return name && Number.isInteger(maxLocations) && maxLocations >= 1 && maxLocations <= 10_000 && priceCents !== null ? { name, maxLocations, priceCents } : null;
        })
        .filter((t): t is PricingTier => t !== null)
        .sort((a, b) => a.maxLocations - b.maxLocations)
        .slice(0, MAX_TIERS)
    : [];
  return { model, jobPostCents, tiers };
}

/** The value written to the settings row (snake_case, like the other settings). */
export function serializeBusinessPricing(p: BusinessPricing): Record<string, unknown> {
  return {
    model: p.model,
    job_post_cents: p.jobPostCents,
    tiers: p.tiers.map((t) => ({ name: t.name, max_locations: t.maxLocations, price_cents: t.priceCents })),
  };
}

export type BusinessQuote =
  | { kind: "per_location"; unitCents: number; units: number; monthlyCents: number }
  | { kind: "per_job_post"; jobPostCents: number }
  | { kind: "tier"; tier: PricingTier; monthlyCents: number }
  | { kind: "tier_over"; maxLocations: number } // more locations than the largest tier: price on request
  | { kind: "free" }
  | { kind: "tba" }; // the chosen model has no amount yet: nothing is charged

/**
 * What a business of `type` with `units` locations/rooms/listings sees.
 * `unitPrices` are the per-type monthly amounts from Admin → Pricing (only active rules).
 */
export function quoteFor<T extends string>(p: BusinessPricing, type: T | null, units: number, unitPrices: Partial<Record<T, number>>): BusinessQuote {
  const n = Math.max(1, Math.floor(units) || 1);
  switch (p.model) {
    case "free":
      return { kind: "free" };
    case "per_job_post":
      return p.jobPostCents && p.jobPostCents > 0 ? { kind: "per_job_post", jobPostCents: p.jobPostCents } : { kind: "tba" };
    case "tiers": {
      if (p.tiers.length === 0) return { kind: "tba" };
      const tier = p.tiers.find((t) => n <= t.maxLocations);
      return tier ? { kind: "tier", tier, monthlyCents: tier.priceCents } : { kind: "tier_over", maxLocations: p.tiers[p.tiers.length - 1].maxLocations };
    }
    default: {
      const unit = type ? unitPrices[type] : undefined;
      return unit && unit > 0 ? { kind: "per_location", unitCents: unit, units: n, monthlyCents: unit * n } : { kind: "tba" };
    }
  }
}

/** The lowest amount a visitor can see for a type (for "from €…" on overview cards); null when there is none. */
export function startingQuote<T extends string>(p: BusinessPricing, type: T, unitPrices: Partial<Record<T, number>>): BusinessQuote {
  if (p.model === "tiers") return p.tiers.length ? { kind: "tier", tier: p.tiers[0], monthlyCents: p.tiers[0].priceCents } : { kind: "tba" };
  return quoteFor(p, type, 1, unitPrices);
}

// ---------- admin form (Admin → Settings → Business pricing) ----------

/** The form keeps euro amounts as typed text ("9,95"); the server converts and validates. */
export type BusinessPricingForm = {
  model: BusinessPricingModel;
  jobPostEuro: string;
  tiers: { name: string; max: string; priceEuro: string }[];
};

const euroText = (c: number | null) => (c === null ? "" : (c / 100).toFixed(2).replace(".", ","));
const euroCents = (s: string): number | null => {
  const t = s.trim().replace(",", ".");
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
};

export function toBusinessPricingForm(p: BusinessPricing): BusinessPricingForm {
  return {
    model: p.model,
    jobPostEuro: euroText(p.jobPostCents),
    tiers: p.tiers.map((t) => ({ name: t.name, max: String(t.maxLocations), priceEuro: euroText(t.priceCents) })),
  };
}

/**
 * Validates the form for the chosen model; null = invalid. Amounts for the other models are kept when they
 * are valid, so switching back and forth does not lose them.
 */
export function fromBusinessPricingForm(f: BusinessPricingForm): BusinessPricing | null {
  if (!(BUSINESS_PRICING_MODELS as readonly string[]).includes(f.model)) return null;
  const jobPostCents = f.jobPostEuro.trim() === "" ? null : euroCents(f.jobPostEuro);
  if (f.model === "per_job_post" && (jobPostCents === null || jobPostCents <= 0)) return null;
  if (f.jobPostEuro.trim() !== "" && jobPostCents === null) return null;
  const rows = (f.tiers ?? []).filter((r) => r.name.trim() || r.max.trim() || r.priceEuro.trim());
  if (rows.length > MAX_TIERS) return null;
  const tiers: PricingTier[] = [];
  for (const r of rows) {
    const name = r.name.trim().slice(0, 40);
    const max = Number(r.max.trim());
    const price = euroCents(r.priceEuro);
    if (!name || !Number.isInteger(max) || max < 1 || max > 10_000 || price === null) return null;
    tiers.push({ name, maxLocations: max, priceCents: price });
  }
  tiers.sort((a, b) => a.maxLocations - b.maxLocations);
  if (new Set(tiers.map((t) => t.maxLocations)).size !== tiers.length) return null; // two tiers with the same limit
  if (f.model === "tiers" && tiers.length === 0) return null;
  return { model: f.model, jobPostCents, tiers };
}
