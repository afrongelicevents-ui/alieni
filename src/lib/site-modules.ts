/**
 * Future website modules behind an admin switch (Admin → Services).
 * While a module is off its tile shows "Coming soon" and links to a
 * "Notify me" page. When on, the tile links to `url` (an internal path).
 */
export const MODULE_KEYS = ["suppliers", "equipment", "careers", "linen"] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];
export type ModuleState = { live: boolean; url: string };

export const DEFAULT_MODULES: Record<ModuleKey, ModuleState> = {
  suppliers: { live: false, url: "" },
  equipment: { live: false, url: "" },
  careers: { live: false, url: "/jobs" },
  linen: { live: false, url: "" },
};

export function isModuleKey(v: string): v is ModuleKey {
  return (MODULE_KEYS as readonly string[]).includes(v);
}

/** Only same-site paths are allowed as module links. */
export function safeModuleUrl(url: unknown): string {
  return typeof url === "string" && /^\/[A-Za-z0-9/_\-?=&#.]*$/.test(url) && !url.startsWith("//") ? url : "";
}

export function parseModules(value: unknown): Record<ModuleKey, ModuleState> {
  const out = { ...DEFAULT_MODULES };
  if (value && typeof value === "object") {
    for (const k of MODULE_KEYS) {
      const v = (value as Record<string, unknown>)[k];
      if (v && typeof v === "object") {
        const url = safeModuleUrl((v as { url?: unknown }).url) || DEFAULT_MODULES[k].url;
        out[k] = { live: Boolean((v as { live?: unknown }).live) && url !== "", url };
      }
    }
  }
  return out;
}

/** Where a module tile links to: the live page, or the "Notify me" page. */
export function moduleHref(key: ModuleKey, state: ModuleState): string {
  return state.live && state.url ? state.url : `/notify/${key}`;
}
