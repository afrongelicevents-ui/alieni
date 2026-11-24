import "server-only";
import type { BoardJob } from "@/components/jobs/JobsBoard";
import type { Frequency, JobSchedule, QuoteStatus, SpaceType } from "./jobs";
import { all, batch, first, json, run } from "./server/db";

type JobResponseLite = { id: string; cleaner_profile_id: string; rate_cents: number; message: string; status?: QuoteStatus; valid_until?: string | null };

export type BoardRow = {
  id: string; business_id: string; space_type: SpaceType; size_m2: number | null; postcode: string; city: string | null;
  frequency: Frequency; schedule_note: string | null; description: string; budget_cents: number;
  expires_at?: string | null; start_date?: string | null; end_date?: string | null; weekdays?: number[] | null; visit_start?: string | null; visit_hours?: number | string | null;
  job_responses: JobResponseLite[] | null;
};

type DbJob = Omit<BoardRow, "weekdays" | "job_responses"> & { weekdays: string };

/** Quotations for a set of jobs, grouped by job (server-only; toBoardJobs decides who sees which). */
async function responsesFor(jobIds: string[]): Promise<Map<string, JobResponseLite[]>> {
  const out = new Map<string, JobResponseLite[]>();
  if (!jobIds.length) return out;
  const rows = await all<JobResponseLite & { job_id: string }>(
    `SELECT id, job_id, cleaner_profile_id, rate_cents, message, status, valid_until FROM job_responses WHERE job_id IN (${jobIds.map(() => "?").join(",")}) ORDER BY created_at`,
    ...jobIds,
  );
  for (const r of rows) {
    const { job_id, ...rest } = r;
    out.set(job_id, [...(out.get(job_id) ?? []), rest]);
  }
  return out;
}

/**
 * Published, unexpired jobs for a board (public information: no address, only postcode and town).
 * The first argument is unused (it used to be the Supabase client); pass null.
 */
export async function fetchPublishedJobs(_unused: unknown = null, opts: { spaceTypes?: string[] } = {}): Promise<BoardRow[]> {
  void _unused;
  const types = (opts.spaceTypes ?? []).filter((t) => /^[a-z]+$/.test(t)).slice(0, 10);
  const typeFilter = opts.spaceTypes ? (types.length ? `AND space_type IN (${types.map(() => "?").join(",")})` : "AND 0") : "";
  const rows = await all<DbJob>(
    `SELECT id, business_id, space_type, size_m2, postcode, city, frequency, schedule_note, description, budget_cents,
            expires_at, start_date, end_date, weekdays, visit_start, visit_hours
     FROM jobs WHERE status = 'published' AND (expires_at IS NULL OR expires_at > ?) ${typeFilter}
     ORDER BY published_at DESC LIMIT 100`,
    new Date().toISOString(), ...(opts.spaceTypes ? types : []),
  );
  const resp = await responsesFor(rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, weekdays: json<number[]>(r.weekdays, []), job_responses: resp.get(r.id) ?? [] }));
}

export function scheduleOf(r: Pick<BoardRow, "start_date" | "end_date" | "weekdays" | "visit_start" | "visit_hours">): JobSchedule {
  return {
    startDate: r.start_date ?? null,
    endDate: r.end_date ?? null,
    weekdays: r.weekdays ?? [],
    visitStart: r.visit_start ? r.visit_start.slice(0, 5) : null,
    visitHours: r.visit_hours === null || r.visit_hours === undefined ? null : Number(r.visit_hours),
  };
}

