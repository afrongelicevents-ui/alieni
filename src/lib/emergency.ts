/**
 * Emergency (same-day) cleaners — pure rules (brief v2 §8), tested without
 * a database. The database enforces the same rules atomically.
 */

export type EmergencyStatus = "searching" | "accepted" | "expired" | "cancelled";

export type EmergencyRequest = {
  id: string;
  requesterType: "household" | "business";
  windowStart: string; // ISO
  windowEnd: string;
  hours: number;
  status: EmergencyStatus;
  acceptedBy: string | null;
  acceptedAt: string | null;
  feeCents: number | null;
};

export type EmergencyFees = { householdInclBtwCents: number; businessExclBtwCents: number };
/** No booking fee until an admin sets one (Admin → Settings). */
export const DEFAULT_EMERGENCY_FEES: EmergencyFees = { householdInclBtwCents: 0, businessExclBtwCents: 0 };

export function emergencyFeeCents(requesterType: "household" | "business", fees: EmergencyFees = DEFAULT_EMERGENCY_FEES): number {
  return requesterType === "household" ? fees.householdInclBtwCents : fees.businessExclBtwCents;
}

/** Minimum emergency rate: 1.5× the cleaner's normal rate (rounded up). */
export function minEmergencyRateCents(normalRateCents: number): number {
  return Math.ceil(normalRateCents * 1.5);
}

/**
 * First cleaner to accept wins. Returns the updated request, or null when
 * the request is no longer open (already accepted, expired, window passed).
 * The fee is set ONLY here — never before acceptance.
 */
export function acceptRequest(req: EmergencyRequest, cleanerId: string, now: Date, fees?: EmergencyFees): EmergencyRequest | null {
  if (req.status !== "searching") return null;
  if (new Date(req.windowStart) <= now) return null;
  return {
    ...req,
    status: "accepted",
    acceptedBy: cleanerId,
    acceptedAt: now.toISOString(),
    feeCents: emergencyFeeCents(req.requesterType, fees),
  };
}

/** Searching requests whose window has started without acceptance expire — nothing charged. */
export function expireIfDue(req: EmergencyRequest, now: Date): EmergencyRequest {
  if (req.status === "searching" && new Date(req.windowStart) <= now) {
    return { ...req, status: "expired", feeCents: null };
  }
  return req;
}
