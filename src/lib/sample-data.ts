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

export const SAMPLE_CLEANERS: SampleCleaner[] = [
  {
    id: "sample-1",
    name: "Sandra M.",
    city: "Amsterdam",
    postcode: "1012 AB",
    rateCents: 1800,
    minHours: 3,
    radiusKm: 12,
    rating: 4.9,
    reviewCount: 120,
    verifiedJobs: 87,
    services: ["regular", "deep"],
    languages: ["nl", "en"],
    jobTypes: ["household", "office"],
    kvkNumber: "87654321",
    about: {
      nl: "Al 8 jaar schoonmaker in Amsterdam. Ik werk nauwkeurig, neem mijn eigen middelen mee en denk graag mee over wat jouw huis nodig heeft.",
      en: "Cleaner in Amsterdam for 8 years. I work precisely, bring my own supplies and like to think along about what your home needs.",
    },
    availability: WEEK_MOST,
    reviews: [
      { id: "r1", author: "Familie J.", rating: 5, date: "2026-09-14", text: { nl: "Sandra is top: betrouwbaar, grondig en altijd vrolijk.", en: "Sandra is great: reliable, thorough and always cheerful." } },
      { id: "r2", author: "Peter V.", rating: 5, date: "2026-08-02", text: { nl: "Huis blinkt elke week weer. Echte aanrader.", en: "The house shines every week. Highly recommended." } },
    ],
    photo: null,
  },
  {
    id: "sample-2",
    name: "Kofi A.",
    city: "Rotterdam",
    postcode: "3011 BR",
    rateCents: 1750,
    minHours: 2,
    radiusKm: 15,
    rating: 4.8,
    reviewCount: 86,
    verifiedJobs: 64,
    services: ["regular", "windows"],
    languages: ["nl", "en"],
    jobTypes: ["household", "restaurant"],
    kvkNumber: "76543210",
    about: {
      nl: "Specialist in ramen en regulier onderhoud. Flexibel in de avonduren en op zaterdag.",
      en: "Specialist in windows and regular maintenance. Flexible in the evenings and on Saturdays.",
    },
    availability: { 1: ["afternoon", "evening"], 3: ["evening"], 5: ["morning", "afternoon"] },
    reviews: [
      { id: "r3", author: "Anouk D.", rating: 5, date: "2026-10-01", text: { nl: "Streeploze ramen, snel en netjes.", en: "Streak-free windows, fast and tidy." } },
    ],
    photo: null,
  },
  {
    id: "sample-3",
    name: "Maria V.",
    city: "Utrecht",
    postcode: "3511 LX",
    rateCents: 2000,
    minHours: 4,
    radiusKm: 20,
    rating: 5.0,
    reviewCount: 64,
    verifiedJobs: 58,
    services: ["deep", "move-out"],
    languages: ["nl", "es", "en"],
    jobTypes: ["household", "office"],
    kvkNumber: "65432109",
    about: {
      nl: "Dieptereiniging en verhuisschoonmaak zijn mijn specialiteit. Opleveringsgarantie voor verhuurders.",
      en: "Deep cleaning and move-out cleans are my specialty. Handover guarantee for landlords.",
    },
    availability: { 0: ["morning", "afternoon", "evening"], 2: ["morning", "afternoon"], 4: ["morning"] },
    reviews: [
      { id: "r4", author: "B. Haan", rating: 5, date: "2026-09-20", text: { nl: "Oplevering vlekkeloos verlopen dankzij Maria.", en: "Handover went flawlessly thanks to Maria." } },
    ],
    photo: null,
  },
  {
    id: "sample-4",
    name: "Ewa K.",
    city: "Den Haag",
    postcode: "2511 CV",
    rateCents: 1650,
    minHours: 3,
    radiusKm: 10,
    rating: 4.7,
    reviewCount: 41,
    verifiedJobs: 33,
    services: ["regular", "ironing"],
    languages: ["pl", "nl", "en"],
    jobTypes: ["household"],
    about: {
      nl: "Regulier schoonmaken en strijken. Vaste klanten krijgen een vast moment in de week.",
      en: "Regular cleaning and ironing. Regular clients get a fixed weekly slot.",
    },
    availability: { 0: ["morning"], 1: ["morning", "afternoon"], 2: ["morning", "afternoon"], 3: ["morning"] },
    reviews: [],
    photo: null,
  },
  {
    id: "sample-5",
    name: "Yusuf D.",
    city: "Eindhoven",
    postcode: "5611 AZ",
    rateCents: 1700,
    minHours: 2,
    radiusKm: 25,
    rating: 4.6,
    reviewCount: 29,
    verifiedJobs: 21,
    services: ["regular", "office", "windows"],
    languages: ["tr", "nl"],
    jobTypes: ["office", "restaurant"],
    kvkNumber: "54321098",
    about: {
      nl: "Overdag kantoren, in het weekend huishoudens. Eigen auto, dus ook buiten de stad beschikbaar.",
      en: "Offices during the day, households at the weekend. Own car, so also available outside the city.",
    },
    availability: { 5: ["morning", "afternoon"], 6: ["morning", "afternoon"] },
    reviews: [],
    photo: null,
  },
  {
    id: "sample-6",
    name: "Fernanda S.",
    city: "Amsterdam",
    postcode: "1055 KL",
    rateCents: 2200,
    minHours: 3,
    radiusKm: 8,
    rating: 4.9,
    reviewCount: 73,
    verifiedJobs: 69,
    services: ["airbnb", "regular", "deep"],
    languages: ["pt", "en", "nl"],
    jobTypes: ["airbnb", "hotel", "household"],
    kvkNumber: "43210987",
    about: {
      nl: "Airbnb-specialist: schoonmaak tussen gasten, bedden opmaken en voorraadcheck. Ook vast huishoudelijk werk.",
      en: "Airbnb specialist: cleaning between guests, making beds and inventory check. Also regular housework.",
    },
    availability: { 0: ["morning", "afternoon"], 1: ["morning", "afternoon"], 2: ["morning", "afternoon"], 3: ["morning", "afternoon"], 4: ["morning", "afternoon"], 5: ["morning"] },
    reviews: [
      { id: "r5", author: "HostPro BV", rating: 5, date: "2026-10-12", text: { nl: "Onze gasten geven de schoonmaak steevast een 10.", en: "Our guests consistently rate the cleaning 10/10." } },
    ],
    photo: null,
  },
  {
    id: "sample-7",
    name: "Lotte B.",
    city: "Groningen",
    postcode: "9711 LM",
    rateCents: 1600,
    minHours: 2,
    radiusKm: 12,
    rating: 4.8,
    reviewCount: 18,
    verifiedJobs: 14,
    services: ["regular"],
    languages: ["nl", "en"],
    jobTypes: ["household"],
    kvkNumber: "32109876",
    about: {
      nl: "Student verpleegkunde met oog voor detail. Beschikbaar op maandag, woensdag en vrijdag.",
      en: "Nursing student with an eye for detail. Available Monday, Wednesday and Friday.",
    },
    availability: { 0: ["afternoon", "evening"], 2: ["afternoon"], 4: ["morning", "afternoon"] },
    reviews: [],
    photo: null,
  },
  {
    id: "sample-8",
    name: "Hassan E.",
    city: "Rotterdam",
    postcode: "3083 DN",
    rateCents: 1900,
    minHours: 3,
    radiusKm: 18,
    rating: 4.9,
    reviewCount: 54,
    verifiedJobs: 47,
    services: ["deep", "move-out", "windows"],
    languages: ["ar", "nl", "en"],
    jobTypes: ["household", "airbnb"],
    kvkNumber: "21098765",
    about: {
      nl: "Grondige dieptereiniging, ook in het weekend.",
      en: "Thorough deep cleaning, weekends too.",
    },
    availability: { 1: ["morning", "afternoon"], 3: ["morning", "afternoon"], 5: ["morning", "afternoon", "evening"], 6: ["morning"] },
    reviews: [],
    photo: null,
  },
];

export const SAMPLE_FEATURED_CLEANERS = SAMPLE_CLEANERS.slice(0, 3);
