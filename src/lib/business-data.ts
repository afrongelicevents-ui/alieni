import type { QuoteRow } from "@/components/jobs/QuoteList";
import type { JobSchedule, QuoteStatus } from "./jobs";
import "server-only";
import { createClient } from "./supabase/server";
import { businessNames } from "./business-public";
import type { BusinessType } from "./business";

/** Business account data for the signed-in business user (RLS-scoped). */

export type BusinessUnitRow = {
  id: string;
  name: string;
  address_line: string;
  postcode: string;
  city: string;
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
  job_id?: string | null;
};

export type BusinessJob = {
  id: string;
  status: string;
  space_type: string;
  frequency: string;
  created_at: string;
  description: string;
  responses: number;
  schedule: JobSchedule;
  awardedResponseId: string | null;
  endedAt: string | null;
  endedBy: string | null;
  quotes: QuoteRow[];
};

export type BusinessBundle = {
  profile: BusinessProfileRow;
  units: BusinessUnitRow[];
  invoices: InvoiceRow[];
  connectedCleaners: { cleanerId: string; name: string }[];
  jobs: BusinessJob[];
  feeEvents: FeeEventRow[]; // this calendar month
  workRecords: WorkRecordRow[];
};

function monthStartIso(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

/** Cleaner display names for a set of cleaner_profile ids (RLS: public ads only). */
async function cleanerNames(supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>, ids: string[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return new Map();
  const { data } = await supabase.from("cleaner_profiles").select("id, profiles!cleaner_profiles_user_id_fkey ( display_name )").in("id", uniq);
  return new Map(((data ?? []) as unknown as { id: string; profiles: { display_name: string } | null }[]).map((r) => [r.id, r.profiles?.display_name ?? "—"]));
}

type BusinessJobRow = {
  id: string; status: string; space_type: string; frequency: string; created_at: string; description?: string;
  start_date?: string | null; end_date?: string | null; weekdays?: number[] | null; visit_start?: string | null; visit_hours?: number | string | null;
  awarded_response_id?: string | null; ended_at?: string | null; ended_by?: string | null;
  job_responses: { id: string; cleaner_profile_id: string; rate_cents: number; message: string; status?: QuoteStatus; valid_until?: string | null }[];
};

/** The business's own jobs with their quotations. Falls back to the older columns until Part 15 has been run. */
async function fetchBusinessJobs(supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>, businessId: string): Promise<{ data: BusinessJobRow[] }> {
  const run = (cols: string) => supabase.from("jobs").select(cols).eq("business_id", businessId).neq("status", "removed").order("created_at", { ascending: false }).limit(50);
  let res = await run("id, status, space_type, frequency, created_at, description, start_date, end_date, weekdays, visit_start, visit_hours, awarded_response_id, ended_at, ended_by, job_responses!job_responses_job_id_fkey ( id, cleaner_profile_id, rate_cents, message, status, valid_until )");
  if (res.error) res = await run("id, status, space_type, frequency, created_at, description, job_responses!job_responses_job_id_fkey ( id, cleaner_profile_id, rate_cents, message )");
  return { data: ((res.data ?? []) as unknown as BusinessJobRow[]).map((j) => ({ ...j, job_responses: j.job_responses ?? [] })) };
}

/** The business's work records. job_id comes with Part 15; until then the older columns are read. */
async function fetchBusinessWork(supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>, businessId: string): Promise<{ data: unknown[] | null }> {
  const base = "id, business_id, household_id, cleaner_profile_id, service_key, reference_table, reference_id, scheduled_start, scheduled_end, started_at, completed_at, business_confirmed_at, outcome, notes";
  const run = (cols: string) => supabase.from("work_records").select(cols).eq("business_id", businessId).order("scheduled_start", { ascending: false }).limit(200);
  const first = await run(`${base}, job_id`);
  if (!first.error) return { data: first.data as unknown[] };
  const second = await run(base);
  return { data: (second.data ?? null) as unknown[] | null };
}

export async function getBusinessForUser(userId: string): Promise<BusinessBundle | null> {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data: profile } = await supabase.from("business_profiles").select("id, user_id, company_name, kvk_number, btw_number, business_type, contact_first_name, contact_last_name, unit_count, unit_price_cents, pending_unit_count, billing_started_at, billing_paused_at, billing_ended_at, payment_failed_at, created_at").eq("user_id", userId).maybeSingle();
  if (!profile) return null;
  const [{ data: units }, { data: invoices }, { data: conns }, { data: jobs }, { data: feeEvents }, { data: work }] = await Promise.all([
    supabase.from("business_units").select("id, name, address_line, postcode, city").eq("business_id", profile.id).order("created_at"),
    supabase.from("invoices").select("id, number, gross_cents, net_cents, btw_cents, issued_at").eq("business_id", profile.id).order("issued_at", { ascending: false }).limit(24),
    supabase.from("connections").select("cleaner_id").eq("household_id", userId).eq("status", "active"),
    fetchBusinessJobs(supabase, profile.id),
    supabase.from("fee_events").select("id, service_key, event_type, occurred_at, model, amount_cents, btw_cents, status, waived_reason").eq("business_id", profile.id).gte("occurred_at", monthStartIso()).order("occurred_at", { ascending: false }).limit(200),
    fetchBusinessWork(supabase, profile.id),
  ]);
  const workRows = (work ?? []) as WorkRecordRow[];
  const responderNames = await cleanerNames(supabase, (jobs ?? []).flatMap((j) => j.job_responses.map((r) => r.cleaner_profile_id)));
  const jobRows: BusinessJob[] = (jobs ?? []).map((j) => ({
    id: j.id, status: j.status, space_type: j.space_type, frequency: j.frequency, created_at: j.created_at, description: j.description ?? "",
    responses: j.job_responses.length,
    schedule: { startDate: j.start_date ?? null, endDate: j.end_date ?? null, weekdays: j.weekdays ?? [], visitStart: j.visit_start ? j.visit_start.slice(0, 5) : null, visitHours: j.visit_hours === null || j.visit_hours === undefined ? null : Number(j.visit_hours) },
    awardedResponseId: j.awarded_response_id ?? null, endedAt: j.ended_at ?? null, endedBy: j.ended_by ?? null,
    quotes: j.job_responses.map((r) => ({ id: r.id, cleanerProfileId: r.cleaner_profile_id, name: responderNames.get(r.cleaner_profile_id) ?? "—", rateCents: r.rate_cents, message: r.message, status: r.status ?? "sent", validUntil: r.valid_until ?? null })),
  }));
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
    invoices: ((invoices ?? []) as InvoiceRow[]).filter((i) => i.number),
    connectedCleaners,
    jobs: jobRows,
    feeEvents: (feeEvents ?? []) as FeeEventRow[],
    workRecords: workRows.map((w) => ({ ...w, cleanerName: w.cleaner_profile_id ? names.get(w.cleaner_profile_id) ?? null : null })),
  };
}

