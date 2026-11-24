import "server-only";
import { all, first, json } from "./server/db";
import { signedFileUrl } from "./server/files";
import type { DayBlock, SampleCleaner, Weekday } from "./sample-data";

/**
 * Live cleaner data from D1. Only PUBLIC columns are read for other people: the 4-digit postcode area, never the
 * full postcode or the exact point (lat/lng stays server-side; distances use a ~1 km grid, see fetchDistances).
 * There is no row-level security in D1, so the visibility rules are in these queries:
 * - published ads are public; draft/hidden/removed ads only for their owner or an admin (fetchOwnCleaner);
 * - hidden reviews are never shown.
 */

type Row = {
  id: string;
  user_id: string;
  status: string;
  rate_cents: number;
  min_hours: number;
  services: string;
  languages: string;
  postcode_area: string | null;
  radius_km: number;
  about: string | null;
  photo_key: string | null;
  verified_jobs_count: number;
  job_types: string | null;
  work_scope: string | null;
  display_name: string | null;
  city: string | null;
};

/**
 * Signed, one-hour link to a profile photo in the private R2 bucket.
 * Callers must only pass photos the viewer may see (a published ad's photo, or the viewer's own).
 */
export async function profilePhotoUrl(key: string | null | undefined): Promise<string | null> {
  return signedFileUrl(key);
}

const COLS = `cp.id, cp.user_id, cp.status, cp.rate_cents, cp.min_hours, cp.services, cp.languages, cp.postcode_area, cp.radius_km,
  cp.about, cp.photo_key, cp.verified_jobs_count, cp.job_types, cp.work_scope, p.display_name, p.city`;
const FROM = "FROM cleaner_profiles cp JOIN profiles p ON p.id = cp.user_id";

type ReviewAgg = { rating: number; count: number; items: SampleCleaner["reviews"] };

async function slotsFor(ids: string[]): Promise<Map<string, { weekday: number; block: string }[]>> {
  const out = new Map<string, { weekday: number; block: string }[]>();
  if (!ids.length) return out;
  // D1 caps bound parameters per statement; chunk the IN list.
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90);
    const rows = await all<{ cleaner_profile_id: string; weekday: number; block: string }>(
      `SELECT cleaner_profile_id, weekday, block FROM availability_slots WHERE cleaner_profile_id IN (${chunk.map(() => "?").join(",")})`, ...chunk);
    for (const r of rows) {
      const list = out.get(r.cleaner_profile_id) ?? [];
      list.push({ weekday: r.weekday, block: r.block });
      out.set(r.cleaner_profile_id, list);
    }
  }
  return out;
}

async function toCleaner(row: Row, slots: { weekday: number; block: string }[], agg?: ReviewAgg): Promise<SampleCleaner> {
  const availability: Partial<Record<Weekday, DayBlock[]>> = {};
  for (const slot of slots) {
    const day = slot.weekday as Weekday;
    (availability[day] ??= []).push(slot.block as DayBlock);
  }
  const about = row.about ?? "";
  return {
    id: row.id,
    name: row.display_name ?? "—",
    city: row.city ?? "",
    postcode: (row.postcode_area ?? "").slice(0, 4),
    rateCents: row.rate_cents,
    minHours: Number(row.min_hours),
    radiusKm: row.radius_km,
    rating: agg?.rating ?? 0,
    reviewCount: agg?.count ?? 0,
    verifiedJobs: row.verified_jobs_count,
    services: json<string[]>(row.services, []),
    languages: json<string[]>(row.languages, []),
    jobTypes: json<string[]>(row.job_types, ["household"]) as SampleCleaner["jobTypes"],
    workScope: (row.work_scope ?? "household") as SampleCleaner["workScope"],
    about: { nl: about, en: about },
    availability,
    reviews: agg?.items ?? [],
    photo: await profilePhotoUrl(row.photo_key),
  };
}

/** Rating, count and latest reviews per cleaner (user id); hidden reviews are left out. */
async function reviewAggregates(userIds: string[]): Promise<Map<string, ReviewAgg>> {
  const out = new Map<string, ReviewAgg>();
  if (!userIds.length) return out;
  for (let i = 0; i < userIds.length; i += 90) {
    const chunk = userIds.slice(i, i + 90);
    const rows = await all<{ id: string; subject_id: string; rating: number; body: string | null; created_at: string }>(
      `SELECT id, subject_id, rating, body, created_at FROM reviews WHERE hidden = 0 AND subject_id IN (${chunk.map(() => "?").join(",")})
       ORDER BY created_at DESC LIMIT 2000`, ...chunk);
    for (const r of rows) {
      const a = out.get(r.subject_id) ?? { rating: 0, count: 0, items: [] };
      a.rating += r.rating; a.count += 1;
      if (a.items.length < 5) a.items.push({ id: r.id, author: "", rating: r.rating, text: { nl: r.body ?? "", en: r.body ?? "" }, date: r.created_at.slice(0, 10) });
      out.set(r.subject_id, a);
    }
  }
  for (const a of out.values()) a.rating = Math.round((a.rating / a.count) * 10) / 10;
  return out;
}

async function build(rows: Row[]): Promise<SampleCleaner[]> {
  const [slots, aggs] = await Promise.all([slotsFor(rows.map((r) => r.id)), reviewAggregates(rows.map((r) => r.user_id))]);
  return Promise.all(rows.map((r) => toCleaner(r, slots.get(r.id) ?? [], aggs.get(r.user_id))));
}

/** All published ads (public). */
export async function fetchLiveCleaners(): Promise<SampleCleaner[] | null> {
  try {
    const rows = await all<Row>(`SELECT ${COLS} ${FROM} WHERE cp.status = 'published' AND p.suspended_at IS NULL ORDER BY cp.updated_at DESC LIMIT 500`);
    return build(rows);
  } catch {
    return null;
  }
}

/** One published ad (public); null for drafts, hidden or removed ads. */
export async function fetchLiveCleaner(id: string): Promise<SampleCleaner | null> {
  const row = await first<Row>(`SELECT ${COLS} ${FROM} WHERE cp.id = ? AND cp.status = 'published' AND p.suspended_at IS NULL`, id);
  if (!row) return null;
  return (await build([row]))[0] ?? null;
}

/** The owner's (or an admin's) own ad in any status: for "view my ad" while it is a draft or hidden. */
export async function fetchOwnCleaner(id: string, viewer: { id: string; role: string }): Promise<(SampleCleaner & { status: string }) | null> {
  const row = await first<Row>(`SELECT ${COLS} ${FROM} WHERE cp.id = ?`, id);
  if (!row) return null;
  if (row.user_id !== viewer.id && viewer.role !== "admin") return null; // only the owner or an admin
  return { ...(await build([row]))[0], status: row.status };
}

/** Snap to a ~1 km grid (0.01°), so repeated searches cannot reveal a home address. */
export const snap = (v: number) => Math.round(v * 100) / 100;

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** Distance (km, one decimal) from an origin to every published ad with a stored location, measured to the grid point. */
export async function fetchDistances(origin: { lng: number; lat: number }): Promise<Map<string, number> | undefined> {
  if (!Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) return undefined;
  try {
    const rows = await all<{ id: string; lat: number; lng: number }>(
      "SELECT id, lat, lng FROM cleaner_profiles WHERE status = 'published' AND lat IS NOT NULL AND lng IS NOT NULL");
    return new Map(rows.map((r) => [r.id, Math.round(haversineKm({ lat: snap(r.lat), lng: snap(r.lng) }, origin) * 10) / 10]));
  } catch {
    return undefined;
  }
}

export const __test = { haversineKm };
