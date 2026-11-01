"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

/**
 * VOG approval queue (brief v2 §7, §10). Admin sees the document (signed
 * URL from the private bucket) and the issue date; after approve/reject
 * the file is deleted by the database trigger — only the outcome remains.
 */
type Item = { id: string; cleaner: string; city: string; issuedAt: string; status: "pending" | "approved" | "rejected" };

const SAMPLE: Item[] = [
  { id: "v1", cleaner: "Lotte B.", city: "Groningen", issuedAt: "2026-10-28", status: "pending" },
  { id: "v2", cleaner: "Maria V.", city: "Utrecht", issuedAt: "2026-06-12", status: "approved" },
  { id: "v3", cleaner: "Youssef K.", city: "Almere", issuedAt: "2024-09-02", status: "pending" },
];

export function VogQueue() {
  const t = useTranslations("admin");
  const [items, setItems] = useState<Item[]>(SAMPLE);
  const setStatus = (id: string, status: Item["status"]) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));

  const maxAgeMonths = 12;
  const tooOld = (issuedAt: string) => {
    const cutoff = new Date();
    cutoff.setUTCMonth(cutoff.getUTCMonth() - maxAgeMonths);
    return new Date(issuedAt) < cutoff;
  };
  const btn = "inline-flex min-h-10 items-center justify-center rounded-full px-4 text-xs font-bold transition-colors";

  return (
    <div>
      <h2 className="headline text-xl text-ink">{t("vogTitle")}</h2>
      <p className="mt-1 text-sm text-ink/70">{t("vogIntro", { months: maxAgeMonths })}</p>
      <ul className="mt-4 space-y-3">
        {items.map((item) => (
          <li key={item.id} className="rounded-card-lg border border-line bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-extrabold text-ink">{item.cleaner} <span className="font-medium text-ink/70">· {item.city}</span></h3>
                <p className="mt-0.5 text-xs text-ink/70">
                  {t("vogIssued")}: {item.issuedAt}
                  {tooOld(item.issuedAt) ? <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 font-bold text-red-800">{t("vogTooOld")}</span> : null}
                </p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${item.status === "pending" ? "bg-sun/30 text-ink" : item.status === "approved" ? "bg-mint text-forest" : "bg-red-100 text-red-800"}`}>
                {t(`vog_${item.status}` as "vog_pending")}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {item.status === "pending" ? (
                <>
                  <button type="button" className={`${btn} border-2 border-line text-ink/70 hover:bg-section`} disabled title={t("vogViewHint")}>{t("vogView")}</button>
                  <button type="button" onClick={() => setStatus(item.id, "approved")} disabled={tooOld(item.issuedAt)} className={`${btn} bg-forest text-white hover:bg-forest-dark disabled:opacity-40`}>{t("vogApprove")}</button>
                  <button type="button" onClick={() => setStatus(item.id, "rejected")} className={`${btn} bg-red-700 text-white hover:bg-red-800`}>{t("vogReject")}</button>
                </>
              ) : (
                <p className="text-xs text-ink/70">{t("vogFileDeleted")}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
