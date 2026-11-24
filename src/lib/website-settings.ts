import "server-only";
import { setting } from "./server/db";

/**
 * Public website settings stored in the D1 `settings` table (editable by admins): the homepage video URL and the
 * pre-launch switch. Falls back to safe defaults. (Prices shown in copy come from getPublicHouseholdFeeCents in
 * ./site-settings, which stays null while payments are off.)
 */
export type WebsiteSettings = { videoUrl: string | null };

export async function getWebsiteSettings(): Promise<WebsiteSettings> {
  try {
    const video = await setting<unknown>("homepage_video_url", null);
    return { videoUrl: typeof video === "string" && /^https:\/\//.test(video) ? video : null };
  } catch {
    return { videoUrl: null };
  }
}

/**
 * Pre-launch mode (Admin → Settings → Sign-ups): when the `signups_paused` setting is true, the sign-up screens show
 * "we are launching soon" and create no accounts. Logging in keeps working. Missing or unreadable → sign-ups open.
 * NOTE: this closes the screens; the Better Auth sign-up endpoint itself is checked in auth-config (integrator).
 */
export async function getSignupsPaused(): Promise<boolean> {
  try {
    return (await setting<unknown>("signups_paused", false)) === true;
  } catch {
    return false;
  }
}
