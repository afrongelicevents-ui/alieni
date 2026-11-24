import "server-only";
import type { BusinessType } from "./business";
import { DEFAULT_CATALOG, SERVICE_KEYS, enabledFor, type CatalogRow, type PricingRule, type ServiceKey } from "./services-shared";
import { all, bool, json, setting } from "./server/db";

export * from "./services-shared";
import { DEFAULT_BUSINESS_PRICING, parseBusinessPricing, type BusinessPricing } from "./business-pricing";

/**
 * Service catalogue (switched on per business type in Admin → Services) and the business pricing model
 * (Admin → Settings). Payments are off and the old pricing-rule ledger is gone (docs/DECISIONS.md #8), so there are
 * no per-unit prices: the per-location model shows "price to be announced".
 */
export async function getCatalog(): Promise<CatalogRow[]> {
  try {
    const rows = await all<{ service_key: string; enabled: number; business_types: string; sort_order: number }>(
      "SELECT service_key, enabled, business_types, sort_order FROM service_catalog ORDER BY sort_order",
    );
    const known = rows.filter((r) => (SERVICE_KEYS as readonly string[]).includes(r.service_key));
    if (!known.length) return DEFAULT_CATALOG;
    return known.map((r) => ({ service_key: r.service_key as ServiceKey, enabled: bool(r.enabled), business_types: json<BusinessType[]>(r.business_types, []), sort_order: r.sort_order }));
  } catch {
    return DEFAULT_CATALOG;
  }
}

/** The business pricing model chosen in Admin → Settings (default: fixed monthly fee per location). */
export async function getBusinessPricing(): Promise<BusinessPricing> {
  try {
    return parseBusinessPricing(await setting<unknown>("business_pricing", null));
  } catch {
    return DEFAULT_BUSINESS_PRICING;
  }
}

export async function getPricingContext() {
  const [catalog, businessPricing] = await Promise.all([getCatalog(), getBusinessPricing()]);
  const rules: PricingRule[] = [];
  const unitPrices: Partial<Record<BusinessType, number>> = {};
  return { catalog, rules, unitPrices, businessPricing };
}

/** Server-side gate: a request for a service that is off for this business type is refused here, not just hidden. */
export async function assertServiceEnabled(service: ServiceKey, type: BusinessType | null): Promise<boolean> {
  const catalog = await getCatalog();
  return enabledFor(catalog, service, type);
}
