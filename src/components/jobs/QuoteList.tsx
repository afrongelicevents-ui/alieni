"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { quoteExpired, visitTotalCents, type QuoteStatus } from "@/lib/jobs";
import { formatEuro, formatHourlyRate } from "@/lib/money";
import { acceptQuote, declineQuote, startConversation } from "@/app/[locale]/jobs/actions";

export type QuoteRow = { id: string; cleanerProfileId: string; name: string; rateCents: number; message: string; status: QuoteStatus; validUntil: string | null };

const TONE: Record<QuoteStatus, string> = { sent: "bg-sun/30 text-ink", accepted: "bg-mint text-forest", declined: "bg-section text-ink/60" };

/** The quotations on one job, for the business that posted it: view, chat, accept (two steps) or decline. */
export function QuoteList({ quotes, visitHours, canDecide }: { quotes: QuoteRow[]; visitHours: number | null; canDecide: boolean }) {
  const t = useTranslations("jobs");
  const lang = (useLocale() === "en" ? "en" : "nl") as "nl" | "en";
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(id: string, action: () => Promise<{ ok: boolean; error?: string; conversationId?: string }>) {
    setBusy(id); setError(null);
    const r = await action();
    setBusy(null); setConfirming(null);
    if (!r.ok) return setError(t(`error_${r.error ?? "failed"}` as "error_failed"));
    if (r.conversationId) return router.push(`/messages/${r.conversationId}`);
    router.refresh();
  }

  if (quotes.length === 0) return <p className="text-sm text-ink/70">{t("noQuotes")}</p>;
  return (
    <div>
      <ul className="divide-y divide-line" data-quotes>
        {quotes.map((q) => {
          const expired = q.status === "sent" && quoteExpired(q.validUntil);
          const perVisit = visitTotalCents(q.rateCents, visitHours);
          return (
            <li key={q.id} className="flex flex-col gap-2 py-3 text-sm" data-quote={q.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <span>
                  <strong className="text-ink">{q.name}</strong> · {formatHourlyRate(q.rateCents, lang)}{lang === "nl" ? "/uur" : "/hr"}
                  {perVisit !== null ? <span className="text-ink/70"> · {t("perVisit", { amount: formatEuro(perVisit, lang), hours: String(visitHours).replace(".", ",") })}</span> : null}
                  <br /><span className="text-ink/70">{q.message}</span>
                  {q.validUntil ? <><br /><span className="text-xs text-ink/60">{expired ? t("quoteExpired") : t("validUntil", { date: new Date(`${q.validUntil}T12:00:00Z`).toLocaleDateString(lang === "en" ? "en-GB" : "nl-NL", { day: "numeric", month: "short", timeZone: "UTC" }) })}</span></> : null}
                </span>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${TONE[q.status]}`}>{t(`quote_${q.status}` as "quote_sent")}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href={`/cleaners/${q.cleanerProfileId}`} className="inline-flex min-h-9 items-center rounded-full border border-forest px-3 text-xs font-bold text-forest">{t("viewProfile")}</Link>
                <button type="button" disabled={busy === q.id} onClick={() => run(q.id, () => startConversation(q.cleanerProfileId))} className="inline-flex min-h-9 items-center rounded-full border border-forest px-3 text-xs font-bold text-forest disabled:opacity-50">{t("message")}</button>
                {canDecide && q.status === "sent" && !expired ? (
                  confirming === q.id ? (
                    <>
                      <span className="inline-flex items-center text-xs font-semibold text-ink/80">{t("acceptConfirm")}</span>
                      <button type="button" disabled={busy === q.id} onClick={() => run(q.id, () => acceptQuote(q.id))} className="inline-flex min-h-9 items-center rounded-full bg-forest px-4 text-xs font-bold text-white disabled:opacity-50">{t("acceptYes")}</button>
                      <button type="button" onClick={() => setConfirming(null)} className="inline-flex min-h-9 items-center rounded-full border border-line px-3 text-xs font-bold text-ink/70">{t("cancel")}</button>
                    </>
                  ) : (
                    <>
                      <button type="button" onClick={() => setConfirming(q.id)} className="inline-flex min-h-9 items-center rounded-full bg-forest px-4 text-xs font-bold text-white">{t("accept")}</button>
                      <button type="button" disabled={busy === q.id} onClick={() => run(q.id, () => declineQuote(q.id))} className="inline-flex min-h-9 items-center rounded-full border border-red-300 px-3 text-xs font-bold text-red-800 disabled:opacity-50">{t("decline")}</button>
                    </>
                  )
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {error ? <p className="mt-2 text-xs font-semibold text-red-700" role="alert">{error}</p> : null}
    </div>
  );
}
