import type { QuoteRow } from "@/components/jobs/QuoteList";
import type { JobSchedule, QuoteStatus } from "./jobs";
import "server-only";
import { all, first, json } from "./server/db";
import { businessNames } from "./business-public";
import type { BusinessType } from "./business";

/**
 * Business account data for one business user. Every query is scoped to that user's own business_profiles row;
 * callers pass the SIGNED-IN user's id (from requireRole / getSessionUser), never an id from the browser.
 */

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
  // Payments are off on this build (docs/DECISIONS.md #8): the billing fields are always null.
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
  feeEvents: FeeEventRow[]; // always empty: payments are off
  workRecords: WorkRecordRow[];
};

const WORK_COLS = "id, business_id, household_id, cleaner_profile_id, job_id, service_key, reference_table, reference_id, scheduled_start, scheduled_end, started_at, completed_at, business_confirmed_at, outcome, notes";

/** Display names for cleaner_profile ids (a cleaner's first name is shown on their own public ad anyway). */
async function cleanerNames(ids: string[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter(Boolean))].slice(0, 200);
  if (!uniq.length) return new Map();
  const rows = await all<{ id: string; display_name: string }>(
    `SELECT cp.id, p.display_name FROM cleaner_profiles cp JOIN profiles p ON p.id = cp.user_id WHERE cp.id IN (${uniq.map(() => "?").join(",")})`,
    ...uniq,
  );
  return new Map(rows.map((r) => [r.id, r.display_name ?? "—"]));
}

type JobRow = {
  id: string; status: string; space_type: string; frequency: string; created_at: string; description: string;
  start_date: string | null; end_date: string | null; weekdays: string; visit_start: string | null; visit_hours: number | null;
  awarded_response_id: string | null; ended_at: string | null; ended_by: string | null;
};
type ResponseRow = { id: string; job_id: string; cleaner_profile_id: string; rate_cents: number; message: string; status: QuoteStatus; valid_until: string | null };

export async function getBusinessForUser(userId: string): Promise<BusinessBundle | null> {
  const profile = await first<Omit<BusinessProfileRow, "unit_price_cents" | "pending_unit_count" | "billing_started_at" | "billing_paused_at" | "billing_ended_at" | "payment_failed_at">>(
    "SELECT id, user_id, company_name, kvk_number, btw_number, business_type, contact_first_name, contact_last_name, unit_count, created_at FROM business_profiles WHERE user_id = ?",
    userId,
  );
  if (!profile) return null;
  const [units, conns, jobs, work] = await Promise.all([
    all<BusinessUnitRow>("SELECT id, name, address_line, postcode, city FROM business_units WHERE business_id = ? ORDER BY created_at", profile.id),
    all<{ cleaner_id: string; display_name: string }>(
      "SELECT c.cleaner_id, p.display_name FROM connections c JOIN profiles p ON p.id = c.cleaner_id WHERE c.household_id = ? AND c.status = 'active'",
      userId,
    ),
    all<JobRow>(
      `SELECT id, status, space_type, frequency, created_at, description, start_date, end_date, weekdays, visit_start, visit_hours, awarded_response_id, ended_at, ended_by
       FROM jobs WHERE business_id = ? AND status <> 'removed' ORDER BY created_at DESC LIMIT 50`,
      profile.id,
    ),
    all<WorkRecordRow>(`SELECT ${WORK_COLS} FROM work_records WHERE business_id = ? ORDER BY scheduled_start DESC LIMIT 200`, profile.id),
  ]);
  const jobIds = jobs.map((j) => j.id);
  const responses = jobIds.length
    ? await all<ResponseRow>(
        `SELECT id, job_id, cleaner_profile_id, rate_cents, message, status, valid_until FROM job_responses WHERE job_id IN (${jobIds.map(() => "?").join(",")}) ORDER BY created_at`,
        ...jobIds,
      )
    : [];
  const names = await cleanerNames([...responses.map((r) => r.cleaner_profile_id), ...work.map((w) => w.cleaner_profile_id ?? "")]);
  const jobRows: BusinessJob[] = jobs.map((j) => {
    const quotes = responses.filter((r) => r.job_id === j.id);
    return {
      id: j.id, status: j.status, space_type: j.space_type, frequency: j.frequency, created_at: j.created_at, description: j.description ?? "",
      responses: quotes.length,
      schedule: { startDate: j.start_date, endDate: j.end_date, weekdays: json<number[]>(j.weekdays, []), visitStart: j.visit_start ? j.visit_start.slice(0, 5) : null, visitHours: j.visit_hours === null ? null : Number(j.visit_hours) },
      awardedResponseId: j.awarded_response_id, endedAt: j.ended_at, endedBy: j.ended_by,
      quotes: quotes.map((r) => ({ id: r.id, cleanerProfileId: r.cleaner_profile_id, name: names.get(r.cleaner_profile_id) ?? "—", rateCents: r.rate_cents, message: r.message, status: r.status ?? "sent", validUntil: r.valid_until })),
    };
  });
  return {
    profile: { ...profile, unit_price_cents: null, pending_unit_count: null, billing_started_at: null, billing_paused_at: null, billing_ended_at: null, payment_failed_at: null },
    units,
    invoices: [],
    connectedCleaners: conns.map((c) => ({ cleanerId: c.cleaner_id, name: c.display_name })),
    jobs: jobRows,
    feeEvents: [],
    workRecords: work.map((w) => ({ ...w, cleanerName: w.cleaner_profile_id ? names.get(w.cleaner_profile_id) ?? null : null })),
  };
}

