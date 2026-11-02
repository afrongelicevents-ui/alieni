"use client";

import { useLocale, useTranslations } from "next-intl";
import type { AdminPayment } from "@/lib/admin/sample-admin-data";
import { formatEuro, splitBtw } from "@/lib/money";
import { toCsv } from "@/lib/csv";

export function PaymentsTable({ payments }: { payments: AdminPayment[] }) {
  const t = useTranslations("admin");
  const locale = useLocale() as "nl" | "en";

  function exportCsv() {
    const rows = payments.map((p) => {
      const { netCents, btwCents } = splitBtw(p.amountCents);
      return {
        factuur: p.invoiceNumber ?? "",
        huishouden: p.household,
        schoonmaker: p.cleaner,
        status: p.status,
        datum: p.paidAt ? p.paidAt.slice(0, 10) : "",
        bedrag_excl_btw: (netCents / 100).toFixed(2),
        btw_21: (btwCents / 100).toFixed(2),
        bedrag_incl_btw: (p.amountCents / 100).toFixed(2),
      };
    });
    const blob = new Blob(["﻿" + toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `alieni-betalingen-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="headline text-xl text-ink">{t("tabPayments")}</h2>
        <button
          type="button"
          onClick={exportCsv}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-forest px-5 text-sm font-bold text-white hover:bg-forest-dark"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" aria-hidden="true">
            <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {t("exportCsv")}
        </button>
      </div>

      {payments.length === 0 ? <p className="mt-4 rounded-card bg-mint p-4 text-sm text-forest">{t("paymentsEmpty")}</p> : null}
      <div className="mt-4 overflow-x-auto rounded-card-lg border border-line bg-white">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-section text-xs font-bold text-ink/70">
            <tr>
              <th className="px-4 py-3">{t("colInvoice")}</th>
              <th className="px-4 py-3">{t("colHousehold")}</th>
              <th className="px-4 py-3">{t("colCleaner")}</th>
              <th className="px-4 py-3">{t("colDate")}</th>
              <th className="px-4 py-3">{t("colStatus")}</th>
              <th className="px-4 py-3 text-right">{t("colAmount")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {payments.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-3 font-semibold text-ink">{p.invoiceNumber ?? "—"}</td>
                <td className="px-4 py-3">{p.household}</td>
                <td className="px-4 py-3">{p.cleaner}</td>
                <td className="px-4 py-3">{p.paidAt ? p.paidAt.slice(0, 10) : "—"}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                      p.status === "paid"
                        ? "bg-mint text-forest"
                        : p.status === "pending"
                          ? "bg-sun/30 text-ink"
                          : "bg-section text-ink/70"
                    }`}
                  >
                    {t(`pay_${p.status}` as "pay_paid")}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-semibold">{formatEuro(p.amountCents, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
