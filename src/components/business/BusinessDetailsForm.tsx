"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { updateBusinessDetails } from "@/app/[locale]/business/actions";

const inputCls = "mt-1 min-h-11 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none";

/** Edit company name, VAT number and the contact person. */
export function BusinessDetailsForm({ initial }: { initial: { companyName: string; btwNumber: string; firstName: string; lastName: string } }) {
  const t = useTranslations("business");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const r = await updateBusinessDetails(v);
    setBusy(false);
    if (!r.ok) return setError(t(`error_${r.error ?? "failed"}` as "error_failed"));
    setOpen(false);
    router.refresh();
  }

  if (!open) return <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-11 w-full items-center justify-center rounded-full border-2 border-forest px-5 text-sm font-bold text-forest hover:bg-mint sm:w-auto" data-edit-details>{t("editDetails")}</button>;
  return (
    <form onSubmit={save} className="grid w-full gap-3 sm:grid-cols-2" data-details-form>
      <label className="text-xs font-semibold text-ink/80">{t("companyName")}<input className={inputCls} value={v.companyName} maxLength={80} onChange={(e) => setV({ ...v, companyName: e.target.value })} required /></label>
      <label className="text-xs font-semibold text-ink/80">{t("btwNumber")}<input className={inputCls} value={v.btwNumber} maxLength={20} onChange={(e) => setV({ ...v, btwNumber: e.target.value })} /></label>
      <label className="text-xs font-semibold text-ink/80">{t("firstName")}<input className={inputCls} value={v.firstName} maxLength={60} onChange={(e) => setV({ ...v, firstName: e.target.value })} required autoComplete="given-name" /></label>
      <label className="text-xs font-semibold text-ink/80">{t("lastName")}<input className={inputCls} value={v.lastName} maxLength={60} onChange={(e) => setV({ ...v, lastName: e.target.value })} required autoComplete="family-name" /></label>
      {error ? <p role="alert" className="text-xs font-semibold text-red-700 sm:col-span-2">{error}</p> : null}
      <div className="flex gap-2 sm:col-span-2">
        <button type="submit" disabled={busy} className="inline-flex min-h-11 items-center rounded-full bg-forest px-5 text-sm font-bold text-white disabled:opacity-50">{t("save")}</button>
        <button type="button" onClick={() => { setOpen(false); setV(initial); setError(null); }} className="inline-flex min-h-11 items-center rounded-full border border-line px-5 text-sm font-bold text-ink/70">{t("cancelEdit")}</button>
      </div>
    </form>
  );
}
