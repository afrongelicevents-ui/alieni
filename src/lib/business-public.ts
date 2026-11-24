import "server-only";
import { getSessionUser } from "./auth";
import { all } from "./server/db";

/**
 * Public company names (the old `business_public` view): a company's name is visible when it has a published job,
 * to its own account, to cleaners with a work record for it or an active connection with it, and to admins.
 * Everything else in business_profiles (contact, VAT, units) is readable only by its owner and admins.
 *
 * Call as `businessNames(ids)`. The older two-argument form `businessNames(anything, ids)` is still accepted
 * (first argument ignored) so callers can move over one by one.
 */
export async function businessNames(...args: [ids: (string | null | undefined)[]] | [unused: unknown, ids: (string | null | undefined)[]]): Promise<Map<string, string>> {
  const ids = (args.length === 2 ? args[1] : args[0]) as (string | null | undefined)[];
  const uniq = [...new Set(ids.filter((x): x is string => typeof x === "string" && x.length > 0))].slice(0, 200);
  if (!uniq.length) return new Map();
  const viewer = await getSessionUser();
  const me = viewer?.id ?? "";
  const isAdmin = viewer?.role === "admin" ? 1 : 0;
  const marks = uniq.map(() => "?").join(",");
  const rows = await all<{ id: string; company_name: string }>(
    `SELECT bp.id, bp.company_name FROM business_profiles bp
     WHERE bp.id IN (${marks}) AND (
       ? = 1
       OR bp.user_id = ?
       OR EXISTS (SELECT 1 FROM jobs j WHERE j.business_id = bp.id AND j.status = 'published')
       OR EXISTS (SELECT 1 FROM work_records w JOIN cleaner_profiles cp ON cp.id = w.cleaner_profile_id WHERE w.business_id = bp.id AND cp.user_id = ?)
       OR EXISTS (SELECT 1 FROM connections c WHERE c.household_id = bp.user_id AND c.cleaner_id = ? AND c.status = 'active')
     )`,
    ...uniq, isAdmin, me, me, me,
  );
  return new Map(rows.map((r) => [r.id, r.company_name]));
}
