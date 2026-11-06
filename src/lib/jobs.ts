/**
 * Business jobs (brief §4). Posting is FREE (business v2): businesses pay a
 * fixed monthly fee per unit, invoiced month-end — never per post.
 *
 * Data minimisation: a job carries a postcode AREA only, never a street
 * address — the exact location is shared between the parties themselves.
 */

export type SpaceType = "office" | "shop" | "airbnb" | "hospitality" | "other";
export type Frequency = "once" | "daily" | "weekly" | "biweekly" | "monthly" | "per_checkout";

export type SampleJob = {
  id: string;
  companyName: string;
  spaceType: SpaceType;
  sizeM2: number | null;
  postcode: string;
  city: string;
  frequency: Frequency;
  scheduleNote: { nl: string; en: string } | null;
  description: { nl: string; en: string };
  budgetCents: number;
  publishedAt: string;
};

export const SPACE_TYPE_LABELS: Record<SpaceType, { nl: string; en: string }> = {
  office: { nl: "Kantoor", en: "Office" },
  shop: { nl: "Winkel", en: "Shop" },
  airbnb: { nl: "Airbnb / verhuur", en: "Airbnb / rental" },
  hospitality: { nl: "Horeca", en: "Hospitality" },
  other: { nl: "Anders", en: "Other" },
};

export const FREQUENCY_LABELS: Record<Frequency, { nl: string; en: string }> = {
  once: { nl: "Eenmalig", en: "One-off" },
  daily: { nl: "Dagelijks", en: "Daily" },
  weekly: { nl: "Wekelijks", en: "Weekly" },
  biweekly: { nl: "Om de week", en: "Every two weeks" },
  monthly: { nl: "Maandelijks", en: "Monthly" },
  per_checkout: { nl: "Per checkout", en: "Per checkout" },
};

/** SAMPLE DATA — labelled placeholder jobs until Supabase is connected. */
export const SAMPLE_JOBS: SampleJob[] = [
  {
    id: "job-1",
    companyName: "HostPro BV",
    spaceType: "airbnb",
    sizeM2: 65,
    postcode: "1016 AB",
    city: "Amsterdam",
    frequency: "weekly",
    scheduleNote: { nl: "Wisseldagen: vrijdag en maandag, 11:00–15:00", en: "Turnover days: Friday and Monday, 11:00–15:00" },
    description: {
      nl: "Wisselschoonmaak voor twee appartementen in de Jordaan: bedden opmaken, linnen wisselen, badkamer en keuken grondig, voorraadcheck.",
      en: "Turnover cleaning for two apartments in the Jordaan: make beds, change linen, thorough bathroom and kitchen, inventory check.",
    },
    budgetCents: 2200,
    publishedAt: "2026-10-30T09:00:00Z",
  },
  {
    id: "job-2",
    companyName: "Kapsalon Glans",
    spaceType: "shop",
    sizeM2: 48,
    postcode: "3012 CL",
    city: "Rotterdam",
    frequency: "weekly",
    scheduleNote: { nl: "Maandagochtend vóór 9:00 (zaak gesloten)", en: "Monday morning before 9:00 (shop closed)" },
    description: {
      nl: "Wekelijkse schoonmaak van onze kapsalon: vloeren (veel haar!), spiegels, wasbakken, wachtruimte en toilet.",
      en: "Weekly cleaning of our hair salon: floors (lots of hair!), mirrors, sinks, waiting area and toilet.",
    },
    budgetCents: 1800,
    publishedAt: "2026-10-28T14:00:00Z",
  },
  {
    id: "job-3",
    companyName: "Studio Noord",
    spaceType: "office",
    sizeM2: 220,
    postcode: "1031 KT",
    city: "Amsterdam",
    frequency: "biweekly",
    scheduleNote: { nl: "Donderdagavond na 18:00", en: "Thursday evening after 18:00" },
    description: {
      nl: "Kantoorruimte met 18 werkplekken, twee vergaderruimtes en een keukentje. Om de week grondig: vloeren, bureaus, sanitair, keuken.",
      en: "Office with 18 desks, two meeting rooms and a kitchenette. Thorough clean every two weeks: floors, desks, sanitary, kitchen.",
    },
    budgetCents: 2000,
    publishedAt: "2026-10-25T10:00:00Z",
  },
];

/** Frequencies that repeat on a schedule (the 'contract' service). 'once' is the one-off service; 'per_checkout' follows the turnover calendar. */
export const RECURRING_FREQUENCIES: Frequency[] = ["daily", "weekly", "biweekly", "monthly"];
export const isRecurring = (f: Frequency): boolean => RECURRING_FREQUENCIES.includes(f);

/** Which service in the catalogue a job belongs to (mirrors job_service_key() in the database). */
export function jobServiceKey(f: Frequency): "oneoff" | "contract" | "turnover" {
  return f === "once" ? "oneoff" : f === "per_checkout" ? "turnover" : "contract";
}

/** ISO weekdays: 1 = Monday … 7 = Sunday. */
export const WEEKDAYS: { n: number; nl: string; en: string }[] = [
  { n: 1, nl: "Ma", en: "Mon" }, { n: 2, nl: "Di", en: "Tue" }, { n: 3, nl: "Wo", en: "Wed" }, { n: 4, nl: "Do", en: "Thu" },
  { n: 5, nl: "Vr", en: "Fri" }, { n: 6, nl: "Za", en: "Sat" }, { n: 7, nl: "Zo", en: "Sun" },
];

export type JobSchedule = {
  startDate: string | null; // YYYY-MM-DD
  endDate: string | null;
  weekdays: number[];
  visitStart: string | null; // HH:MM
  visitHours: number | null;
};

export type QuoteStatus = "sent" | "accepted" | "declined";

const fmtDate = (iso: string, lang: "nl" | "en") => new Date(`${iso}T12:00:00Z`).toLocaleDateString(lang === "en" ? "en-GB" : "nl-NL", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** One readable line about when the work happens, e.g. "Mon, Thu · 07:00 · 2 h per visit · from 12 Nov 2026". */
export function scheduleSummary(frequency: Frequency, s: JobSchedule, lang: "nl" | "en"): string {
  const parts: string[] = [];
  if (isRecurring(frequency) && s.weekdays.length && frequency !== "monthly") parts.push(WEEKDAYS.filter((d) => s.weekdays.includes(d.n)).map((d) => d[lang]).join(", "));
  if (s.visitStart) parts.push(s.visitStart.slice(0, 5));
  if (s.visitHours) parts.push(lang === "nl" ? `${String(s.visitHours).replace(".", ",")} uur per keer` : `${s.visitHours} h per visit`);
  if (s.startDate) parts.push(`${isRecurring(frequency) ? (lang === "nl" ? "vanaf" : "from") : (lang === "nl" ? "op" : "on")} ${fmtDate(s.startDate, lang)}`);
  if (s.endDate) parts.push(`${lang === "nl" ? "tot" : "until"} ${fmtDate(s.endDate, lang)}`);
  return parts.join(" · ");
}

/** What one visit costs at an hourly rate, in cents; null when the job has no hours per visit. */
export function visitTotalCents(rateCents: number, hours: number | null): number | null {
  return hours && hours > 0 ? Math.round(rateCents * hours) : null;
}

export function quoteExpired(validUntil: string | null, now: Date = new Date()): boolean {
  if (!validUntil) return false;
  return validUntil < now.toISOString().slice(0, 10);
}
