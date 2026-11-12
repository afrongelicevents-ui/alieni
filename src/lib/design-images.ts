/*
 * All photography on the marketing pages, in one place. Real stock photos
 * (Pexels licence: free for commercial use) — credits in design-review/README.md.
 * Swap a file here (or the path) when our own photo shoot is ready.
 * The homepage hero can also be replaced from Admin → Photos.
 */
export const DESIGN_IMAGES = {
  heroCutout: { src: "/img/site/hero-cleaner-cutout.webp", width: 800, height: 858 },
  heroInterior: { src: "/img/site/hero-interior.webp", width: 900, height: 1350 },
  aboutLiving: { src: "/img/site/about-living.webp", width: 640, height: 704 },
  dutchStreet: { src: "/img/site/dutch-street.webp", width: 1400, height: 700 },
  catFindCleaners: { src: "/img/site/cat-find-cleaners.webp", width: 720, height: 360 },
  catJobs: { src: "/img/site/cat-jobs.webp", width: 720, height: 360 },
  catCommercial: { src: "/img/site/cat-commercial.webp", width: 720, height: 360 },
} as const;

export type DesignImageKey = keyof typeof DESIGN_IMAGES;
