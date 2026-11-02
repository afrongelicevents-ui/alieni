"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { BUSINESS_TYPES, BUSINESS_TYPE_KEYS, type BusinessType } from "@/lib/business";
import { SERVICE_LABEL, type CatalogRow } from "@/lib/services-shared";
import { saveServiceCatalog } from "@/app/[locale]/admin/actions";

/** Admin → Services: on/off per service and which sectors it applies to. */
export function ServicesForm({ catalog, demo }: { catalog: CatalogRow[]; demo: boolean }) {
  const t = useTranslations("admin");
  const lang = (useLocale() === "en" ? "en" : "nl") as "nl" | "en";
  const [rows, setRows] = useState(catalog);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function save(row: CatalogRow) {
    if (demo) return;
    setBusy(row.service_key); setNotice(null);
    const r = await saveServiceCatalog(row.service_key, row.enabled, row.business_types);
    setBusy(null);
    setNotice(r.ok ? t("savedNote") : t("actionFailed"));
  }
  const update = (key: string, patch: Partial<CatalogRow>) => setRows((rs) => rs.map((r) => (r.service_key === key ? { ...r, ...patch } : r)));

  return (
    <div>
      <h2 className="headline text-xl text-ink">{t("svcTitle")}</h2>
      <p className="mt-1 text-sm text-ink/70">{t("svcIntro")}</p>
      <ul className="mt-4 space-y-3">
        {rows.map((row) => (
          <li key={row.service_key} className="rounded-card-lg border border-line bg-white p-4" data-service={row.service_key}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-3 text-base font-extrabold text-ink">
                <input type="checkbox" checked={row.enabled} onChange={(e) => update(row.service_key, { enabled: e.target.checked })} className="h-5 w-5 accent-forest" />
                {SERVICE_LABEL[row.service_key][lang]}
                <span className={`rounded-full px-2 py-0.5 text-xs ${row.enabled ? "bg-mint text-forest" : "bg-section text-ink/60"}`}>{row.enabled ? t("svcEnabled") : "—"}</span>
              </label>
              <button type="button" disabled={busy === row.service_key} onClick={() => save(row)} className="inline-flex min-h-9 items-center rounded-full bg-forest px-4 text-xs font-bold text-white disabled:opacity-50">{t("save")}</button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {BUSINESS_TYPE_KEYS.map((bt) => {
                const on = row.business_types.includes(bt);
                return (
                  <button key={bt} type="button" aria-pressed={on} onClick={() => update(row.service_key, { business_types: on ? row.business_types.filter((x) => x !== bt) : [...row.business_types, bt as BusinessType] })}
                    className={`rounded-full border px-3 py-1 text-xs font-bold ${on ? "border-forest bg-mint text-forest" : "border-line bg-white text-ink/70"}`}>
                    {BUSINESS_TYPES[bt].label[lang]}
                  </button>
                );
              })}
              <span className="self-center text-xs text-ink/60">{row.business_types.length === 0 ? t("svcAllTypes") : ""}</span>
            </div>
            <p className="mt-2 text-xs text-ink/60">{t("svcTypesHint")}</p>
          </li>
        ))}
      </ul>
      {notice ? <p role="status" className="mt-3 text-sm font-semibold text-forest">{notice}</p> : null}
    </div>
  );
}
