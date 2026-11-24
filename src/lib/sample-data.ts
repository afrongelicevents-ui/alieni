/**
 * SAMPLE DATA — clearly labelled placeholder content used while the
 * Supabase integration is not yet connected (brief §12). Pages show a
 * "sample data" notice whenever this is rendered.
 */

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Monday
export type DayBlock = "morning" | "afternoon" | "evening";

export type SampleReview = {
  id: string;
  author: string;
  rating: number;
  text: { nl: string; en: string };
  date: string;
};

export type JobType = "household" | "airbnb" | "hotel" | "restaurant" | "office";


export type SampleCleaner = {
  id: string;
  name: string;
  city: string;
  postcode: string;
  rateCents: number;
  minHours: number;
  radiusKm: number;
  rating: number;
  reviewCount: number;
  verifiedJobs: number;
  services: string[];
  languages: string[];
  jobTypes: JobType[];
  kvkNumber?: string; // legacy sample field, no longer collected
  workScope?: "household" | "commercial" | "both";
  about: { nl: string; en: string };
  availability: Partial<Record<Weekday, DayBlock[]>>;
  reviews: SampleReview[];
  photo: string | null;
};

export const SERVICE_LABELS: Record<string, { nl: string; en: string }> = {
  regular: { nl: "Regulier schoonmaken", en: "Regular cleaning" },
  deep: { nl: "Dieptereiniging", en: "Deep cleaning" },
  windows: { nl: "Ramen", en: "Windows" },
  "move-out": { nl: "Verhuisschoonmaak", en: "Move-out cleaning" },
  ironing: { nl: "Strijken", en: "Ironing" },
  office: { nl: "Kantoor", en: "Office" },
  airbnb: { nl: "Airbnb / verhuur", en: "Airbnb / rental" },
};

export const JOB_TYPE_LABELS: Record<JobType, { nl: string; en: string }> = {
  household: { nl: "Huishoudens", en: "Households" },
  airbnb: { nl: "Airbnb & short-stay", en: "Airbnb & short-let" },
  hotel: { nl: "Hotels", en: "Hotels" },
  restaurant: { nl: "Restaurants", en: "Restaurants" },
  office: { nl: "Kantoren", en: "Offices" },
};

export const BUSINESS_JOB_TYPES: JobType[] = ["airbnb", "hotel", "restaurant", "office"];

export const LANGUAGE_LABELS: Record<string, { nl: string; en: string }> = {
  nl: { nl: "Nederlands", en: "Dutch" },
  en: { nl: "Engels", en: "English" },
  es: { nl: "Spaans", en: "Spanish" },
  pt: { nl: "Portugees", en: "Portuguese" },
  pl: { nl: "Pools", en: "Polish" },
  tr: { nl: "Turks", en: "Turkish" },
  ar: { nl: "Arabisch", en: "Arabic" },
};

const WEEK_MOST: Partial<Record<Weekday, DayBlock[]>> = {
  0: ["morning", "afternoon"],
  1: ["morning", "afternoon"],
  2: ["morning"],
  3: ["morning", "afternoon", "evening"],
  4: ["morning", "afternoon"],
};

/**
 * Eight sample profiles ("Voorbeeldprofiel / Sample profile"), shown after the real ads so visitors see what an ad looks
 * like. They are clearly marked, have no reviews (we never invent reviews) and cannot be contacted, saved or reported.
 */
const FULL_WEEK = (extra: Partial<Record<Weekday, DayBlock[]>> = {}): Partial<Record<Weekday, DayBlock[]>> => ({
  0: ["morning", "afternoon"], 1: ["morning", "afternoon"], 2: ["morning"], 3: ["morning", "afternoon"], 4: ["morning"], ...extra,
});
const sample = (c: Omit<SampleCleaner, "rating" | "reviewCount" | "verifiedJobs" | "reviews" | "photo" | "minHours"> & { minHours?: number }): SampleCleaner =>
  ({ minHours: 2, ...c, rating: 0, reviewCount: 0, verifiedJobs: 0, reviews: [], photo: null });

