import "server-only";
import { postcodeToLatLng, type LatLng } from "./geo";

/**
 * Precise Dutch geocoding via the PDOK Locatieserver (free government
 * service, no API key). Falls back to the built-in postcode-region table
 * when PDOK is unreachable, so search always works.
 *
 * Privacy: the query is a postcode or town only — never an address — and
 * the result is never stored (data minimisation).
 */

const PDOK_URL = "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free";

// RD/WGS84 centroid comes back as "POINT(4.89 52.37)".
const POINT_RE = /POINT\(([\d.]+) ([\d.]+)\)/;

type PdokDoc = {
  type: string;
  centroide_ll?: string;
};

const cache = new Map<string, LatLng | null>();

export type GeoPlace = LatLng & { town: string | null };
const placeCache = new Map<string, GeoPlace | null>();

/** Coordinates plus the town name (PDOK "woonplaatsnaam"); region-table fallback has no town. */
export async function geocodePlace(query: string): Promise<GeoPlace | null> {
  const normalized = query.trim().toLowerCase().slice(0, 60);
  if (!normalized) return null;
  const cached = placeCache.get(normalized);
  if (cached !== undefined) return cached;
  let result: GeoPlace | null = null;
  try {
    const params = new URLSearchParams({ q: normalized, rows: "1", fq: "type:(postcode OR woonplaats)", fl: "type,centroide_ll,woonplaatsnaam" });
    const res = await fetch(`${PDOK_URL}?${params}`, { signal: AbortSignal.timeout(2500), headers: { Accept: "application/json" }, next: { revalidate: 60 * 60 * 24 * 30 } });
    if (res.ok) {
      const data = (await res.json()) as { response?: { docs?: (PdokDoc & { woonplaatsnaam?: string })[] } };
      const doc = data.response?.docs?.[0];
      const match = doc?.centroide_ll?.match(POINT_RE);
      if (match) result = { lng: Number(match[1]), lat: Number(match[2]), town: doc?.woonplaatsnaam ?? null };
    }
  } catch {
    // PDOK unreachable — region table below
  }
  if (!result) {
    const region = postcodeToLatLng(normalized);
    result = region ? { ...region, town: null } : null;
  }
  placeCache.set(normalized, result);
  return result;
}

export async function geocode(query: string): Promise<LatLng | null> {
  const normalized = query.trim().toLowerCase().slice(0, 60);
  if (!normalized) return null;

  const cached = cache.get(normalized);
  if (cached !== undefined) return cached;

  let result: LatLng | null = null;
  try {
    const params = new URLSearchParams({
      q: normalized,
      rows: "1",
      fq: "type:(postcode OR woonplaats)",
      fl: "type,centroide_ll",
    });
    const res = await fetch(`${PDOK_URL}?${params}`, {
      signal: AbortSignal.timeout(2500),
      headers: { Accept: "application/json" },
      // Postcode centroids are stable — cache aggressively at the edge.
      next: { revalidate: 60 * 60 * 24 * 30 },
    });
    if (res.ok) {
      const data = (await res.json()) as { response?: { docs?: PdokDoc[] } };
      const match = data.response?.docs?.[0]?.centroide_ll?.match(POINT_RE);
      if (match) {
        result = { lng: Number(match[1]), lat: Number(match[2]) };
      }
    }
  } catch {
    // PDOK unreachable — fall through to the region table.
  }

  if (!result) {
    result = postcodeToLatLng(normalized);
  }

  // Bound the in-memory cache (per server instance).
  if (cache.size > 5000) cache.clear();
  cache.set(normalized, result);
  return result;
}
