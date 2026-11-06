"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { BUSINESS_TYPES } from "@/lib/business";
import type { BusinessBundle } from "@/lib/business-data";
import { addBusinessUnit, removeBusinessUnit, updateBusinessUnit, updateUnitCount } from "@/app/[locale]/business/actions";

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
  const [countError, setCountError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState({ name: "", addressLine: "", postcode: "", city: "" });
  const [removing, setRemoving] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  async function saveUnit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setBusy(true); setRowError(null);
    const r = await updateBusinessUnit(editing, edit);
    setBusy(false);
    if (!r.ok) return setRowError(t(`error_${r.error ?? "failed"}` as "error_failed"));
    setEditing(null);
    router.refresh();
  }
  async function removeUnit(id: string) {
    setBusy(true); setRowError(null);
    const r = await removeBusinessUnit(id);
    setBusy(false);
    if (!r.ok) return setRowError(t(`error_${r.error ?? "failed"}` as "error_failed"));
    setRemoving(null);
    router.refresh();
  }

  async function saveCount() {
    const n = Math.max(1, Math.min(10000, Math.round(Number(count) || 1)));
    setBusy(true); setCountError(null);
    const r = await updateUnitCount(n);
    setBusy(false);
    if (!r.ok) { setCountError(t(`error_${r.error ?? "failed"}` as "error_failed")); return; }
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
        {countError ? <p role="alert" className="w-full text-xs font-semibold text-red-700">{countError}</p> : null}
      </div>

      <h3 className="headline mt-6 text-xl text-ink">{t("myUnits", { units: cfg.unitPlural[lang] })}</h3>
      <p className="mt-1 text-xs text-ink/70" data-connected-note>{connectedCleaners.length ? t("connectedCleanersNote", { names: connectedCleaners.map((c) => c.name).join(", ") }) : t("noCleanerYet")}</p>
      <ul className="mt-3 space-y-2">
        {units.map((u) => (
          <li key={u.id} className="rounded-card-lg border border-line bg-white p-4" data-unit={u.id}>
            {editing === u.id ? (
              <form onSubmit={saveUnit} className="grid gap-2 sm:grid-cols-2">
                <input className={inputCls} aria-label={t("unitName")} placeholder={t("unitName")} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
                <input className={inputCls} aria-label={t("addressLine")} placeholder={t("addressLine")} value={edit.addressLine} onChange={(e) => setEdit({ ...edit, addressLine: e.target.value })} required />
                <input className={inputCls} aria-label="1012 AB" placeholder="1012 AB" value={edit.postcode} onChange={(e) => setEdit({ ...edit, postcode: e.target.value })} required />
                <input className={inputCls} aria-label={t("city")} placeholder={t("city")} value={edit.city} onChange={(e) => setEdit({ ...edit, city: e.target.value })} required />
                <div className="flex gap-2 sm:col-span-2">
                  <button type="submit" disabled={busy} className="inline-flex min-h-10 items-center rounded-full bg-forest px-4 text-xs font-bold text-white disabled:opacity-50">{t("save")}</button>
                  <button type="button" onClick={() => { setEditing(null); setRowError(null); }} className="inline-flex min-h-10 items-center rounded-full border border-line px-4 text-xs font-bold text-ink/70">{t("cancelEdit")}</button>
                </div>
              </form>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-extrabold text-ink">{u.name || u.address_line}</p>
                  <p className="truncate text-sm text-ink/70">{u.address_line}, {u.postcode} {u.city}</p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <button type="button" onClick={() => { setEditing(u.id); setEdit({ name: u.name ?? "", addressLine: u.address_line, postcode: u.postcode, city: u.city }); setRowError(null); }} className="inline-flex min-h-9 items-center rounded-full border border-forest px-3 text-xs font-bold text-forest">{t("editUnit")}</button>
                  {removing === u.id ? (
                    <>
                      <span className="text-xs font-semibold text-ink/80">{t("removeUnitConfirm")}</span>
                      <button type="button" disabled={busy} onClick={() => removeUnit(u.id)} className="inline-flex min-h-9 items-center rounded-full bg-red-700 px-3 text-xs font-bold text-white disabled:opacity-50">{t("removeUnitYes")}</button>
                      <button type="button" onClick={() => setRemoving(null)} className="inline-flex min-h-9 items-center rounded-full border border-line px-3 text-xs font-bold text-ink/70">{t("cancelEdit")}</button>
                    </>
                  ) : (
                    <button type="button" onClick={() => { setRemoving(u.id); setRowError(null); }} className="inline-flex min-h-9 items-center rounded-full border border-red-300 px-3 text-xs font-bold text-red-800">{t("removeUnit")}</button>
                  )}
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      {rowError ? <p role="alert" className="mt-2 text-xs font-semibold text-red-700">{rowError}</p> : null}
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
