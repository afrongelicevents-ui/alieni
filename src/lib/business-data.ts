import "server-only";
import { createClient } from "./supabase/server";
import type { BusinessType } from "./business";

/** Business account data for the signed-in business user (RLS-scoped). */

export type BusinessUnitRow = {
  id: string;
  name: string;
  address_line: string;
  postcode: string;
  city: string;
  ical_url: string | null;
  ical_last_synced_at: string | null;
  ical_last_error: string | null;
  checkout_time: string;
  checkin_time: string;
};

export type BusinessProfileRow = {
  id: string;
  user_id: string;
  company_name: string;
  kvk_number: string | null;
  btw_number: string | null;
  business_type: BusinessType | null;
  contact_first_name: string | null;
  contact_last_name: string | null;
  unit_count: number;
  unit_price_cents: number | null;
  pending_unit_count: number | null;
  billing_started_at: string | null;
  billing_paused_at: string | null;
  billing_ended_at: string | null;
  payment_failed_at: string | null;
  created_at: string;
};

export type SlotRow = {
  id: string;
  unit_id: string;
  business_id: string;
  source: "ical" | "manual";
  slot_date: string;
  starts_at: string;
  ends_at: string;
  status: "open" | "reserved" | "done" | "cancelled";
  reserved_by: string | null;
  reserved_at: string | null;
  reminder_sent_at: string | null;
  done_at: string | null;
  done_photo_path: string | null;
};

export type InvoiceRow = { id: string; number: string; gross_cents: number; net_cents: number; btw_cents: number; issued_at: string };

export type FeeEventRow = { id: string; service_key: string; event_type: string; occurred_at: string; model: string; amount_cents: number; btw_cents: number; status: "pending" | "invoiced" | "waived"; waived_reason: string | null };
export type WorkRecordRow = {
  id: string;
  business_id: string | null;
  household_id: string | null;
  cleaner_profile_id: string | null;
  service_key: string;
  reference_table: string | null;
  reference_id: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  started_at: string | null;
  completed_at: string | null;
  business_confirmed_at: string | null;
  outcome: "scheduled" | "done" | "no_show" | "cancelled" | "disputed";
  notes: string | null;
  cleanerName?: string | null;
};
export type EmergencyRow = { id: string; status: "searching" | "accepted" | "expired" | "cancelled"; window_start: string; window_end: string; hours: number; tasks: string; city: string; created_at: string };

export type BusinessBundle = {
  profile: BusinessProfileRow;
  units: BusinessUnitRow[];
  slots: SlotRow[];
  invoices: InvoiceRow[];
  connectedCleaners: { cleanerId: string; name: string }[];
  jobs: { id: string; status: string; space_type: string; frequency: string; created_at: string; responses: number }[];
  feeEvents: FeeEventRow[]; // this calendar month
  workRecords: WorkRecordRow[];
  emergencies: EmergencyRow[];
};

