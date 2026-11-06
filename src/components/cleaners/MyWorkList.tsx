"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import type { WorkRecordRow } from "@/lib/business-data";
import { progressWork } from "@/app/[locale]/work/actions";

type Row = WorkRecordRow & { company: string | null; location?: string | null };

/** Cleaner's accepted turnovers / emergency jobs with start + complete buttons. */
export function MyWorkList({ records }: { records: Row[] }) {
  const t = useTranslations("work");
  const tb = useTranslations("business");
  const lang = (useLocale() === "en" ? "en" : "nl") as "nl" | "en";
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString(lang === "en" ? "en-GB" : "nl-NL", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

  async function go(id: string, action: "start" | "complete") {
    setBusy(id);
    setError(null);
    const r = await progressWork(id, action);
    setBusy(null);
    if (!r.ok) {
      const key = `error_${r.error ?? "failed"}` as "error_failed";
      setError(tb.has(key) ? tb(key) : tb("error_failed"));
      return;
    }
    router.refresh();
  }

  if (records.length === 0) return <p className="rounded-card-lg border border-line bg-white p-5 text-sm text-ink/70">{t("mineNone")}</p>;
  return (
    <>
    {error ? <p role="alert" className="mb-2 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p> : null}
    <ul className="divide-y divide-line rounded-card-lg border border-line bg-white">
      {records.map((w) => (
        <li key={w.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between" data-my-work={w.id}>
          <div className="min-w-0">
            <p className="font-extrabold text-ink">{tb(`tile_${w.service_key}` as "tile_cover")} · {fmt(w.scheduled_start)}</p>
            <p className="text-sm text-ink/70">
              {w.company ?? "—"}
              {w.started_at ? ` · ${t("startedAt", { time: fmt(w.started_at) })}` : ""}
              {w.completed_at ? ` · ${t("completedAt", { time: fmt(w.completed_at) })}` : ""}
              {w.business_confirmed_at ? ` · ${t("confirmedByBusiness")}` : ""}
            </p>
            {w.location ? <p className="text-sm font-semibold text-ink/80" data-work-location>📍 {w.location}</p> : null}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${w.outcome === "done" ? "bg-mint text-forest" : w.outcome === "scheduled" ? "bg-sun/30 text-ink" : "bg-section text-ink/60"}`}>{tb(`outcome_${w.outcome}`)}</span>
            {w.outcome === "scheduled" && !w.started_at ? <button type="button" disabled={busy === w.id} onClick={() => go(w.id, "start")} className="inline-flex min-h-9 items-center rounded-full border-2 border-forest px-4 text-xs font-bold text-forest disabled:opacity-50">{t("start")}</button> : null}
            {w.outcome === "scheduled" && !w.completed_at ? <button type="button" disabled={busy === w.id} onClick={() => go(w.id, "complete")} className="inline-flex min-h-9 items-center rounded-full bg-forest px-4 text-xs font-bold text-white disabled:opacity-50">{t("complete")}</button> : null}
          </div>
        </li>
      ))}
    </ul>
    </>
  );
}
