import "server-only";
import { createClient } from "./supabase/server";
import { DEFAULT_COVER_RULES, parseCoverRules, type CoverRules } from "./cover";

export async function getCoverRules(): Promise<CoverRules> {
  const supabase = await createClient();
  if (!supabase) return DEFAULT_COVER_RULES;
  const { data } = await supabase.from("settings").select("value").eq("key", "cover_rules").maybeSingle();
  return parseCoverRules(data?.value);
}

export type CoverRequestRow = {
  id: string;
  status: "searching" | "accepted" | "expired" | "cancelled";
  window_start: string;
  window_end: string;
  hours: number;
  tasks: string;
  city: string;
  postcode: string;
  address_line: string | null;
  report_to: string | null;
  unit_id: string | null;
  attendance: "unknown" | "came" | "no_show";
  cancelled_at: string | null;
  accepted_by: string | null;
  created_at: string;
  cleanerName: string | null;
  cleanerRateCents: number | null;
  feeAmountCents: number | null; // from the recorded fee event (null = none recorded)
  feeStatus: string | null;
};

/** A business's cover requests (last 30) with the accepting cleaner and the recorded fee event. */
export async function getCoverRequests(userId: string): Promise<CoverRequestRow[]> {
  const supabase = await createClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("emergency_requests")
    .select("id, status, window_start, window_end, hours, tasks, city, postcode, address_line, report_to, unit_id, attendance, cancelled_at, accepted_by, created_at")
    .eq("requester_id", userId)
    .order("window_start", { ascending: false })
    .limit(30);
  const rows = (data ?? []) as Omit<CoverRequestRow, "cleanerName" | "cleanerRateCents" | "feeAmountCents" | "feeStatus">[];
  const cpIds = [...new Set(rows.map((r) => r.accepted_by).filter(Boolean))] as string[];
  const ids = rows.map((r) => r.id);
  const [{ data: cps }, { data: fees }] = await Promise.all([
    cpIds.length ? supabase.from("cleaner_profiles").select("id, emergency_rate_cents, rate_cents, profiles ( display_name )").in("id", cpIds) : Promise.resolve({ data: [] }),
    ids.length ? supabase.from("fee_events").select("reference_id, amount_cents, status").eq("reference_table", "emergency_requests").in("reference_id", ids) : Promise.resolve({ data: [] }),
  ]);
  const cpOf = new Map(((cps ?? []) as unknown as { id: string; emergency_rate_cents: number | null; rate_cents: number; profiles: { display_name: string } | null }[]).map((c) => [c.id, c]));
  const feeOf = new Map(((fees ?? []) as { reference_id: string; amount_cents: number; status: string }[]).map((f) => [f.reference_id, f]));
  return rows.map((r) => {
    const cp = r.accepted_by ? cpOf.get(r.accepted_by) : undefined;
    const fee = feeOf.get(r.id);
    return { ...r, hours: Number(r.hours), cleanerName: cp?.profiles?.display_name ?? null, cleanerRateCents: cp ? cp.emergency_rate_cents ?? cp.rate_cents : null, feeAmountCents: fee ? fee.amount_cents : null, feeStatus: fee?.status ?? null };
  });
}
