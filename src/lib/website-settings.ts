import "server-only";
import { createClient } from "@supabase/supabase-js";
import { MODULE_KEYS, DEFAULT_MODULES, parseModules, type ModuleState } from "./site-modules";

export * from "./site-modules";

/**
 * Public website settings stored in the `settings` table (readable by anyone,
 * editable by admins): which future modules are live and the homepage video URL.
 * Falls back to safe defaults. (Prices shown in copy come from
 * getPublicHouseholdFeeCents in ./site-settings, which stays null while payments are off.)
 */
function anon() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export type WebsiteSettings = {
  modules: Record<(typeof MODULE_KEYS)[number], ModuleState>;
  videoUrl: string | null;
};

export async function getWebsiteSettings(): Promise<WebsiteSettings> {
  const fallback: WebsiteSettings = { modules: DEFAULT_MODULES, videoUrl: null };
  const supabase = anon();
  if (!supabase) return fallback;
  try {
    const { data, error } = await supabase
      .from("settings")
      .select("key, value")
      .in("key", ["website_modules", "homepage_video_url"]);
    if (error || !data) return fallback;
    const map = new Map((data as { key: string; value: unknown }[]).map((r) => [r.key, r.value]));
    const video = map.get("homepage_video_url");
    return {
      modules: parseModules(map.get("website_modules")),
      videoUrl: typeof video === "string" && /^https:\/\//.test(video) ? video : null,
    };
  } catch {
    return fallback;
  }
}