/** Board rows for the viewer: the business sees all quotations on its own jobs; a cleaner sees only their own. */
export function toBoardJobs(
  rows: BoardRow[],
  ctx: { companyOf: Map<string, string>; nameOf?: Map<string, string>; myCleanerProfileId: string | null; myBusinessId: string | null },
): BoardJob[] {
  return rows.map((r) => {
    const mine = ctx.myBusinessId !== null && r.business_id === ctx.myBusinessId;
    const responses = r.job_responses ?? [];
    const my = ctx.myCleanerProfileId ? responses.find((x) => x.cleaner_profile_id === ctx.myCleanerProfileId) : undefined;
    return {
      id: r.id,
      companyName: ctx.companyOf.get(r.business_id) ?? "—",
      spaceType: r.space_type,
      sizeM2: r.size_m2,
      postcode: r.postcode,
      city: r.city ?? "",
      frequency: r.frequency,
      scheduleNote: r.schedule_note,
      description: r.description,
      budgetCents: r.budget_cents,
      mine,
      sample: false,
      schedule: scheduleOf(r),
      myResponse: my ? { rateCents: my.rate_cents, status: my.status ?? "sent", validUntil: my.valid_until ?? null } : null,
      responses: mine
        ? responses.map((x) => ({ id: x.id, cleanerProfileId: x.cleaner_profile_id, name: ctx.nameOf?.get(x.cleaner_profile_id) ?? "—", rateCents: x.rate_cents, message: x.message, status: x.status ?? "sent", validUntil: x.valid_until ?? null }))
        : [],
    };
  });
}

export type MyQuote = {
  id: string;
  jobId: string;
  rateCents: number;
  message: string;
  status: QuoteStatus;
  validUntil: string | null;
  job: { spaceType: SpaceType; frequency: Frequency; city: string; status: string; endedAt: string | null; schedule: JobSchedule; companyName: string } | null;
};

/**
 * A cleaner's own quotations, newest first, with the job each one is about. Pass the SIGNED-IN cleaner's
 * cleaner_profile id. The first argument is unused (it used to be the Supabase client); pass null.
 */
export async function getQuotesForCleaner(_unused: unknown, cleanerProfileId: string, companyOf: (ids: string[]) => Promise<Map<string, string>>): Promise<MyQuote[]> {
  void _unused;
  type Row = {
    id: string; job_id: string; rate_cents: number; message: string; status: QuoteStatus; valid_until: string | null;
    business_id: string | null; space_type: SpaceType; frequency: Frequency; city: string | null; job_status: string | null; ended_at: string | null;
    start_date: string | null; end_date: string | null; weekdays: string | null; visit_start: string | null; visit_hours: number | null;
  };
  const rows = await all<Row>(
    `SELECT r.id, r.job_id, r.rate_cents, r.message, r.status, r.valid_until,
            j.business_id, j.space_type, j.frequency, j.city, j.status AS job_status, j.ended_at, j.start_date, j.end_date, j.weekdays, j.visit_start, j.visit_hours
     FROM job_responses r LEFT JOIN jobs j ON j.id = r.job_id
     WHERE r.cleaner_profile_id = ? ORDER BY r.created_at DESC LIMIT 50`,
    cleanerProfileId,
  );
  const names = await companyOf(rows.map((r) => r.business_id ?? "").filter(Boolean));
  return rows.map((r) => ({
    id: r.id, jobId: r.job_id, rateCents: r.rate_cents, message: r.message, status: r.status, validUntil: r.valid_until,
    job: r.business_id
      ? { spaceType: r.space_type, frequency: r.frequency, city: r.city ?? "", status: r.job_status ?? "", endedAt: r.ended_at, schedule: scheduleOf({ ...r, weekdays: json<number[]>(r.weekdays, []) }), companyName: names.get(r.business_id) ?? "—" }
      : null,
  }));
}

// ========== Job lifecycle (was Postgres functions in 0025: generate_job_visits, expire_stale_jobs) ==========

export { amsterdamToUtcIso } from "./jobs";
import { amsterdamToUtcIso } from "./jobs";

