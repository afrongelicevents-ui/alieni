"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { FREQUENCY_LABELS, SPACE_TYPE_LABELS, quoteExpired, scheduleSummary, type QuoteStatus } from "@/lib/jobs";
import { formatHourlyRate } from "@/lib/money";
import { CancelAwardedButton } from "@/components/jobs/JobActions";
import type { MyQuote } from "@/lib/jobs-data";

const TONE: Record<QuoteStatus | "expired" | "ended", string> = { sent: "bg-sun/30 text-ink", accepted: "bg-mint text-forest", declined: "bg-section text-ink/60", expired: "bg-section text-ink/60", ended: "bg-section text-ink/60" };

/** A cleaner's own quotations and what became of them. An accepted job can be cancelled from here. */
export function MyQuotes({ quotes }: { quotes: MyQuote[] }) {
  const t = useTranslations("jobs");
  const lang = (useLocale() === "en" ? "en" : "nl") as "nl" | "en";
  if (quotes.length === 0) {
    return (
      <div className="rounded-card-lg border border-line bg-white p-5 text-sm text-ink/70">
        <p>{t("myQuotesNone")}</p>
        <Link href="/work?tab=jobs" className="mt-2 inline-block font-bold text-forest underline">{t("findJobs")}</Link>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-line rounded-card-lg border border-line bg-white" data-my-quotes>
      {quotes.map((q) => {
        const key: QuoteStatus | "expired" | "ended" = q.status === "accepted" && q.job?.endedAt ? "ended" : q.status === "sent" && (quoteExpired(q.validUntil) || (q.job && q.job.status !== "published")) ? "expired" : q.status;
        return (
          <li key={q.id} className="flex flex-col gap-2 p-4" data-my-quote={q.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-extrabold text-ink">{q.job ? `${SPACE_TYPE_LABELS[q.job.spaceType]?.[lang] ?? q.job.spaceType} · ${FREQUENCY_LABELS[q.job.frequency]?.[lang] ?? q.job.frequency}` : "—"}</p>
                <p className="text-sm text-ink/70">{q.job?.companyName}{q.job?.city ? ` · ${q.job.city}` : ""} · {formatHourlyRate(q.rateCents, lang)}{lang === "nl" ? "/uur" : "/hr"}</p>
                {q.job && scheduleSummary(q.job.frequency, q.job.schedule, lang) ? <p className="text-xs font-semibold text-ink/70">{scheduleSummary(q.job.frequency, q.job.schedule, lang)}</p> : null}
              </div>
              <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${TONE[key]}`}>{t(`myQuote_${key}` as "myQuote_sent")}</span>
            </div>
            {q.status === "accepted" && q.job && !q.job.endedAt ? <CancelAwardedButton jobId={q.jobId} /> : null}
          </li>
        );
      })}
    </ul>
  );
}
