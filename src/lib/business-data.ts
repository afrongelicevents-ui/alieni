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

export type BusinessBundle = {
  profile: BusinessProfileRow;
  units: BusinessUnitRow[];
  slots: SlotRow[];
  invoices: InvoiceRow[];
  connectedCleaners: { cleanerId: string; name: string }[];
  jobs: { id: string; status: string; space_type: string; frequency: string; created_at: string; responses: number }[];
};

export async function getBusinessForUser(userId: string): Promise<BusinessBundle | null> {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data: profile } = await supabase.from("business_profiles").select("*").eq("user_id", userId).maybeSingle();
  if (!profile) return null;
  const [{ data: units }, { data: slots }, { data: invoices }, { data: conns }, { data: jobs }] = await Promise.all([
    supabase.from("business_units").select("id, name, address_line, postcode, city, ical_url, ical_last_synced_at, ical_last_error, checkout_time, checkin_time").eq("business_id", profile.id).order("created_at"),
    supabase.from("cleaning_slots").select("id, unit_id, business_id, source, slot_date, starts_at, ends_at, status, reserved_by, reserved_at, reminder_sent_at, done_at, done_photo_path").eq("business_id", profile.id).gte("slot_date", new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)).order("starts_at").limit(200),
    supabase.from("invoices").select("id, number, gross_cents, net_cents, btw_cents, issued_at").eq("business_id", profile.id).order("issued_at", { ascending: false }).limit(24),
    supabase.from("connections").select("cleaner_id").eq("household_id", userId).eq("status", "active"),
    supabase.from("jobs").select("id, status, space_type, frequency, created_at, job_responses ( id )").eq("business_id", profile.id).order("created_at", { ascending: false }).limit(50),
  ]);
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
  };
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
