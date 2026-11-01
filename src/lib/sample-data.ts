/**
 * SAMPLE DATA — clearly labelled placeholder content used while the
 * Supabase integration is not yet connected (brief §12). The homepage
 * shows a "sample data" notice whenever this is rendered.
 */

export type SampleCleaner = {
  id: string;
  name: string;
  city: string;
  rateCents: number;
  rating: number;
  reviewCount: number;
  services: string[];
  photo: string | null;
};

export const SAMPLE_FEATURED_CLEANERS: SampleCleaner[] = [
  {
    id: "sample-1",
    name: "Sandra M.",
    city: "Amsterdam",
    rateCents: 1800,
    rating: 4.9,
    reviewCount: 120,
    services: ["regular", "deep"],
    photo: null,
  },
  {
    id: "sample-2",
    name: "Kofi A.",
    city: "Rotterdam",
    rateCents: 1750,
    rating: 4.8,
    reviewCount: 86,
    services: ["regular", "windows"],
    photo: null,
  },
  {
    id: "sample-3",
    name: "Maria V.",
    city: "Utrecht",
    rateCents: 2000,
    rating: 5.0,
    reviewCount: 64,
    services: ["deep", "move-out"],
    photo: null,
  },
];

export const SERVICE_LABELS: Record<string, { nl: string; en: string }> = {
  regular: { nl: "Regulier schoonmaken", en: "Regular cleaning" },
  deep: { nl: "Dieptereiniging", en: "Deep cleaning" },
  windows: { nl: "Ramen", en: "Windows" },
  "move-out": { nl: "Verhuisschoonmaak", en: "Move-out cleaning" },
};
