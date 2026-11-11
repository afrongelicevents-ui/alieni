"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { MODULE_KEYS, type ModuleKey, type ModuleState } from "@/lib/site-modules";
import { clearModuleInterest, saveWebsiteModules } from "@/app/[locale]/admin/actions";

/**
 * Admin → Services → Website modules (brief §7). Each future module is either
 * "Coming soon" (tile shows a badge and links to a Notify-me page) or live
 * (tile links to the given same-site path).
 */
export function WebsiteModulesForm({ initial, interest, demo }: { initial: Record<ModuleKey, ModuleState>; interest: Partial<Record<ModuleKey, number>>; demo: boolean }) {
  const t = useTranslations("admin");
  const tm = useTranslations("site.modules");
  const [mods, setMods] = useState(initial);
  const [counts, setCounts] = useState(interest);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const update = (k: ModuleKey, patch: Partial<ModuleState>) => setMods((m) => ({ ...m, [k]: { ...m[k], ...patch } }));

  async function save() {
    if (demo) return;
    setBusy(true);
    setNotice(null);
    const r = await saveWebsiteModules(mods);
    setBusy(false);
    setNotice(r.ok ? t("savedNote") : r.error === "url_required" ? t("webUrlRequired") : r.error === "invalid_url" ? t("webUrlInvalid") : t("actionFailed"));
  }

  async function clear(k: ModuleKey) {
    if (demo || !window.confirm(t("webClearConfirm"))) return;
    const r = await clearModuleInterest(k);
    if (r.ok) setCounts((c) => ({ ...c, [k]: 0 }));
    setNotice(r.ok ? t("savedNote") : t("actionFailed"));
  }

  return (
    <section className="mt-10">
      <h2 className="headline text-xl text-ink">{t("webModulesTitle")}</h2>
      <p className="mt-1 text-sm text-ink/70">{t("webModulesIntro")}</p>
      <ul className="mt-4 space-y-3">
        {MODULE_KEYS.map((k) => (
          <li key={k} className="rounded-card-lg border border-line bg-white p-4" data-module={k}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-3 text-base font-extrabold text-ink">
                <input type="checkbox" checked={mods[k].live} onChange={(e) => update(k, { live: e.target.checked })} className="h-5 w-5 accent-royal" />
                {tm(k)}
                <span className={`rounded-full px-2 py-0.5 text-xs ${mods[k].live ? "bg-mint text-forest" : "bg-section text-ink/70"}`}>{mods[k].live ? t("webLive") : t("webSoon")}</span>
              </label>
              <span className="text-xs text-ink/70">
                {t("webInterest", { count: counts[k] ?? 0 })}
                {(counts[k] ?? 0) > 0 ? (
                  <button type="button" onClick={() => clear(k)} className="ml-2 font-bold text-red-700 underline">{t("webClear")}</button>
                ) : null}
              </span>
            </div>
            <label className="mt-3 block text-xs font-semibold text-ink/80">
              {t("webUrl")}
              <input type="text" value={mods[k].url} onChange={(e) => update(k, { url: e.target.value })} placeholder="/jobs" className="mt-1 min-h-11 w-full rounded-xl border border-line px-3 text-sm" />
            </label>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center gap-3">
        <button type="button" disabled={busy || demo} onClick={save} className="inline-flex min-h-11 items-center rounded-full bg-forest px-6 text-sm font-bold text-white disabled:opacity-50">{t("save")}</button>
        {notice ? <p role="status" className="text-sm font-semibold text-forest">{notice}</p> : null}
      </div>
    </section>
  );
}
