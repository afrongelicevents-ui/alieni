"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import type { BusinessBundle } from "@/lib/business-data";
import { formatEuro } from "@/lib/money";
import { cancelBusinessBilling } from "@/app/[locale]/business/actions";

/** Invoices (if any exist), CSV export and the cancel-billing button (unchanged behaviour). */
export function BillingPanel({ bundle }: { bundle: BusinessBundle }) {
  const t = useTranslations("business");
  const lang = (useLocale() === "en" ? "en" : "nl") as "nl" | "en";
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { profile, invoices } = bundle;
  async function cancel() {
    setBusy(true); setError(null);
    const r = await cancelBusinessBilling();
    setBusy(false);
    if (!r.ok) { setError(t(`error_${r.error ?? "failed"}` as "error_failed")); return; }
    setConfirming(false);
    router.refresh();
  }
  return (
    <section className="rounded-card-lg border border-line bg-white p-5">
      <h3 className="font-extrabold text-ink">{t("invoicesTitle")}</h3>
      {invoices.length === 0 ? <p className="mt-1 text-sm text-ink/70">{t("invoicesText")}</p> : (
        <ul className="mt-2 divide-y divide-line">
          {invoices.map((inv) => (
            <li key={inv.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="font-semibold text-ink">{inv.number} · {new Date(inv.issued_at).toLocaleDateString(lang === "en" ? "en-GB" : "nl-NL")}</span>
              <span className="flex items-center gap-3"><span className="font-bold text-forest">{formatEuro(inv.gross_cents, lang)}</span><a href={`/api/invoices/${inv.id}/pdf`} className="text-xs font-bold text-forest underline">PDF</a></span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-ink/70">{profile.payment_failed_at ? t("paymentFailed") : profile.billing_ended_at ? t("cancelledNote") : profile.billing_started_at ? t("billingActive") : t("billingNotStarted")}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a href="/api/invoices/export" download className="inline-flex min-h-10 items-center rounded-full bg-section px-4 text-xs font-bold text-forest hover:bg-mint">{t("exportCsv")}</a>
        {profile.billing_started_at && !profile.billing_ended_at && !confirming ? (
          <button type="button" disabled={busy} onClick={() => { setError(null); setConfirming(true); }} className="inline-flex min-h-10 items-center rounded-full border border-line px-4 text-xs font-bold text-ink/80 disabled:opacity-50">{t("cancelBilling")}</button>
        ) : null}
      </div>
      {confirming ? (
        <div role="alertdialog" aria-label={t("cancelBilling")} className="mt-3 rounded-xl border border-line bg-section p-4">
          <p className="text-sm font-semibold text-ink">{t("cancelBillingConfirm")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={cancel} className="inline-flex min-h-10 items-center rounded-full bg-red-700 px-4 text-xs font-bold text-white disabled:opacity-50" data-cancel-billing-confirm>{t("cancelBillingYes")}</button>
            <button type="button" disabled={busy} onClick={() => setConfirming(false)} className="inline-flex min-h-10 items-center rounded-full border border-line bg-white px-4 text-xs font-bold text-ink/80 disabled:opacity-50">{t("cancelBillingKeep")}</button>
          </div>
        </div>
      ) : null}
      {error ? <p role="alert" className="mt-2 text-xs font-semibold text-red-700">{error}</p> : null}
    </section>
  );
}
