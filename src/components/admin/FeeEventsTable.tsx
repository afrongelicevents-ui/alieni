"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import type { AdminFeeEvent } from "@/lib/admin/data";
import { formatEuro } from "@/lib/money";
import { SERVICE_LABEL, type ServiceKey } from "@/lib/services-shared";
import { waiveFeeEvent } from "@/app/[locale]/admin/actions";

export function FeeEventsTable({ events, demo }: { events: AdminFeeEvent[]; demo: boolean }) {
  const t = useTranslations("admin");
  const tb = useTranslations("business");
  const lang = (useLocale() === "en" ? "en" : "nl") as "nl" | "en";
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const pending = events.filter((e) => e.status === "pending").reduce((a, e) => a + e.amountCents, 0);
  const fmt = (iso: string) => new Date(iso).toLocaleString(lang === "en" ? "en-GB" : "nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  async function waive(id: string) {
    if (demo) return;
    const reason = window.prompt(t("waiveReason")) ?? "";
    setBusy(id);
    setFailed(false);
    const r = await waiveFeeEvent(id, reason);
    setBusy(null);
    if (!r.ok) { setFailed(true); return; }
    router.refresh();
  }

  return (
    <div>
      <h2 className="headline text-xl text-ink">{t("feesTitle")}</h2>
      <p className="mt-1 text-sm text-ink/70">{t("feesIntro")}</p>
      {failed ? <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{t("actionFailed")}</p> : null}
      <div className="mt-3 rounded-card-lg bg-forest p-4 text-white"><p className="text-xs font-semibold text-white/80">{t("feesTotalPending")}</p><p className="text-2xl font-extrabold" data-fees-pending={pending}>{formatEuro(pending, lang)}</p></div>
      <div className="mt-4 overflow-x-auto rounded-card-lg border border-line bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-section text-xs font-semibold uppercase text-ink/70">
            <tr><th className="px-3 py-2">{t("colWhen")}</th><th className="px-3 py-2">{t("colBusiness")}</th><th className="px-3 py-2">{t("colEvent")}</th><th className="px-3 py-2">{t("colService")}</th><th className="px-3 py-2">{t("colModel")}</th><th className="px-3 py-2 text-right">{t("colAmount")}</th><th className="px-3 py-2">{t("colStatus")}</th><th className="px-3 py-2"></th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {events.length === 0 ? <tr><td colSpan={8} className="px-3 py-4 text-ink/70">{t("feesNone")}</td></tr> : events.map((e) => (
              <tr key={e.id} data-fee={e.id}>
                <td className="px-3 py-2 whitespace-nowrap">{fmt(e.occurredAt)}</td>
                <td className="px-3 py-2 font-semibold text-ink">{e.business}</td>
                <td className="px-3 py-2">{tb(`ev_${e.eventType}` as "ev_cover_accepted")}</td>
                <td className="px-3 py-2">{SERVICE_LABEL[e.serviceKey as ServiceKey]?.[lang] ?? e.serviceKey}</td>
                <td className="px-3 py-2">{t(`model_${e.model}` as "model_none")}</td>
                <td className="px-3 py-2 text-right font-bold">{formatEuro(e.amountCents, lang)}</td>
                <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${e.status === "waived" ? "bg-section text-ink/60" : "bg-mint text-forest"}`}>{tb(`fee_${e.status}`)}</span>{e.waivedReason ? <span className="block text-xs text-ink/60">{e.waivedReason}</span> : null}</td>
                <td className="px-3 py-2">{e.status === "pending" ? <button type="button" disabled={busy === e.id || demo} onClick={() => waive(e.id)} className="rounded-full border border-line px-3 py-1 text-xs font-bold text-ink/70">{t("waive")}</button> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
