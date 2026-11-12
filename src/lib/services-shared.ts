import type { BusinessType } from "./business";

/**
 * Service catalogue + pricing rules — pure types, constants and helpers that
 * are safe in client components. Database access lives in ./services.ts.
 */
export const SERVICE_KEYS = ["connect", "oneoff", "contract"] as const;
export type ServiceKey = (typeof SERVICE_KEYS)[number];
export const PRICING_MODELS = ["none", "monthly_per_unit", "per_event", "per_booking", "percent"] as const;
export type PricingModel = (typeof PRICING_MODELS)[number];

export type CatalogRow = { service_key: ServiceKey; enabled: boolean; business_types: BusinessType[]; sort_order: number };
export type PricingRule = {
  id: string;
  service_key: ServiceKey;
  business_type: BusinessType | null;
  model: PricingModel;
  amount_cents: number;
  percent: number | null;
  unit: string | null;
  valid_from: string;
  valid_to: string | null;
  active: boolean;
  notes: string | null;
};

/** What the catalogue looks like before Part 10 has run (and in demo mode). */
export const DEFAULT_CATALOG: CatalogRow[] = SERVICE_KEYS.map((k, i) => ({ service_key: k, enabled: true, business_types: [], sort_order: i }));

export function enabledFor(catalog: CatalogRow[], service: ServiceKey, type: BusinessType | null): boolean {
  const row = catalog.find((c) => c.service_key === service);
  if (!row || !row.enabled) return false;
  if (row.business_types.length === 0) return true;
  return type !== null && row.business_types.includes(type);
}

/** Type-specific rule wins over an all-types rule; null when nothing applies. */
export function ruleFor(rules: PricingRule[], service: ServiceKey, type: BusinessType | null): PricingRule | null {
  const specific = type ? rules.find((r) => r.service_key === service && r.business_type === type) : undefined;
  return specific ?? rules.find((r) => r.service_key === service && r.business_type === null) ?? null;
}

/** Monthly per-unit price for the 'connect' service, per business type — only where an active rule says so. */
export function monthlyUnitPrices(rules: PricingRule[]): Partial<Record<BusinessType, number>> {
  const out: Partial<Record<BusinessType, number>> = {};
  for (const type of ["airbnb", "hotel", "restaurant", "office"] as BusinessType[]) {
    const r = ruleFor(rules, "connect", type);
    if (r && r.model === "monthly_per_unit") out[type] = r.amount_cents;
  }
  return out;
}

export const SERVICE_LABEL: Record<ServiceKey, { nl: string; en: string }> = {
  connect: { nl: "Schoonmakers vinden & koppelen", en: "Find & connect cleaners" },
  oneoff: { nl: "Eenmalige schoonmaak", en: "One-off cleaning" },
  contract: { nl: "Vast schoonmaakcontract", en: "Regular cleaning contract" },
};

export const MODEL_LABEL: Record<PricingModel, { nl: string; en: string }> = {
  none: { nl: "Geen (niets wordt berekend)", en: "None (nothing is charged)" },
  monthly_per_unit: { nl: "Per eenheid per maand", en: "Per unit per month" },
  per_event: { nl: "Per gebeurtenis", en: "Per event" },
  per_booking: { nl: "Per boeking", en: "Per booking" },
  percent: { nl: "Percentage", en: "Percentage" },
};
