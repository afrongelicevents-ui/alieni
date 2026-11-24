import "server-only";
import { all } from "./server/db";
import { hasPublicImage } from "./public-image";

/**
 * Site photos the owner manages from Admin → Foto's. Each slot's photo is an object in the PRIVATE R2 bucket with a
 * pointer row in `site_media`; the Worker serves it at /api/site-media/<slot> (these are public marketing photos, so
 * no signature is needed, and cached pages keep working). While a slot is empty we fall back to a file in
 * public/img, and finally to the design placeholder.
 */
export const SITE_MEDIA_SLOTS = [
  "hero-cleaner",
  "business-airbnb",
  "business-hotel",
  "business-restaurant",
  "business-office",
] as const;
export type SiteMediaSlot = (typeof SITE_MEDIA_SLOTS)[number];

/** R2 key prefix for site photos (kept for callers that showed the bucket name). */
export const SITE_MEDIA_BUCKET = "site";

/** Output size per slot (WebP, longest side). Portrait for the hero. */
export const SLOT_SPEC: Record<SiteMediaSlot, { maxWidth: number; aspect: "3/4" | "3/2" }> = {
  "hero-cleaner": { maxWidth: 1200, aspect: "3/4" },
  "business-airbnb": { maxWidth: 1600, aspect: "3/2" },
  "business-hotel": { maxWidth: 1600, aspect: "3/2" },
  "business-restaurant": { maxWidth: 1600, aspect: "3/2" },
  "business-office": { maxWidth: 1600, aspect: "3/2" },
};

export function isSiteMediaSlot(value: string): value is SiteMediaSlot {
  return (SITE_MEDIA_SLOTS as readonly string[]).includes(value);
}

export type SiteMediaRow = { slot: SiteMediaSlot; path: string; updated_at: string };

/** URL of an uploaded slot photo, versioned by its upload time so a new photo is never served from cache. */
export function publicMediaUrl(row: Pick<SiteMediaRow, "path" | "updated_at"> & { slot?: string }): string | null {
  const slot = row.slot ?? row.path.split("/")[1];
  if (!slot || !isSiteMediaSlot(slot)) return null;
  const v = encodeURIComponent(new Date(row.updated_at).getTime().toString(36));
  return `/api/site-media/${slot}?v=${v}`;
}

/** All uploaded slots (empty map when none). `path` is the R2 object key. */
export async function listSiteMedia(): Promise<Partial<Record<SiteMediaSlot, SiteMediaRow>>> {
  try {
    const rows = await all<{ slot: string; object_key: string; updated_at: string }>("SELECT slot, object_key, updated_at FROM site_media");
    const out: Partial<Record<SiteMediaSlot, SiteMediaRow>> = {};
    for (const row of rows) {
      if (isSiteMediaSlot(row.slot)) out[row.slot] = { slot: row.slot, path: row.object_key, updated_at: row.updated_at };
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Image URL for a slot: uploaded photo → bundled file in public/img → null
 * (`uploadedOnly`: skip the bundled fallback).
 * Pass a pre-fetched `rows` map when rendering several slots on one page.
 */
export async function siteImageUrl(
  slot: SiteMediaSlot,
  rows?: Partial<Record<SiteMediaSlot, SiteMediaRow>>,
  opts: { uploadedOnly?: boolean } = {},
): Promise<string | null> {
  const map = rows ?? (await listSiteMedia());
  const row = map[slot];
  if (row) {
    const url = publicMediaUrl(row);
    if (url) return url;
  }
  if (opts.uploadedOnly) return null;
  return hasPublicImage(`img/${slot}.webp`) ? `/img/${slot}.webp` : null;
}
