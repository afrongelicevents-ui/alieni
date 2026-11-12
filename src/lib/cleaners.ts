import { distanceKm, postcodeToLatLng, type LatLng } from "./geo";
import { SAMPLE_CLEANERS, type JobType, type SampleCleaner, type Weekday } from "./sample-data";

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
  /** Business job type. */
  jobType?: JobType;
  sort?: "distance" | "price" | "rating" | "jobs";
};

export type CleanerResult = SampleCleaner & { distanceKm: number | null; preciseDistance?: boolean };

export function searchCleaners(
  filters: CleanerFilters,
  options: {
    /** Precise origin from the PDOK geocoder; defaults to the region table. */
    origin?: LatLng | null;
    /** Live rows from Supabase; defaults to labelled sample data. */
    dataset?: SampleCleaner[];
    now?: Date;
    /** Precise distances (km) from the database, by cleaner id; cleaners missing here fall back to the region table. */
    distances?: Map<string, number>;
    /** Who is searching: cleaners choose whether they work for households, businesses or both. */
    viewer?: "household" | "business" | "any";
  } = {},
): CleanerResult[] {
  const origin =
    options.origin !== undefined ? options.origin : filters.q ? postcodeToLatLng(filters.q) : null;
  const dataset = options.dataset ?? SAMPLE_CLEANERS;
  const qLower = filters.q?.trim().toLowerCase() ?? "";
  const isTownQuery = qLower !== "" && !/\d/.test(qLower);
  const viewer = options.viewer ?? "any";

  let results: CleanerResult[] = dataset.map((c) => {
    const precise = options.distances?.get(c.id);
    const loc = postcodeToLatLng(c.postcode);
    const estimate = origin && loc ? Math.round(distanceKm(origin, loc) * 10) / 10 : null;
    return { ...c, distanceKm: precise ?? estimate, preciseDistance: precise !== undefined };
  });

  // Customer type: a cleaner who only works for households is not shown to businesses, and the other way round.
  if (viewer !== "any") {
    results = results.filter((c) => {
      const scope = c.workScope ?? "household";
      return scope === "both" || scope === viewer || (viewer === "business" && scope === "commercial");
    });
  }

  if (isTownQuery && !origin) {
    results = results.filter((c) => c.city.toLowerCase().includes(qLower));
  } else if (origin) {
    // Within the cleaner's own travel radius. A precise distance gets a 2 km margin;
    // the region-level estimate (first two postcode digits) keeps a 15 km tolerance.
    results = results.filter((c) => c.distanceKm !== null && c.distanceKm <= c.radiusKm + (c.preciseDistance ? 2 : 15));
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
  }

  // Default: nearest first when we know where the customer is, otherwise most verified jobs (reviews are not live yet).
  const sort = filters.sort ?? (origin ? "distance" : "jobs");
  results.sort((a, b) => {
    if (sort === "price") return a.rateCents - b.rateCents;
    if (sort === "jobs") return b.verifiedJobs - a.verifiedJobs || a.name.localeCompare(b.name);
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
  if (sort === "distance" || sort === "price" || sort === "rating" || sort === "jobs") f.sort = sort;
  const jobType = one(params.jobType);
  if (jobType && ["household", "airbnb", "hotel", "restaurant", "office"].includes(jobType)) {
    f.jobType = jobType as JobType;
  }
  return f;
}
