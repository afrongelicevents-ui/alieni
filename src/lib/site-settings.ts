import "server-only";
import { first, json } from "./server/db";
import { DEFAULT_RATE_FLOOR_CENTS } from "./validation";

/** Admin → Settings values that the rules must follow (settings.value is JSON in D1). */
async function setting(key: string): Promise<unknown> {
  try {
    const row = await first<{ value: string }>("SELECT value FROM settings WHERE key = ?", key);
    return row ? json<unknown>(row.value, undefined) : undefined;
  } catch {
    return undefined;
  }
}

/** The hourly-rate floor in cents: the admin value, never below the hard minimum (€15) the database CHECK also enforces. */
export async function getRateFloorCents(): Promise<number> {
  const v = Number(await setting("rate_floor_cents"));
  return Number.isInteger(v) && v >= DEFAULT_RATE_FLOOR_CENTS ? v : DEFAULT_RATE_FLOOR_CENTS;
}

export async function getBannedWords(): Promise<string[]> {
  const v = await setting("banned_words");
  return Array.isArray(v) ? v.filter((w): w is string => typeof w === "string" && w.trim() !== "").map((w) => w.trim().toLowerCase()) : [];
}

/** The first banned word found as a whole word (case-insensitive), or null. */
export function findBannedWord(text: string, words: string[]): string | null {
  const lower = text.toLowerCase();
  for (const w of words) {
    const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "u").test(lower)) return w;
  }
  return null;
}

/**
 * The household monthly price to SHOW, or null while charging is not active. Charging is active only when payments are switched on
 * (key + PAYMENTS_ACTIVE) AND the admin has set a price above zero (Admin → Settings). Copy that mentions a price uses
 * this; otherwise it stays price-neutral.
 */
export async function getPublicHouseholdFeeCents(): Promise<number | null> {
  // Payments are OFF on this build: there is no payment provider, so no price is ever shown.
  if (!(Boolean(process.env.MOLLIE_API_KEY) && String(process.env.PAYMENTS_ACTIVE) === "true")) return null;
  const v = await setting("household_fee_cents");
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) && n > 0 ? n : null;
}
