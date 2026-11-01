"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { SAMPLE_REPORTS, type AdminReport } from "@/lib/admin/sample-admin-data";

/**
 * "Needs you" queue (brief §8): one-tap hide / remove / dismiss / restore.
 * Every action lands in admin_audit_log in production; the reporter gets a
 * status update (DSA requirement, brief §6).
 */
export function ReportQueue() {
  const t = useTranslations("admin");
  const [reports, setReports] = useState<AdminReport[]>(SAMPLE_REPORTS);

  function setStatus(id: string, status: AdminReport["status"]) {
    setReports((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
  }

  const open = reports.filter((r) => r.status === "open");
  const handled = reports.filter((r) => r.status !== "open");

  const btn =
    "inline-flex min-h-10 items-center justify-center rounded-full px-4 text-xs font-bold transition-colors";

  function card(report: AdminReport) {
    return (
      <li key={report.id} className="rounded-card-lg border border-line bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="font-extrabold text-ink">{report.subject}</h3>
            <p className="mt-0.5 text-xs text-ink/70">
              {t(`reason_${report.reason}` as "reason_scam")} · {report.reporter} ·{" "}
              {new Date(report.createdAt).toLocaleDateString("nl-NL")}
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              report.status === "open"
                ? "bg-sun/30 text-ink"
                : report.status === "removed"
                  ? "bg-red-100 text-red-800"
                  : "bg-section text-ink/70"
            }`}
          >
            {t(`status_${report.status}` as "status_open")}
          </span>
        </div>
        <p className="mt-2 text-sm text-ink/80">{report.details}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {report.status === "open" ? (
            <>
              <button type="button" onClick={() => setStatus(report.id, "hidden")} className={`${btn} bg-forest text-white hover:bg-forest-dark`}>
                {t("actionHide")}
              </button>
              <button type="button" onClick={() => setStatus(report.id, "removed")} className={`${btn} bg-red-700 text-white hover:bg-red-800`}>
                {t("actionRemove")}
              </button>
              <button type="button" onClick={() => setStatus(report.id, "dismissed")} className={`${btn} border-2 border-line text-ink/70 hover:bg-section`}>
                {t("actionDismiss")}
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setStatus(report.id, "open")} className={`${btn} border-2 border-forest text-forest hover:bg-mint`}>
              {t("actionRestore")}
            </button>
          )}
        </div>
      </li>
    );
  }

  return (
    <div>
      <h2 className="headline text-xl text-ink">{t("openReports", { count: open.length })}</h2>
      {open.length === 0 ? (
        <p className="mt-3 rounded-card bg-mint p-4 text-sm text-forest">{t("queueEmpty")}</p>
      ) : (
        <ul className="mt-3 space-y-3">{open.map(card)}</ul>
      )}

      {handled.length > 0 ? (
        <>
          <h2 className="headline mt-8 text-xl text-ink">{t("handledReports")}</h2>
          <ul className="mt-3 space-y-3">{handled.map(card)}</ul>
        </>
      ) : null}

      <p className="mt-6 text-xs text-ink/70">{t("reporterUpdateNote")}</p>
    </div>
  );
}
