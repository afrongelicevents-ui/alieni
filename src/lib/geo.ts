/**
 * Postcode → location helpers.
 *
 * In production this uses the free PDOK Locatieserver (Dutch government
 * geocoder) plus PostGIS distance search in Supabase. Until that is
 * connected, we approximate with the first two postcode digits, which
 * identify the region in the Netherlands.
 */

export type LatLng = { lat: number; lng: number };

/** Approximate centroids for Dutch postcode regions (first 2 digits). */
const POSTCODE_REGIONS: Record<string, LatLng> = {
  "10": { lat: 52.37, lng: 4.9 }, // Amsterdam
  "11": { lat: 52.35, lng: 4.95 },
  "12": { lat: 52.09, lng: 5.11 },
  "13": { lat: 52.35, lng: 5.16 }, // Almere
  "20": { lat: 52.38, lng: 4.64 }, // Haarlem
  "22": { lat: 52.17, lng: 4.5 },
  "25": { lat: 52.08, lng: 4.3 }, // Den Haag
  "26": { lat: 52.05, lng: 4.35 },
  "27": { lat: 52.0, lng: 4.36 },
  "28": { lat: 52.01, lng: 4.71 }, // Gouda
  "30": { lat: 51.92, lng: 4.48 }, // Rotterdam
  "31": { lat: 51.9, lng: 4.5 },
  "33": { lat: 51.81, lng: 4.67 }, // Dordrecht
  "35": { lat: 52.09, lng: 5.11 }, // Utrecht
  "37": { lat: 52.08, lng: 5.29 }, // Zeist
  "38": { lat: 52.16, lng: 5.38 }, // Amersfoort
  "50": { lat: 51.69, lng: 5.3 }, // Den Bosch
  "56": { lat: 51.44, lng: 5.47 }, // Eindhoven
  "60": { lat: 51.37, lng: 6.17 }, // Venlo
  "62": { lat: 50.85, lng: 5.69 }, // Maastricht
  "65": { lat: 51.84, lng: 5.86 }, // Nijmegen
  "68": { lat: 51.99, lng: 5.9 }, // Arnhem
  "75": { lat: 52.22, lng: 6.89 }, // Enschede
  "80": { lat: 52.51, lng: 6.09 }, // Zwolle
  "90": { lat: 53.2, lng: 5.8 }, // Leeuwarden
  "97": { lat: 53.22, lng: 6.57 }, // Groningen
};

/** Resolve a Dutch postcode (or its first digits) to an approximate location. */
export function postcodeToLatLng(postcode: string): LatLng | null {
  const digits = postcode.replace(/\D/g, "");
  if (digits.length < 2) return null;
  return POSTCODE_REGIONS[digits.slice(0, 2)] ?? null;
}

/** Great-circle distance in km (haversine). */
export function distanceKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
