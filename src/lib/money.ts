/**
 * Money and Dutch VAT (btw) helpers.
 *
 * All amounts are integer euro cents to avoid floating-point drift.
 * Consumer (household) prices are always shown including 21% btw (brief §6);
 * business prices are shown excluding btw.
 */

export const BTW_RATE = 0.21;

/** Split a gross (incl. btw) amount in cents into net and btw parts. */
export function splitBtw(grossCents: number): { netCents: number; btwCents: number } {
  const netCents = Math.round(grossCents / (1 + BTW_RATE));
  return { netCents, btwCents: grossCents - netCents };
}

/** Add 21% btw to a net amount in cents. */
export function addBtw(netCents: number): number {
  return Math.round(netCents * (1 + BTW_RATE));
}

/** Format cents as a euro amount in the given locale, e.g. "€ 14,95" (nl) / "€14.95" (en). */
export function formatEuro(cents: number, locale: string = "nl"): string {
  return new Intl.NumberFormat(locale === "nl" ? "nl-NL" : "en-NL", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

/** Format an hourly rate without trailing zero decimals, e.g. "€18" or "€17,50". */
export function formatHourlyRate(cents: number, locale: string = "nl"): string {
  const hasDecimals = cents % 100 !== 0;
  return new Intl.NumberFormat(locale === "nl" ? "nl-NL" : "en-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: hasDecimals ? 2 : 0,
  }).format(cents / 100);
}
