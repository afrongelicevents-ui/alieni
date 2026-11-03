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
  postcode: string;
  radius_km: number;
  about: string | null;
  verified_jobs_count: number;
  job_types: string[] | null;
  work_scope: string | null;
  emergency_rate_cents: number | null;
  vog_documents: { status: string; issued_at: string }[] | null;
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
  "id, rate_cents, min_hours, services, languages, postcode, radius_km, about, photo_path, verified_jobs_count, job_types, work_scope, emergency_rate_cents, profiles ( display_name, city ), availability_slots ( weekday, block ), vog_documents ( status, issued_at )";

function toCleaner(row: Row): SampleCleaner {
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
    postcode: row.postcode,
    rateCents: row.rate_cents,
    minHours: Number(row.min_hours),
    radiusKm: row.radius_km,
    // Ratings aggregate from the reviews table once connections exist.
    rating: 0,
    reviewCount: 0,
    verifiedJobs: row.verified_jobs_count,
    services: row.services ?? [],
    languages: row.languages ?? [],
    jobTypes: (row.job_types ?? ["household"]) as SampleCleaner["jobTypes"],
    workScope: (row.work_scope ?? "household") as SampleCleaner["workScope"],
    emergencyRateCents: row.emergency_rate_cents ?? undefined,
    vog: row.vog_documents?.[0]
      ? { status: row.vog_documents[0].status as "approved" | "pending" | "rejected", issuedAt: row.vog_documents[0].issued_at }
      : undefined,
    about: { nl: about, en: about },
    availability,
    reviews: [],
    photo: profilePhotoUrl(row.photo_path),
  };
}

export async function fetchLiveCleaners(): Promise<SampleCleaner[] | null> {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("cleaner_profiles")
    .select(SELECT)
    .eq("status", "published")
    .limit(500);
  if (error || !data) return null;
  return (data as unknown as Row[]).map(toCleaner);
}

export async function fetchLiveCleaner(id: string): Promise<SampleCleaner | null> {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("cleaner_profiles")
    .select(SELECT)
    .eq("id", id)
    .eq("status", "published")
    .maybeSingle();
  if (error || !data) return null;
  return toCleaner(data as unknown as Row);
}

/** The owner's (or an admin's) own ad in any status: for "view my ad" while it is a draft or hidden. */
export async function fetchOwnCleaner(id: string, viewer: { id: string; role: string }): Promise<(SampleCleaner & { status: string }) | null> {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data, error } = await supabase.from("cleaner_profiles").select(`${SELECT}, status, user_id`).eq("id", id).maybeSingle();
  if (error || !data) return null; // RLS: only the owner or an admin gets a non-published row
  const row = data as unknown as Row & { status: string; user_id: string };
  if (row.user_id !== viewer.id && viewer.role !== "admin") return null; // belt and braces on top of RLS
  return { ...toCleaner(row), status: row.status };
}

/** Precise distance (km) from an origin to every published ad with a stored location (database function cleaner_distances). */
export async function fetchDistances(origin: { lng: number; lat: number }): Promise<Map<string, number> | undefined> {
  const supabase = await createClient();
  if (!supabase) return undefined;
  const { data, error } = await supabase.rpc("cleaner_distances", { p_lng: origin.lng, p_lat: origin.lat });
  if (error || !data) return undefined; // before Part 12 the function does not exist: the region estimate is used
  return new Map((data as { id: string; distance_km: number }[]).map((r) => [r.id, Number(r.distance_km)]));
}
