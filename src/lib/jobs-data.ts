import "server-only";
import type { createClient } from "./supabase/server";
import type { BoardJob } from "@/components/jobs/JobsBoard";
import type { Frequency, JobSchedule, QuoteStatus, SpaceType } from "./jobs";

type Client = NonNullable<Awaited<ReturnType<typeof createClient>>>;

const BASE = "id, business_id, space_type, size_m2, postcode, city, frequency, schedule_note, description, budget_cents";
const NEW_COLS = `${BASE}, expires_at, start_date, end_date, weekdays, visit_start, visit_hours, job_responses ( id, cleaner_profile_id, rate_cents, message, status, valid_until )`;
const OLD_COLS = `${BASE}, job_responses ( id, cleaner_profile_id, rate_cents, message )`;

export type BoardRow = {
  id: string; business_id: string; space_type: SpaceType; size_m2: number | null; postcode: string; city: string | null;
  frequency: Frequency; schedule_note: string | null; description: string; budget_cents: number;
  expires_at?: string | null; start_date?: string | null; end_date?: string | null; weekdays?: number[] | null; visit_start?: string | null; visit_hours?: number | string | null;
  job_responses: { id: string; cleaner_profile_id: string; rate_cents: number; message: string; status?: QuoteStatus; valid_until?: string | null }[] | null;
};

/**
 * Published jobs for a board. Reads the schedule/quotation columns of Part 15 and falls back to the older
 * columns when that part has not been run yet, so the board keeps working in the meantime.
 */
export async function fetchPublishedJobs(supabase: Client, opts: { spaceTypes?: string[] } = {}): Promise<BoardRow[]> {
  const build = (cols: string) => {
    let q = supabase.from("jobs").select(cols).eq("status", "published");
    if (opts.spaceTypes) q = q.in("space_type", opts.spaceTypes);
    return q.order("published_at", { ascending: false }).limit(100);
  };
  let res = await build(NEW_COLS);
  if (res.error) res = await build(OLD_COLS);
  const now = Date.now();
  return ((res.data ?? []) as unknown as BoardRow[]).filter((r) => !r.expires_at || new Date(r.expires_at).getTime() > now);
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

/** A cleaner's own quotations, newest first, with the job each one is about (readable through the quoted-job rule of Part 15). */
export async function getQuotesForCleaner(supabase: Client, cleanerProfileId: string, companyOf: (ids: string[]) => Promise<Map<string, string>>): Promise<MyQuote[]> {
  const { data, error } = await supabase
    .from("job_responses")
    .select("id, job_id, rate_cents, message, status, valid_until, jobs!job_responses_job_id_fkey ( id, business_id, space_type, frequency, city, status, ended_at, start_date, end_date, weekdays, visit_start, visit_hours )")
    .eq("cleaner_profile_id", cleanerProfileId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return [];
  type Row = { id: string; job_id: string; rate_cents: number; message: string; status: QuoteStatus; valid_until: string | null; jobs: (BoardRow & { status: string; ended_at: string | null }) | null };
  const rows = (data ?? []) as unknown as Row[];
  const names = await companyOf(rows.map((r) => r.jobs?.business_id ?? "").filter(Boolean));
  return rows.map((r) => ({
    id: r.id, jobId: r.job_id, rateCents: r.rate_cents, message: r.message, status: r.status, validUntil: r.valid_until,
    job: r.jobs ? { spaceType: r.jobs.space_type, frequency: r.jobs.frequency, city: r.jobs.city ?? "", status: r.jobs.status, endedAt: r.jobs.ended_at, schedule: scheduleOf(r.jobs), companyName: names.get(r.jobs.business_id) ?? "—" } : null,
  }));
}
