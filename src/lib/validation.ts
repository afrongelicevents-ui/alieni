import { z } from "zod";

/**
 * Platform-wide validation rules (brief §5, §7).
 * The rate floor is a default; the live value comes from admin settings
 * (Dutch minimum wage changes every 1 January and 1 July).
 */

/** Default minimum hourly rate in cents: €15/hour. Admin-configurable. */
export const DEFAULT_RATE_FLOOR_CENTS = 1500;

export function isValidHourlyRate(
  rateCents: number,
  floorCents: number = DEFAULT_RATE_FLOOR_CENTS,
): boolean {
  return Number.isInteger(rateCents) && rateCents >= floorCents;
}

/** Dutch postcode: 4 digits + 2 letters, e.g. "1012 AB" or "1012ab". */
export const dutchPostcodeSchema = z
  .string()
  .trim()
  .regex(/^[1-9][0-9]{3}\s?[A-Za-z]{2}$/, "invalid_postcode")
  .transform((value) => value.replace(/\s/g, "").toUpperCase())
  .transform((value) => `${value.slice(0, 4)} ${value.slice(4)}`);

export function makeHourlyRateSchema(floorCents: number = DEFAULT_RATE_FLOOR_CENTS) {
  return z
    .number()
    .int()
    .min(floorCents, "rate_below_floor")
    .max(50000, "rate_unrealistic");
}

export const emailSchema = z.string().trim().toLowerCase().email();
