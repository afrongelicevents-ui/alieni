"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import type { VogItem } from "@/lib/admin/data";
import { reviewVog, vogSignedUrl } from "@/app/[locale]/admin/actions";

/**
 * VOG approval queue (brief v2 §7, §10). Admin views the document through a
 * short-lived signed URL; after approve/reject the database trigger deletes
 * the file and only the outcome + issue date remain.
 */
export function VogQueue({ items: initial, demo, maxAgeMonths }: { items: VogItem[]; demo: boolean; maxAgeMonths: number }) {
  const t = useTranslations("admin");
  const router = useRouter();
  const [items, setItems] = useState<VogItem[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function setStatus(id: string, status: "approved" | "rejected") {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
    if (demo) return;
    setBusy(id);
    setError(null);
    const r = await reviewVog(id, status);
    setBusy(null);
    if (!r.ok) setError(t("actionFailed"));
    router.refresh();
  }

  async function view(id: string) {
    setBusy(id);
    const r = await vogSignedUrl(id);
    setBusy(null);
    if (r.ok && r.url) window.open(r.url, "_blank", "noopener");
    else setError(t("vogNoFile"));
  }

  const tooOld = (issuedAt: string) => {
    const cutoff = new Date();
    cutoff.setUTCMonth(cutoff.getUTCMonth() - maxAgeMonths);
    return new Date(issuedAt) < cutoff;
  };
  const btn = "inline-flex min-h-10 items-center justify-center rounded-full px-4 text-xs font-bold transition-colors disabled:opacity-40";

  return (
    <div>
      <h2 className="headline text-xl text-ink">{t("vogTitle")}</h2>
      <p className="mt-1 text-sm text-ink/70">{t("vogIntro", { months: maxAgeMonths })}</p>
      {error ? <p className="mt-2 text-sm font-semibold text-red-700">{error}</p> : null}
      {items.length === 0 ? <p className="mt-4 rounded-card bg-mint p-4 text-sm text-forest">{t("vogEmpty")}</p> : null}
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
                  <button type="button" disabled={demo || !item.hasFile || busy === item.id} onClick={() => view(item.id)} className={`${btn} border-2 border-line text-ink/70 hover:bg-section`} title={item.hasFile ? undefined : t("vogNoFile")}>{t("vogView")}</button>
                  <button type="button" disabled={tooOld(item.issuedAt) || busy === item.id} onClick={() => setStatus(item.id, "approved")} className={`${btn} bg-forest text-white hover:bg-forest-dark`}>{t("vogApprove")}</button>
                  <button type="button" disabled={busy === item.id} onClick={() => setStatus(item.id, "rejected")} className={`${btn} bg-red-700 text-white hover:bg-red-800`}>{t("vogReject")}</button>
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
