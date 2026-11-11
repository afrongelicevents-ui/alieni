import "server-only";
import { createClient } from "@supabase/supabase-js";
import { MODULE_KEYS, DEFAULT_MODULES, parseModules, type ModuleState } from "./site-modules";

export * from "./site-modules";

/**
 * Public website settings stored in the `settings` table (readable by anyone,
 * editable by admins): which future modules are live, the homepage video URL,
 * and the household fee shown in copy. Falls back to safe defaults.
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
  householdFeeCents: number;
};

export async function getWebsiteSettings(): Promise<WebsiteSettings> {
  const fallback: WebsiteSettings = { modules: DEFAULT_MODULES, videoUrl: null, householdFeeCents: 1495 };
  const supabase = anon();
  if (!supabase) return fallback;
  try {
    const { data, error } = await supabase
      .from("settings")
      .select("key, value")
      .in("key", ["website_modules", "homepage_video_url", "household_fee_cents"]);
    if (error || !data) return fallback;
    const map = new Map((data as { key: string; value: unknown }[]).map((r) => [r.key, r.value]));
    const video = map.get("homepage_video_url");
    const fee = map.get("household_fee_cents");
    return {
      modules: parseModules(map.get("website_modules")),
      videoUrl: typeof video === "string" && /^https:\/\//.test(video) ? video : null,
      householdFeeCents: typeof fee === "number" && fee > 0 ? fee : 1495,
    };
  } catch {
    return fallback;
  }
}
