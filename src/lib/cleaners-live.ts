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
  profiles: { display_name: string; city: string | null } | null;
  availability_slots: { weekday: number; block: string }[];
};

const SELECT =
  "id, rate_cents, min_hours, services, languages, postcode, radius_km, about, verified_jobs_count, profiles ( display_name, city ), availability_slots ( weekday, block )";

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
    about: { nl: about, en: about },
    availability,
    reviews: [],
    photo: null, // signed URL resolution lands with the upload pipeline
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