/** A cleaner's own work records (awarded jobs they accepted), with where to go for them. */
export async function getWorkForCleaner(cleanerProfileId: string): Promise<(WorkRecordRow & { company: string | null; location: string | null })[]> {
  const supabase = await createClient();
  if (!supabase) return [];
  const base = "id, business_id, household_id, cleaner_profile_id, service_key, reference_table, reference_id, scheduled_start, scheduled_end, started_at, completed_at, business_confirmed_at, outcome, notes";
  const run = (cols: string) => supabase.from("work_records").select(cols).eq("cleaner_profile_id", cleanerProfileId).order("scheduled_start", { ascending: false }).limit(200);
  let res = await run(`${base}, job_id`);
  if (res.error) res = await run(base);
  const rows = (res.data ?? []) as unknown as WorkRecordRow[];
  const companyOf = await businessNames(supabase, rows.map((w) => w.business_id));
  // awarded jobs: the job's location (name and address) comes from the awarded-cleaner view of Part 17
  const jobIds = [...new Set(rows.map((w) => w.job_id).filter((x): x is string => Boolean(x)))];
  const locationOfJob = new Map<string, string>();
  if (jobIds.length) {
    const { data: jobs } = await supabase.from("jobs").select("id, unit_id").in("id", jobIds);
    const unitIds = [...new Set(((jobs ?? []) as { unit_id: string | null }[]).map((j) => j.unit_id).filter((x): x is string => Boolean(x)))];
    const { data: units } = unitIds.length ? await supabase.from("cleaner_slot_units").select("id, name, address_line, postcode, city").in("id", unitIds) : { data: [] };
    const unitOf = new Map(((units ?? []) as { id: string; name: string | null; address_line: string; postcode: string; city: string }[]).map((u) => [u.id, [u.name && u.name !== u.address_line ? u.name : "", u.address_line, `${u.postcode} ${u.city}`].filter(Boolean).join(", ")]));
    for (const j of (jobs ?? []) as { id: string; unit_id: string | null }[]) if (j.unit_id && unitOf.has(j.unit_id)) locationOfJob.set(j.id, unitOf.get(j.unit_id) as string);
  }
  return rows.map((w) => ({ ...w, company: w.business_id ? companyOf.get(w.business_id) ?? null : null, location: w.job_id ? locationOfJob.get(w.job_id) ?? null : null }));
}

