import "server-only";
import { createClient } from "./supabase/server";
import type { DayBlock, SampleCleaner, Weekday } from "./sample-data";

/**
 * Live cleaner data from Supabase. Returns null while the project is not
 * configured, in which case pages fall back to labelled sample data —
 * the same shape, so the swap is invisible to the UI.
 */

type Row = {
  id: string;
  rate_cents: number;
  min_hours: number;
  services: string[];
  languages: string[];
  user_id: string;
  postcode_area: string;
  radius_km: number;
  about: string | null;
  verified_jobs_count: number;
  job_types: string[] | null;
  work_scope: string | null;
  profiles: { display_name: string; city: string | null } | null;
  availability_slots: { weekday: number; block: string }[];
  photo_path: string | null;
};

/** Public URL of a profile photo in the 'profile-photos' bucket. */
export function profilePhotoUrl(path: string | null | undefined): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!path || !base) return null;
  return `${base}/storage/v1/object/public/profile-photos/${path}`;
}

const SELECT =
  "id, user_id, rate_cents, min_hours, services, languages, postcode_area, radius_km, about, photo_path, verified_jobs_count, job_types, work_scope, profiles!cleaner_profiles_user_id_fkey ( display_name, city ), availability_slots ( weekday, block )";

type ReviewAgg = { rating: number; count: number; items: SampleCleaner["reviews"] };

function toCleaner(row: Row, agg?: ReviewAgg): SampleCleaner {
  const availability: Partial<Record<Weekday, DayBlock[]>> = {};
  for (const slot of row.availability_slots ?? []) {
    const day = slot.weekday as Weekday;
    (availability[day] ??= []).push(slot.block as DayBlock);
  }
  const about = row.about ?? "";
  return {
    id: row.id,
    name: row.profiles?.display_name ?? "—",
    city: row.profiles?.city ?? "",
    postcode: (row.postcode_area ?? (row as unknown as { postcode?: string }).postcode ?? "").slice(0, 4),
    rateCents: row.rate_cents,
    minHours: Number(row.min_hours),
    radiusKm: row.radius_km,
    rating: agg?.rating ?? 0,
    reviewCount: agg?.count ?? 0,
    verifiedJobs: row.verified_jobs_count,
    services: row.services ?? [],
    languages: row.languages ?? [],
    jobTypes: (row.job_types ?? ["household"]) as SampleCleaner["jobTypes"],
    workScope: (row.work_scope ?? "household") as SampleCleaner["workScope"],
    about: { nl: about, en: about },
    availability,
    reviews: agg?.items ?? [],
    photo: profilePhotoUrl(row.photo_path),
  };
}

type SupabaseClient = NonNullable<Awaited<ReturnType<typeof createClient>>>;

/** Part 16 adds postcode_area and hides the full postcode; until it has been run the older column is read instead. */
const OLD_SELECT = SELECT.replace("postcode_area", "postcode");
async function selectAds(supabase: SupabaseClient, build: (cols: string) => PromiseLike<{ data: unknown; error: unknown }>): Promise<{ data: unknown; error: unknown }> {
  const first = await build(SELECT);
  return first.error ? build(OLD_SELECT) : first;
}

/** Rating, count and latest reviews per cleaner (user id), from the public reviews table. */
async function reviewAggregates(supabase: SupabaseClient, userIds: string[]): Promise<Map<string, ReviewAgg>> {
  const out = new Map<string, ReviewAgg>();
  if (!userIds.length) return out;
  const { data } = await supabase.from("reviews").select("id, subject_id, rating, body, created_at").in("subject_id", userIds).order("created_at", { ascending: false }).limit(2000);
  for (const r of (data ?? []) as { id: string; subject_id: string; rating: number; body: string | null; created_at: string }[]) {
    const a = out.get(r.subject_id) ?? { rating: 0, count: 0, items: [] };
    a.rating += r.rating; a.count += 1;
    if (a.items.length < 5) a.items.push({ id: r.id, author: "", rating: r.rating, text: { nl: r.body ?? "", en: r.body ?? "" }, date: r.created_at.slice(0, 10) });
    out.set(r.subject_id, a);
  }
  for (const a of out.values()) a.rating = Math.round((a.rating / a.count) * 10) / 10;
  return out;
}

export async function fetchLiveCleaners(): Promise<SampleCleaner[] | null> {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data, error } = await selectAds(supabase, (cols) => supabase.from("cleaner_profiles").select(cols).eq("status", "published").limit(500));
  if (error || !data) return null;
  const rows = data as unknown as Row[];
  const aggs = await reviewAggregates(supabase, rows.map((r) => r.user_id));
  return rows.map((r) => toCleaner(r, aggs.get(r.user_id)));
}

export async function fetchLiveCleaner(id: string): Promise<SampleCleaner | null> {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data, error } = await selectAds(supabase, (cols) => supabase.from("cleaner_profiles").select(cols).eq("id", id).eq("status", "published").maybeSingle());
  if (error || !data) return null;
  const row = data as unknown as Row;
  const aggs = await reviewAggregates(supabase, [row.user_id]);
  return toCleaner(row, aggs.get(row.user_id));
}

/** The owner's (or an admin's) own ad in any status: for "view my ad" while it is a draft or hidden. */
export async function fetchOwnCleaner(id: string, viewer: { id: string; role: string }): Promise<(SampleCleaner & { status: string }) | null> {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data, error } = await selectAds(supabase, (cols) => supabase.from("cleaner_profiles").select(`${cols}, status`).eq("id", id).maybeSingle());
  if (error || !data) return null; // RLS: only the owner or an admin gets a non-published row
  const row = data as unknown as Row & { status: string; user_id: string };
  if (row.user_id !== viewer.id && viewer.role !== "admin") return null; // belt and braces on top of RLS
  const aggs = await reviewAggregates(supabase, [row.user_id]);
  return { ...toCleaner(row, aggs.get(row.user_id)), status: row.status };
}

/** Precise distance (km) from an origin to every published ad with a stored location (database function cleaner_distances). */
export async function fetchDistances(origin: { lng: number; lat: number }): Promise<Map<string, number> | undefined> {
  const supabase = await createClient();
  if (!supabase) return undefined;
  const { data, error } = await supabase.rpc("cleaner_distances", { p_lng: origin.lng, p_lat: origin.lat });
  if (error || !data) return undefined; // before Part 12 the function does not exist: the region estimate is used
  return new Map((data as { id: string; distance_km: number }[]).map((r) => [r.id, Number(r.distance_km)]));
}