const isoDow = (dateStr: string) => { const d = new Date(`${dateStr}T12:00:00Z`).getUTCDay(); return d === 0 ? 7 : d; };
const addDays = (dateStr: string, n: number) => new Date(Date.parse(`${dateStr}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const mondayOf = (dateStr: string) => addDays(dateStr, 1 - isoDow(dateStr));
const todayAmsterdam = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(new Date());

type VisitJob = { id: string; business_id: string; status: string; frequency: string; ended_at: string | null; awarded_response_id: string | null; start_date: string | null; end_date: string | null; weekdays: string; visit_start: string | null; visit_hours: number | null };

/**
 * Work records (visits) of an awarded regular job from today up to `daysAhead` days. Idempotent: a visit has the
 * fixed reference `job_visits` / `<job id>:<date>`, so running it twice adds nothing.
 */
export async function generateJobVisits(jobId: string, daysAhead = 28): Promise<number> {
  const j = await first<VisitJob>("SELECT id, business_id, status, frequency, ended_at, awarded_response_id, start_date, end_date, weekdays, visit_start, visit_hours FROM jobs WHERE id = ?", jobId);
  if (!j || j.status !== "filled" || j.ended_at || !j.awarded_response_id) return 0;
  if (!["daily", "weekly", "biweekly", "monthly"].includes(j.frequency) || !j.start_date) return 0;
  const r = await first<{ cleaner_profile_id: string }>("SELECT cleaner_profile_id FROM job_responses WHERE id = ?", j.awarded_response_id);
  if (!r) return 0;
  const today = todayAmsterdam();
  const horizon = addDays(today, Math.max(daysAhead, 1));
  const firstD = j.start_date > today ? j.start_date : today;
  const lastD = j.end_date && j.end_date < horizon ? j.end_date : horizon;
  if (firstD > lastD) return 0;
  const start = (j.visit_start ?? "09:00").slice(0, 5);
  const hours = j.visit_hours ?? 2;
  const weekdays = json<number[]>(j.weekdays, []);
  const wd = weekdays.length ? weekdays : [isoDow(j.start_date)];
  const dom = Number(j.start_date.slice(8, 10));
  const startMonday = mondayOf(j.start_date);
  const stmts: [string, ...(string | number | null)[]][] = [];
  for (let d = firstD; d <= lastD; d = addDays(d, 1)) {
    const dow = isoDow(d);
    let ok = false;
    if (j.frequency === "daily") ok = weekdays.length === 0 || wd.includes(dow);
    else if (j.frequency === "weekly") ok = wd.includes(dow);
    else if (j.frequency === "biweekly") ok = wd.includes(dow) && Math.round((Date.parse(mondayOf(d)) - Date.parse(startMonday)) / (7 * 864e5)) % 2 === 0;
    else {
      const [y, m] = d.split("-").map(Number);
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
      ok = Number(d.slice(8, 10)) === Math.min(dom, lastDay);
    }
    if (!ok) continue;
    const s = amsterdamToUtcIso(d, start);
    const e = new Date(Date.parse(s) + hours * 3600e3).toISOString();
    stmts.push([
      `INSERT INTO work_records (id, business_id, cleaner_profile_id, service_key, reference_table, reference_id, job_id, scheduled_start, scheduled_end, outcome)
       VALUES (?, ?, ?, 'contract', 'job_visits', ?, ?, ?, ?, 'scheduled') ON CONFLICT (reference_table, reference_id) DO NOTHING`,
      crypto.randomUUID(), j.business_id, r.cleaner_profile_id, `${j.id}:${d}`, j.id, s, e,
    ]);
  }
  if (!stmts.length) return 0;
  await batch(stmts);
  return stmts.length;
}

/** Daily housekeeping: published jobs past their expiry date become 'expired'. */
export async function expireStaleJobs(): Promise<number> {
  return run("UPDATE jobs SET status = 'expired' WHERE status = 'published' AND expires_at IS NOT NULL AND expires_at < ?", new Date().toISOString());
}

/** Daily housekeeping: next four weeks of visits for every running regular contract. */
export async function generateAllJobVisits(daysAhead = 28): Promise<number> {
  const rows = await all<{ id: string }>("SELECT id FROM jobs WHERE status = 'filled' AND ended_at IS NULL AND frequency IN ('daily','weekly','biweekly','monthly')");
  let total = 0;
  for (const r of rows) total += await generateJobVisits(r.id, daysAhead);
  return total;
}
