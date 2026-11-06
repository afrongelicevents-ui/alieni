"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import type { WorkRecordRow } from "@/lib/business-data";
import { reviewWork } from "@/app/[locale]/business/actions";

const TONE: Record<WorkRecordRow["outcome"], string> = {
  scheduled: "bg-sun/30 text-ink",
  done: "bg-mint text-forest",
  no_show: "bg-red-100 text-red-800",
  cancelled: "bg-section text-ink/60",
  disputed: "bg-red-100 text-red-800",
};

/** Business view of work records: confirm or report a problem (database function checks ownership). */
export function WorkRecords({ records, compact = false }: { records: WorkRecordRow[]; compact?: boolean }) {
  const t = useTranslations("business");
  const lang = (useLocale() === "en" ? "en" : "nl") as "nl" | "en";
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [disputing, setDisputing] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [errorFor, setErrorFor] = useState<string | null>(null);
  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString(lang === "en" ? "en-GB" : "nl-NL", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

  async function send(id: string, ok: boolean) {
    setBusy(id); setError(null); setErrorFor(null);
    const r = await reviewWork(id, ok, ok ? "" : note);
    setBusy(null);
    if (!r.ok) { setError(t(`error_${r.error ?? "failed"}` as "error_failed")); setErrorFor(id); }
    else { setDisputing(null); setNote(""); router.refresh(); }
  }

  if (records.length === 0) return <p className="rounded-card-lg border border-line bg-white p-5 text-sm text-ink/70">{t("workNone")}</p>;
  return (
    <ul className="divide-y divide-line rounded-card-lg border border-line bg-white">
      {records.map((w) => {
        const needsConfirm = w.outcome === "done" && !w.business_confirmed_at;
        return (
          <li key={w.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between" data-work={w.id}>
            <div className="min-w-0">
              <p className="font-extrabold text-ink">{t(`tile_${w.service_key}` as "tile_cover")} · {fmt(w.scheduled_start)}</p>
              <p className="text-sm text-ink/70">
                {w.cleanerName ?? "—"}
                {w.completed_at ? ` · ${fmt(w.completed_at)}` : ""}
                {w.business_confirmed_at ? ` · ${t("confirmedAt", { date: fmt(w.business_confirmed_at) })}` : ""}
                {w.notes ? ` · ${w.notes}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${TONE[w.outcome]}`}>{t(`outcome_${w.outcome}`)}</span>
              {needsConfirm && !compact ? (
                <>
                  <button type="button" disabled={busy === w.id} onClick={() => send(w.id, true)} className="inline-flex min-h-9 items-center rounded-full bg-forest px-4 text-xs font-bold text-white disabled:opacity-50">{t("confirmWork")}</button>
                  <button type="button" disabled={busy === w.id} onClick={() => setDisputing(disputing === w.id ? null : w.id)} className="inline-flex min-h-9 items-center rounded-full border border-line px-4 text-xs font-bold text-ink/80">{t("disputeWork")}</button>
                </>
              ) : null}
            </div>
            {disputing === w.id ? (
              <form className="flex w-full flex-col gap-2 sm:basis-full" onSubmit={(e) => { e.preventDefault(); void send(w.id, false); }}>
                <label className="text-xs font-semibold text-ink/80">{t("disputeNote")}
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} required className="mt-1 min-h-20 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink" />
                </label>
                <button type="submit" disabled={busy === w.id} className="inline-flex min-h-9 items-center self-start rounded-full bg-red-700 px-4 text-xs font-bold text-white disabled:opacity-50">{t("disputeWork")}</button>
              </form>
            ) : null}
            {error && errorFor === w.id ? <p role="alert" className="text-xs font-semibold text-red-700 sm:basis-full">{error}</p> : null}
          </li>
        );
      })}
    </ul>
  );
}
