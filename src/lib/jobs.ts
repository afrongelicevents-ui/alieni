/**
 * Business jobs (brief §4). Pricing decision 2026-11-01: €9.95 excl. btw
 * per job post, configurable in admin settings.
 *
 * Data minimisation: a job carries a postcode AREA only, never a street
 * address — the exact location is shared between the parties themselves.
 */

export const JOB_POST_PRICE_EXCL_BTW_CENTS = 995;

export type SpaceType = "office" | "shop" | "airbnb" | "hospitality" | "other";
export type Frequency = "once" | "weekly" | "biweekly" | "monthly";

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
  weekly: { nl: "Wekelijks", en: "Weekly" },
  biweekly: { nl: "Om de week", en: "Every two weeks" },
  monthly: { nl: "Maandelijks", en: "Monthly" },
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
