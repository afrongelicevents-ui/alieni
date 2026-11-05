import "server-only";
import type { createClient } from "./supabase/server";

type Client = NonNullable<Awaited<ReturnType<typeof createClient>>>;

/**
 * Public company cards (name only) from the restricted view `business_public`
 * (company name and type; companies with a published job, the viewer's own company,
 * and companies the viewer works with). Everything else in business_profiles
 * (contact, VAT, units, billing) is readable only by its owner and admins.
 */
export async function businessNames(supabase: Client, ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  if (!uniq.length) return new Map();
  const { data } = await supabase.from("business_public").select("id, company_name").in("id", uniq);
  return new Map(((data ?? []) as { id: string; company_name: string }[]).map((r) => [r.id, r.company_name]));
}