export const SAMPLE_CLEANERS: SampleCleaner[] = [
  sample({
    id: "sample-1", name: "Annemiek de Groot", city: "Amsterdam", postcode: "1074 EG", rateCents: 2100, minHours: 3, radiusKm: 8,
    services: ["regular", "deep", "ironing"], languages: ["nl", "en"], jobTypes: ["household"], workScope: "household",
    about: {
      nl: "Ik maak al twaalf jaar huizen schoon in Amsterdam-Zuid en De Pijp. Vaste klanten waarderen dat ik zelfstandig werk, op tijd ben en zie wat er moet gebeuren. Strijken doe ik er graag bij.",
      en: "I have been cleaning homes in Amsterdam-Zuid and De Pijp for twelve years. Regular clients value that I work independently, am on time and see what needs doing. I am happy to do the ironing too.",
    },
    availability: FULL_WEEK({ 4: ["morning", "afternoon"] }),
  }),
  sample({
    id: "sample-2", name: "Kwame Asante", city: "Rotterdam", postcode: "3014 DA", rateCents: 1950, radiusKm: 15,
    services: ["office", "regular", "windows"], languages: ["en", "nl"], jobTypes: ["household", "office", "restaurant"], workScope: "both",
    about: {
      nl: "Kantoren, praktijken en woningen in Rotterdam-Centrum en Kralingen. Ik werk 's ochtends vroeg of 's avonds na sluitingstijd, met eigen professionele middelen.",
      en: "Offices, practices and homes in Rotterdam-Centrum and Kralingen. I work early mornings or evenings after closing, with my own professional supplies.",
    },
    availability: FULL_WEEK({ 0: ["morning", "evening"], 2: ["morning", "evening"], 5: ["morning"] }),
  }),
  sample({
    id: "sample-3", name: "Ewa Kowalska", city: "Utrecht", postcode: "3581 KD", rateCents: 1700, radiusKm: 10,
    services: ["regular", "ironing", "windows"], languages: ["pl", "nl", "en"], jobTypes: ["household"], workScope: "household",
    about: {
      nl: "Rustig, grondig en betrouwbaar. Ik werk voor gezinnen in Utrecht-Oost en Wittevrouwen, ook op zaterdag. Je huis ziet er na mijn bezoek weer fris en opgeruimd uit.",
      en: "Calm, thorough and reliable. I work for families in Utrecht-Oost and Wittevrouwen, Saturdays too. After my visit your home looks fresh and tidy again.",
    },
    availability: FULL_WEEK({ 5: ["morning", "afternoon"] }),
  }),
  sample({
    id: "sample-4", name: "Fatima Benali", city: "Den Haag", postcode: "2517 KJ", rateCents: 1850, radiusKm: 12,
    services: ["deep", "move-out", "regular"], languages: ["nl", "ar", "fr"], jobTypes: ["household", "airbnb"], workScope: "household",
    about: {
      nl: "Gespecialiseerd in dieptereiniging en eindschoonmaak bij verhuizing in Den Haag en Scheveningen. Ik werk met een vaste checklist, zodat niets wordt vergeten.",
      en: "Specialised in deep cleaning and move-out cleaning in The Hague and Scheveningen. I work with a fixed checklist, so nothing is forgotten.",
    },
    availability: FULL_WEEK({ 2: ["morning", "afternoon"], 6: ["afternoon"] }),
  }),
  sample({
    id: "sample-5", name: "Joris van den Berg", city: "Eindhoven", postcode: "5611 EM", rateCents: 2300, radiusKm: 20,
    services: ["office", "windows", "deep"], languages: ["nl", "en"], jobTypes: ["office", "restaurant", "hotel"], workScope: "commercial",
    about: {
      nl: "Zakelijke schoonmaak voor kantoren, horeca en kleine hotels in de regio Eindhoven. Ook glasbewassing tot de tweede verdieping. Vaste afspraken, duidelijke communicatie.",
      en: "Commercial cleaning for offices, restaurants and small hotels around Eindhoven. Window cleaning up to the second floor as well. Fixed schedules and clear communication.",
    },
    availability: FULL_WEEK({ 0: ["morning", "evening"], 1: ["evening"], 3: ["evening"] }),
  }),
  sample({
    id: "sample-6", name: "Sanne Hoekstra", city: "Groningen", postcode: "9712 HN", rateCents: 1600, radiusKm: 10,
    services: ["regular", "move-out"], languages: ["nl", "en"], jobTypes: ["household"], workScope: "household",
    about: {
      nl: "Student-vriendelijk tarief voor studentenhuizen, appartementen en eengezinswoningen in Groningen. Flexibel inzetbaar, ook voor een eenmalige grote schoonmaak.",
      en: "Student-friendly rate for shared student houses, flats and family homes in Groningen. Flexible, also for a one-off big clean.",
    },
    availability: FULL_WEEK({ 3: ["afternoon", "evening"], 6: ["morning"] }),
  }),
  sample({
    id: "sample-7", name: "Mariana Costa", city: "Haarlem", postcode: "2011 VB", rateCents: 2250, radiusKm: 15,
    services: ["airbnb", "regular", "deep"], languages: ["pt", "en", "nl"], jobTypes: ["household", "airbnb", "hotel"], workScope: "both",
    about: {
      nl: "Wissels voor Airbnb en vakantiewoningen in Haarlem, Zandvoort en Bloemendaal. Snel en netjes tussen check-out en check-in, met foto's na afloop als je dat wilt.",
      en: "Turnovers for Airbnb and holiday homes in Haarlem, Zandvoort and Bloemendaal. Fast and tidy between check-out and check-in, with photos afterwards if you like.",
    },
    availability: FULL_WEEK({ 4: ["morning", "afternoon"], 5: ["morning", "afternoon"], 6: ["morning", "afternoon"] }),
  }),
  sample({
    id: "sample-8", name: "Hamza Yilmaz", city: "Arnhem", postcode: "6811 DJ", rateCents: 2500, minHours: 3, radiusKm: 25,
    services: ["deep", "windows", "office", "regular"], languages: ["tr", "nl", "en"], jobTypes: ["household", "office"], workScope: "both",
    about: {
      nl: "Vijftien jaar ervaring in schoonmaak van woningen en kantoren in Arnhem en Nijmegen. Grondige dieptereiniging, ramen binnen en buiten, en vaste weekafspraken.",
      en: "Fifteen years of experience cleaning homes and offices in Arnhem and Nijmegen. Thorough deep cleaning, windows inside and out, and fixed weekly appointments.",
    },
    availability: FULL_WEEK({ 1: ["morning", "afternoon", "evening"] }),
  }),
];

export const isSampleCleanerId = (id: string) => /^sample-\d+$/.test(id);

export const SAMPLE_FEATURED_CLEANERS = SAMPLE_CLEANERS.slice(0, 3);
