"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { BUSINESS_TYPES } from "@/lib/business";
import type { BusinessBundle } from "@/lib/business-data";
import { addBusinessUnit, updateUnitCount } from "@/app/[locale]/business/actions";

const inputCls = "min-h-11 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none";

/** Unit count + locations (moved from the old dashboard; behaviour unchanged). */
export function UnitsManager({ bundle }: { bundle: BusinessBundle }) {
  const t = useTranslations("business");
  const lang = (useLocale() === "en" ? "en" : "nl") as "nl" | "en";
  const router = useRouter();
  const { profile, units, connectedCleaners } = bundle;
  const cfg = BUSINESS_TYPES[profile.business_type ?? "office"];
  const [count, setCount] = useState(String(profile.pending_unit_count ?? profile.unit_count));
  const [busy, setBusy] = useState(false);
  const [newUnit, setNewUnit] = useState({ name: "", addressLine: "", postcode: "", city: "" });
  const [unitError, setUnitError] = useState<string | null>(null);

  async function saveCount() {
    const n = Math.max(1, Math.min(10000, Math.round(Number(count) || 1)));
    setBusy(true);
    await updateUnitCount(n);
    setBusy(false);
    router.refresh();
  }
  async function addUnit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setUnitError(null);
    const r = await addBusinessUnit(newUnit);
    setBusy(false);
    if (!r.ok) setUnitError(t(`error_${r.error ?? "failed"}` as "error_failed"));
    else { setNewUnit({ name: "", addressLine: "", postcode: "", city: "" }); router.refresh(); }
  }

  return (
    <section>
      <div className="flex flex-wrap items-end gap-2 rounded-card-lg border border-line bg-white p-4">
        <label className="block text-xs font-semibold text-ink/80">
          {t("changeUnits", { units: cfg.unitPlural[lang] })}
          <input id="unit-count" type="number" min={1} max={10000} value={count} onChange={(e) => setCount(e.target.value)} className="mt-1 block w-32 rounded-xl border border-line bg-white px-3 py-2 text-base font-extrabold text-ink" />
        </label>
        <button type="button" onClick={saveCount} disabled={busy} className="inline-flex min-h-10 items-center rounded-full bg-forest px-4 text-xs font-bold text-white disabled:opacity-50">{t("save")}</button>
        {profile.billing_started_at ? <span className="text-xs text-ink/70">{t("unitChangeNote")}</span> : null}
      </div>

      <h3 className="headline mt-6 text-xl text-ink">{t("myUnits", { units: cfg.unitPlural[lang] })}</h3>
      <ul className="mt-3 space-y-2">
        {units.map((u) => (
          <li key={u.id} className="flex items-center justify-between gap-3 rounded-card-lg border border-line bg-white p-4">
            <div className="min-w-0">
              <p className="truncate font-extrabold text-ink">{u.name || u.address_line}</p>
              <p className="truncate text-sm text-ink/70">{u.address_line}, {u.postcode} {u.city}</p>
            </div>
            <span className="shrink-0 rounded-full bg-section px-3 py-1 text-xs font-semibold text-ink/70">
              {connectedCleaners.length ? connectedCleaners.map((c) => c.name).join(", ") : t("noCleanerYet")}
            </span>
          </li>
        ))}
      </ul>
      <form onSubmit={addUnit} className="mt-3 grid gap-2 rounded-card-lg border border-dashed border-line p-4 sm:grid-cols-2">
        <p className="text-sm font-bold text-ink sm:col-span-2">{t("addUnit", { unit: cfg.unit[lang] })}</p>
        <input className={inputCls} placeholder={t("unitName")} value={newUnit.name} onChange={(e) => setNewUnit({ ...newUnit, name: e.target.value })} />
        <input className={inputCls} placeholder={t("addressLine")} value={newUnit.addressLine} onChange={(e) => setNewUnit({ ...newUnit, addressLine: e.target.value })} required />
        <input className={inputCls} placeholder="1012 AB" value={newUnit.postcode} onChange={(e) => setNewUnit({ ...newUnit, postcode: e.target.value })} required />
        <input className={inputCls} placeholder={t("city")} value={newUnit.city} onChange={(e) => setNewUnit({ ...newUnit, city: e.target.value })} required />
        {unitError ? <p className="text-xs font-semibold text-red-700 sm:col-span-2">{unitError}</p> : null}
        <button type="submit" disabled={busy} className="inline-flex min-h-11 items-center justify-center rounded-full border-2 border-forest px-5 text-sm font-bold text-forest hover:bg-mint disabled:opacity-50 sm:col-span-2">{t("addUnitCta")}</button>
      </form>
    </section>
  );
}
