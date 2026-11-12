import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Public website settings stored in the `settings` table (readable by anyone, editable by admins):
 * the homepage video URL. Falls back to safe defaults. (Prices shown in copy come from
 * getPublicHouseholdFeeCents in ./site-settings, which stays null while payments are off.)
 */
function anon() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export type WebsiteSettings = { videoUrl: string | null };

export async function getWebsiteSettings(): Promise<WebsiteSettings> {
  const fallback: WebsiteSettings = { videoUrl: null };
  const supabase = anon();
  if (!supabase) return fallback;
  try {
    const { data, error } = await supabase.from("settings").select("value").eq("key", "homepage_video_url").maybeSingle<{ value: unknown }>();
    if (error) return fallback;
    const video = data?.value;
    return { videoUrl: typeof video === "string" && /^https:\/\//.test(video) ? video : null };
  } catch {
    return fallback;
  }
}

/**
 * Pre-launch mode (Admin → Settings → Sign-ups): when the `signups_paused` setting is true, the sign-up screens show
 * "we are launching soon" and create no accounts. Logging in keeps working. Missing or unreadable → sign-ups open.
 */
export async function getSignupsPaused(): Promise<boolean> {
  const supabase = anon();
  if (!supabase) return false;
  try {
    const { data, error } = await supabase.from("settings").select("value").eq("key", "signups_paused").maybeSingle<{ value: unknown }>();
    return !error && data?.value === true;
  } catch {
    return false;
  }
}
