import "server-only";
import { createClient as createAnon } from "@supabase/supabase-js";
import type { BusinessType } from "./business";
import { DEFAULT_CATALOG, SERVICE_KEYS, enabledFor, monthlyUnitPrices, type CatalogRow, type PricingRule, type ServiceKey } from "./services-shared";

export * from "./services-shared";

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

export async function getPricingContext() {
  const [catalog, rules] = await Promise.all([getCatalog(), getActiveRules()]);
  return { catalog, rules, unitPrices: monthlyUnitPrices(rules) };
}

/** Server-side gate: a request for a service that is off for this business type is refused here, not just hidden. */
export async function assertServiceEnabled(service: ServiceKey, type: BusinessType | null): Promise<boolean> {
  const catalog = await getCatalog();
  return enabledFor(catalog, service, type);
}
