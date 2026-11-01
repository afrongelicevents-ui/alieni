/**
 * SSRF protection for user-supplied calendar URLs (security review of
 * business v2). The cron only fetches https URLs on known calendar hosts,
 * never IP literals, localhost or private/internal names.
 */

const ALLOWED_HOST_SUFFIXES = [
  "airbnb.com",
  "airbnb.nl",
  "booking.com",
  "vrbo.com",
  "homeaway.com",
  "abritel.fr",
  "expedia.com",
  "lodgify.com",
  "smoobu.com",
  "guesty.com",
  "hospitable.com",
  "uplisting.io",
  "beds24.com",
  "google.com", // Google Calendar private iCal
  "icloud.com",
  "outlook.com",
  "office365.com",
];

export function isSafeIcalUrl(input: string): boolean {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) return false; // IPv4 / IPv6 literals
  return ALLOWED_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}