/**
 * A cleaner's own work records (awarded jobs they accepted), with where to go for them.
 * Pass the cleaner_profile id of the SIGNED-IN cleaner. The address of a unit is only returned for a job that is
 * awarded to this cleaner and not ended, or for a business they have an active connection with (old cleaner_slot_units).
 */
export async function getWorkForCleaner(cleanerProfileId: string): Promise<(WorkRecordRow & { company: string | null; location: string | null })[]> {
  const rows = await all<WorkRecordRow>(`SELECT ${WORK_COLS} FROM work_records WHERE cleaner_profile_id = ? ORDER BY scheduled_start DESC LIMIT 200`, cleanerProfileId);
  const companyOf = await businessNames(rows.map((w) => w.business_id));
  const jobIds = [...new Set(rows.map((w) => w.job_id).filter((x): x is string => Boolean(x)))];
  const locationOfJob = new Map<string, string>();
  if (jobIds.length) {
    const places = await all<{ job_id: string; name: string | null; address_line: string; postcode: string; city: string }>(
      `SELECT j.id AS job_id, u.name, u.address_line, u.postcode, u.city
       FROM jobs j
       JOIN business_units u ON u.id = j.unit_id
       JOIN cleaner_profiles me ON me.id = ?
       WHERE j.id IN (${jobIds.map(() => "?").join(",")})
         AND (
           (j.ended_at IS NULL AND EXISTS (SELECT 1 FROM job_responses r WHERE r.id = j.awarded_response_id AND r.cleaner_profile_id = me.id))
           OR EXISTS (SELECT 1 FROM connections c JOIN business_profiles bp ON bp.user_id = c.household_id
                      WHERE bp.id = u.business_id AND c.cleaner_id = me.user_id AND c.status = 'active')
         )`,
      cleanerProfileId, ...jobIds,
    );
    for (const u of places) locationOfJob.set(u.job_id, [u.name && u.name !== u.address_line ? u.name : "", u.address_line, `${u.postcode} ${u.city}`].filter(Boolean).join(", "));
  }
  return rows.map((w) => ({ ...w, company: w.business_id ? companyOf.get(w.business_id) ?? null : null, location: w.job_id ? locationOfJob.get(w.job_id) ?? null : null }));
}
