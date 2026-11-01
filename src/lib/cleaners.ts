import { distanceKm, postcodeToLatLng, type LatLng } from "./geo";
import { SAMPLE_CLEANERS, type JobType, type SampleCleaner, type SampleVog, type Weekday } from "./sample-data";

/**
 * Cleaner search: filtering and sorting (brief §3.2).
 * Runs over sample data today; the same filter shape maps 1:1 onto the
 * Supabase/PostGIS query once the project is connected.
 */

export type CleanerFilters = {
  q?: string; // postcode or town
  service?: string;
  maxRateCents?: number;
  day?: Weekday;
  language?: string;
  /** Business job type; "school" additionally requires a valid VOG. */
  jobType?: JobType;
  sort?: "distance" | "price" | "rating";
};

export const DEFAULT_VOG_MAX_AGE_MONTHS = 12;

/** VOG is valid when approved and issued within the max age (brief v2 §7). */
export function isVogValid(vog: SampleVog | undefined, now: Date, maxAgeMonths: number = DEFAULT_VOG_MAX_AGE_MONTHS): boolean {
  if (!vog || vog.status !== "approved") return false;
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - maxAgeMonths);
  return new Date(vog.issuedAt) >= cutoff;
}

export type CleanerResult = SampleCleaner & { distanceKm: number | null };

export function searchCleaners(
  filters: CleanerFilters,
  options: {
    /** Precise origin from the PDOK geocoder; defaults to the region table. */
    origin?: LatLng | null;
    /** Live rows from Supabase; defaults to labelled sample data. */
    dataset?: SampleCleaner[];
    now?: Date;
    vogMaxAgeMonths?: number;
  } = {},
): CleanerResult[] {
  const origin =
    options.origin !== undefined ? options.origin : filters.q ? postcodeToLatLng(filters.q) : null;
  const dataset = options.dataset ?? SAMPLE_CLEANERS;
  const qLower = filters.q?.trim().toLowerCase() ?? "";
  const isTownQuery = qLower !== "" && !/\d/.test(qLower);

  let results: CleanerResult[] = dataset.map((c) => {
    const loc = postcodeToLatLng(c.postcode);
    return {
      ...c,
      distanceKm: origin && loc ? Math.round(distanceKm(origin, loc) * 10) / 10 : null,
    };
  });

  if (isTownQuery && !origin) {
    results = results.filter((c) => c.city.toLowerCase().includes(qLower));
  } else if (origin) {
    // Within the cleaner's own travel radius (+ small tolerance for the
    // region-level approximation of sample data).
    results = results.filter((c) => c.distanceKm !== null && c.distanceKm <= c.radiusKm + 15);
  }

  if (filters.service) {
    results = results.filter((c) => c.services.includes(filters.service!));
  }
  if (filters.maxRateCents) {
    results = results.filter((c) => c.rateCents <= filters.maxRateCents!);
  }
  if (filters.day !== undefined) {
    results = results.filter((c) => (c.availability[filters.day!] ?? []).length > 0);
  }
  if (filters.language) {
    results = results.filter((c) => c.languages.includes(filters.language!));
  }
  if (filters.jobType) {
    const jobType = filters.jobType;
    results = results.filter((c) => (c.jobTypes ?? ["household"]).includes(jobType));
    if (jobType === "school") {
      const now = options.now ?? new Date();
      results = results.filter((c) => isVogValid(c.vog, now, options.vogMaxAgeMonths));
    }
  }

  const sort = filters.sort ?? (origin ? "distance" : "rating");
  results.sort((a, b) => {
    if (sort === "price") return a.rateCents - b.rateCents;
    if (sort === "rating") return b.rating - a.rating || b.reviewCount - a.reviewCount;
    // distance
    if (a.distanceKm === null) return 1;
    if (b.distanceKm === null) return -1;
    return a.distanceKm - b.distanceKm;
  });

  return results;
}

export function getCleaner(id: string): SampleCleaner | undefined {
  return SAMPLE_CLEANERS.find((c) => c.id === id);
}

/** Parse untyped URL searchParams into validated filters. */
export function parseFilters(params: Record<string, string | string[] | undefined>): CleanerFilters {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const f: CleanerFilters = {};
  const q = one(params.q)?.trim();
  if (q) f.q = q.slice(0, 60);
  const service = one(params.service);
  if (service) f.service = service;
  const maxRate = Number(one(params.maxRate));
  if (Number.isFinite(maxRate) && maxRate > 0) f.maxRateCents = Math.round(maxRate) * 100;
  const day = Number(one(params.day));
  if (Number.isInteger(day) && day >= 0 && day <= 6) f.day = day as Weekday;
  const language = one(params.language);
  if (language) f.language = language;
  const sort = one(params.sort);
  if (sort === "distance" || sort === "price" || sort === "rating") f.sort = sort;
  const jobType = one(params.jobType);
  if (jobType && ["household", "airbnb", "hotel", "restaurant", "office", "school", "emergency"].includes(jobType)) {
    f.jobType = jobType as JobType;
  }
  return f;
}
