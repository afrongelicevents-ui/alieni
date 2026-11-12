import "server-only";
import { createClient as createAnon } from "@supabase/supabase-js";
import type { BusinessType } from "./business";
import { DEFAULT_CATALOG, SERVICE_KEYS, enabledFor, monthlyUnitPrices, type CatalogRow, type PricingRule, type ServiceKey } from "./services-shared";

export * from "./services-shared";
import { DEFAULT_BUSINESS_PRICING, parseBusinessPricing, type BusinessPricing } from "./business-pricing";

/**
 * Service catalogue + pricing rules (Phase 1 foundations).
 * Services are switched on per business type in Admin → Services.
 * Prices are rules in Admin → Pricing; with no active rule the model is
 * 'none' and nothing is charged or owed.
 */
/** Public-readable tables: an anonymous client keeps static pages prerenderable. */
function anon() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createAnon(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function getCatalog(): Promise<CatalogRow[]> {
  const supabase = anon();
  if (!supabase) return DEFAULT_CATALOG;
  const { data, error } = await supabase.from("service_catalog").select("service_key, enabled, business_types, sort_order").order("sort_order");
  if (error || !data || data.length === 0) return DEFAULT_CATALOG; // table missing until Part 10 → today's behaviour
  return data as CatalogRow[];
}

export async function getActiveRules(): Promise<PricingRule[]> {
  const supabase = anon();
  if (!supabase) return [];
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("pricing_rules")
    .select("id, service_key, business_type, model, amount_cents, percent, unit, valid_from, valid_to, active, notes")
    .eq("active", true)
    .lte("valid_from", today)
    .or(`valid_to.is.null,valid_to.gte.${today}`);
  return (data ?? []) as PricingRule[];
}

/** The business pricing model chosen in Admin → Settings (default: fixed monthly fee per location). */
export async function getBusinessPricing(): Promise<BusinessPricing> {
  const supabase = anon();
  if (!supabase) return DEFAULT_BUSINESS_PRICING;
  try {
    const { data } = await supabase.from("settings").select("value").eq("key", "business_pricing").maybeSingle<{ value: unknown }>();
    return parseBusinessPricing(data?.value);
  } catch {
    return DEFAULT_BUSINESS_PRICING;
  }
}

export async function getPricingContext() {
  const [catalog, rules, businessPricing] = await Promise.all([getCatalog(), getActiveRules(), getBusinessPricing()]);
  return { catalog, rules, unitPrices: monthlyUnitPrices(rules), businessPricing };
}

/** Server-side gate: a request for a service that is off for this business type is refused here, not just hidden. */
export async function assertServiceEnabled(service: ServiceKey, type: BusinessType | null): Promise<boolean> {
  const catalog = await getCatalog();
  return enabledFor(catalog, service, type);
}
