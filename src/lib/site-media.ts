import "server-only";
import { createClient } from "@supabase/supabase-js";
import { hasPublicImage } from "./public-image";

/**
 * Site photos the owner manages from Admin → Foto's. Each slot is stored in
 * the public 'site-media' bucket with a pointer row in `site_media`.
 * Without Supabase (or while a slot is empty) we fall back to a file in
 * public/img, and finally to the design placeholder.
 */
export const SITE_MEDIA_SLOTS = [
  "hero-cleaner",
  "business-airbnb",
  "business-hotel",
  "business-restaurant",
  "business-office",
  "business-school",
] as const;
export type SiteMediaSlot = (typeof SITE_MEDIA_SLOTS)[number];

export const SITE_MEDIA_BUCKET = "site-media";

/** Output size per slot (WebP, longest side). Portrait for the hero. */
export const SLOT_SPEC: Record<SiteMediaSlot, { maxWidth: number; aspect: "3/4" | "3/2" }> = {
  "hero-cleaner": { maxWidth: 1200, aspect: "3/4" },
  "business-airbnb": { maxWidth: 1600, aspect: "3/2" },
  "business-hotel": { maxWidth: 1600, aspect: "3/2" },
  "business-restaurant": { maxWidth: 1600, aspect: "3/2" },
  "business-office": { maxWidth: 1600, aspect: "3/2" },
  "business-school": { maxWidth: 1600, aspect: "3/2" },
};

export function isSiteMediaSlot(value: string): value is SiteMediaSlot {
  return (SITE_MEDIA_SLOTS as readonly string[]).includes(value);
}

export type SiteMediaRow = { slot: SiteMediaSlot; path: string; updated_at: string };

export function publicMediaUrl(row: Pick<SiteMediaRow, "path" | "updated_at">): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  const v = encodeURIComponent(new Date(row.updated_at).getTime().toString(36));
  return `${base}/storage/v1/object/public/${SITE_MEDIA_BUCKET}/${row.path}?v=${v}`;
}

/** Anonymous read client (no cookies) so static pages can prerender. */
function anonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** All uploaded slots (empty map when Supabase is not configured). */
export async function listSiteMedia(): Promise<Partial<Record<SiteMediaSlot, SiteMediaRow>>> {
  const supabase = anonClient();
  if (!supabase) return {};
  try {
    const { data, error } = await supabase.from("site_media").select("slot, path, updated_at");
    if (error || !data) return {};
    const out: Partial<Record<SiteMediaSlot, SiteMediaRow>> = {};
    for (const row of data as SiteMediaRow[]) {
      if (isSiteMediaSlot(row.slot)) out[row.slot] = row;
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