function monthStartIso(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

/** Cleaner display names for a set of cleaner_profile ids (RLS: public ads only). */
async function cleanerNames(supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>, ids: string[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return new Map();
  const { data } = await supabase.from("cleaner_profiles").select("id, profiles ( display_name )").in("id", uniq);
  return new Map(((data ?? []) as unknown as { id: string; profiles: { display_name: string } | null }[]).map((r) => [r.id, r.profiles?.display_name ?? "—"]));
}

export async function getBusinessForUser(userId: string): Promise<BusinessBundle | null> {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data: profile } = await supabase.from("business_profiles").select("id, user_id, company_name, kvk_number, btw_number, business_type, contact_first_name, contact_last_name, unit_count, unit_price_cents, pending_unit_count, billing_started_at, billing_paused_at, billing_ended_at, payment_failed_at, created_at").eq("user_id", userId).maybeSingle();
  if (!profile) return null;
  const [{ data: units }, { data: slots }, { data: invoices }, { data: conns }, { data: jobs }, { data: feeEvents }, { data: work }, { data: emergencies }] = await Promise.all([
    supabase.from("business_units").select("id, name, address_line, postcode, city, ical_url, ical_last_synced_at, ical_last_error, checkout_time, checkin_time").eq("business_id", profile.id).order("created_at"),
    supabase.from("cleaning_slots").select("id, unit_id, business_id, source, slot_date, starts_at, ends_at, status, reserved_by, reserved_at, reminder_sent_at, done_at, done_photo_path").eq("business_id", profile.id).gte("slot_date", new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)).order("starts_at").limit(200),
    supabase.from("invoices").select("id, number, gross_cents, net_cents, btw_cents, issued_at").eq("business_id", profile.id).order("issued_at", { ascending: false }).limit(24),
    supabase.from("connections").select("cleaner_id").eq("household_id", userId).eq("status", "active"),
    supabase.from("jobs").select("id, status, space_type, frequency, created_at, job_responses ( id )").eq("business_id", profile.id).order("created_at", { ascending: false }).limit(50),
    supabase.from("fee_events").select("id, service_key, event_type, occurred_at, model, amount_cents, btw_cents, status, waived_reason").eq("business_id", profile.id).gte("occurred_at", monthStartIso()).order("occurred_at", { ascending: false }).limit(200),
    supabase.from("work_records").select("id, business_id, household_id, cleaner_profile_id, service_key, reference_table, reference_id, scheduled_start, scheduled_end, started_at, completed_at, business_confirmed_at, outcome, notes").eq("business_id", profile.id).order("scheduled_start", { ascending: false }).limit(100),
    supabase.from("emergency_requests").select("id, status, window_start, window_end, hours, tasks, city, created_at").eq("requester_id", userId).order("created_at", { ascending: false }).limit(30),
  ]);
  const workRows = (work ?? []) as WorkRecordRow[];
  const names = await cleanerNames(supabase, workRows.map((w) => w.cleaner_profile_id ?? ""));
  const cleanerIds = (conns ?? []).map((c: { cleaner_id: string }) => c.cleaner_id);
  let connectedCleaners: BusinessBundle["connectedCleaners"] = [];
  if (cleanerIds.length) {
    const { data: names } = await supabase.from("profiles").select("id, display_name").in("id", cleanerIds);
    connectedCleaners = (names ?? []).map((n: { id: string; display_name: string }) => ({ cleanerId: n.id, name: n.display_name }));
  }
  return {
    profile: profile as BusinessProfileRow,
    units: (units ?? []) as BusinessUnitRow[],
    slots: (slots ?? []) as SlotRow[],
    invoices: ((invoices ?? []) as InvoiceRow[]).filter((i) => i.number),
    connectedCleaners,
    jobs: ((jobs ?? []) as { id: string; status: string; space_type: string; frequency: string; created_at: string; job_responses: { id: string }[] | null }[]).map((j) => ({
      id: j.id, status: j.status, space_type: j.space_type, frequency: j.frequency, created_at: j.created_at, responses: j.job_responses?.length ?? 0,
    })),
    feeEvents: (feeEvents ?? []) as FeeEventRow[],
    workRecords: workRows.map((w) => ({ ...w, cleanerName: w.cleaner_profile_id ? names.get(w.cleaner_profile_id) ?? null : null })),
    emergencies: ((emergencies ?? []) as EmergencyRow[]).map((e) => ({ ...e, hours: Number(e.hours) })),
  };
}

/** A cleaner's own work records (turnovers + emergency jobs they accepted). */
export async function getWorkForCleaner(cleanerProfileId: string): Promise<(WorkRecordRow & { company: string | null })[]> {
  const supabase = await createClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("work_records")
    .select("id, business_id, household_id, cleaner_profile_id, service_key, reference_table, reference_id, scheduled_start, scheduled_end, started_at, completed_at, business_confirmed_at, outcome, notes, business_profiles ( company_name )")
    .eq("cleaner_profile_id", cleanerProfileId)
    .order("scheduled_start", { ascending: false })
    .limit(100);
  return ((data ?? []) as unknown as (WorkRecordRow & { business_profiles: { company_name: string } | null })[]).map(({ business_profiles, ...w }) => ({ ...w, company: business_profiles?.company_name ?? null }));
}

/** Slots a cleaner may see: connected businesses' turnovers (RLS). */
export async function getSlotsForCleaner(): Promise<(SlotRow & { unitName: string; company: string })[]> {
  const supabase = await createClient();
  if (!supabase) return [];
  const { data: slots } = await supabase
    .from("cleaning_slots")
    .select("id, unit_id, business_id, source, slot_date, starts_at, ends_at, status, reserved_by, reserved_at, reminder_sent_at, done_at, done_photo_path, business_units ( name, address_line ), business_profiles ( company_name )")
    .gte("slot_date", new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10))
    .neq("status", "cancelled")
    .order("starts_at")
    .limit(200);
  return ((slots ?? []) as unknown as (SlotRow & { business_units: { name: string; address_line: string } | null; business_profiles: { company_name: string } | null })[]).map((s) => ({
    ...s,
    unitName: s.business_units?.name || s.business_units?.address_line || "",
    company: s.business_profiles?.company_name ?? "",
  }));
}
