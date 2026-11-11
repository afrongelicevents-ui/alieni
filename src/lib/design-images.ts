/*
 * All photography used by the redesigned marketing pages, in one place.
 * These are TEMPORARY assets cut from the design reference images; replace
 * the files (or the paths here) with our own photo shoot later.
 */
export const DESIGN_IMAGES = {
  heroCutout: { src: "/img/design/hero-cleaner-cutout.webp", width: 800, height: 896 },
  heroInterior: { src: "/img/design/hero-interior.webp", width: 900, height: 1341 },
  aboutLiving: { src: "/img/design/about-living.webp", width: 600, height: 660 },
  catFindCleaners: { src: "/img/design/cat-find-cleaners.webp", width: 348, height: 174 },
  catCompanies: { src: "/img/design/cat-companies.webp", width: 350, height: 174 },
  catSuppliers: { src: "/img/design/cat-suppliers.webp", width: 350, height: 174 },
  catLinen: { src: "/img/design/cat-linen.webp", width: 348, height: 170 },
  catJobs: { src: "/img/design/cat-jobs.webp", width: 350, height: 170 },
  catCommercial: { src: "/img/design/cat-commercial.webp", width: 350, height: 170 },
} as const;

export type DesignImageKey = keyof typeof DESIGN_IMAGES;
