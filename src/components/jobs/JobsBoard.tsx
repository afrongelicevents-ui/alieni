"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { FREQUENCY_LABELS, SPACE_TYPE_LABELS, quoteExpired, scheduleSummary, visitTotalCents, type Frequency, type JobSchedule, type QuoteStatus, type SpaceType } from "@/lib/jobs";
import { formatEuro, formatHourlyRate } from "@/lib/money";
import { QuoteList } from "./QuoteList";
import { ReportButton } from "@/components/cleaners/ReportButton";
import { DEFAULT_RATE_FLOOR_CENTS } from "@/lib/validation";
import { removeJob, respondToJob } from "@/app/[locale]/jobs/actions";

export type BoardJob = {
  id: string;
  companyName: string;
  spaceType: SpaceType;
  sizeM2: number | null;
  postcode: string;
  city: string;
  frequency: Frequency;
  scheduleNote: string | null;
  description: string;
  budgetCents: number;
  mine: boolean;
  sample: boolean;
  schedule: JobSchedule;
  myResponse: { rateCents: number; status: QuoteStatus; validUntil: string | null } | null;
  responses: { id: string; cleanerProfileId: string; name: string; rateCents: number; message: string; status: QuoteStatus; validUntil: string | null }[];
};

export type Viewer = { signedIn: boolean; isCleaner: boolean; isBusiness: boolean };

function RespondForm({ jobId, visitHours, onDone }: { jobId: string; visitHours: number | null; onDone: () => void }) {
  const t = useTranslations("jobs");
  const router = useRouter();
  const [rate, setRate] = useState("17,50");
  const [message, setMessage] = useState("");
  const [limits] = useState(() => ({ min: new Date().toISOString().slice(0, 10), def: new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10), max: new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10) }));
  const [validUntil, setValidUntil] = useState(limits.def);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lang = (useLocale() === "en" ? "en" : "nl") as "nl" | "en";
  const rateCents = Math.round(Number(rate.replace(",", ".")) * 100);
  const perVisit = Number.isFinite(rateCents) ? visitTotalCents(rateCents, visitHours) : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const cents = Math.round(Number(rate.replace(",", ".")) * 100);
    if (!Number.isFinite(cents) || cents < DEFAULT_RATE_FLOOR_CENTS) return setError(t("rateError"));
    if (!message.trim()) return setError(t("messageError"));
    setBusy(true);
    const r = await respondToJob(jobId, cents, message.trim(), validUntil || null);
    setBusy(false);
    if (!r.ok) return setError(t(`error_${r.error ?? "failed"}` as "error_failed"));
    onDone();
    router.refresh();
  }

  const inputCls = "min-h-11 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none";

  return (
    <form onSubmit={submit} className="mt-3 rounded-xl bg-section p-4">
      <div className="grid gap-3 sm:grid-cols-[120px_1fr_150px]">
        <label className="text-xs font-semibold text-ink/80">
          {t("rateLabel")}
          <input type="text" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} className={`mt-1 ${inputCls}`} />
        </label>
        <label className="text-xs font-semibold text-ink/80">
          {t("messageLabel")}
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} maxLength={1000} className={`mt-1 ${inputCls}`} />
        </label>
        <label className="text-xs font-semibold text-ink/80">
          {t("validUntilLabel")}
          <input type="date" value={validUntil} min={limits.min} max={limits.max} onChange={(e) => setValidUntil(e.target.value)} className={`mt-1 ${inputCls}`} />
        </label>
      </div>
      {perVisit !== null ? <p className="mt-2 text-xs font-semibold text-ink/80">{t("perVisit", { amount: formatEuro(perVisit, lang), hours: String(visitHours).replace(".", ",") })}</p> : null}
      {error ? <p className="mt-2 text-xs font-semibold text-red-700">{error}</p> : null}
      <button type="submit" disabled={busy} className="mt-3 inline-flex min-h-11 items-center justify-center rounded-full bg-sun px-6 text-sm font-bold text-white hover:bg-sun-dark disabled:opacity-50">
        {t("send")}
      </button>
    </form>
  );
}

export function JobsBoard({ jobs, viewer }: { jobs: BoardJob[]; viewer: Viewer }) {
  const t = useTranslations("jobs");
  const lang = (useLocale() === "en" ? "en" : "nl") as "nl" | "en";
  const router = useRouter();
  const [openForm, setOpenForm] = useState<string | null>(null);

  if (jobs.length === 0) {
    return <p className="mt-6 rounded-card-lg border border-line bg-white p-6 text-center text-ink/70">{t("empty")}</p>;
  }

  return (
    <ul className="mt-6 space-y-4">
      {jobs.map((job) => (
        <li key={job.id} data-board-job={job.id} className="rounded-card-lg border border-line bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-lg font-extrabold text-ink">
                {SPACE_TYPE_LABELS[job.spaceType][lang]}
                {job.sizeM2 ? <span className="font-semibold text-ink/70"> · {job.sizeM2} m²</span> : null}
              </h2>
              <p className="text-sm text-ink/70">
                {job.companyName} · {job.city} ({job.postcode.slice(0, 4)}) · {FREQUENCY_LABELS[job.frequency][lang]}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="rounded-full bg-mint px-3 py-1 text-sm font-extrabold text-forest">
                {formatHourlyRate(job.budgetCents, lang)}
                <span className="font-medium text-ink/70">{lang === "nl" ? "/uur" : "/hr"}</span>
              </span>
              {job.mine ? <span className="rounded-full bg-sun/30 px-2.5 py-0.5 text-xs font-bold text-ink/80">{t("myJob")}</span> : null}
              {job.sample ? <span className="rounded-full bg-section px-2.5 py-0.5 text-xs font-bold text-ink/60">{t("sampleJob")}</span> : null}
            </div>
          </div>

          <p className="mt-2 text-sm text-ink/80">{job.description}</p>
          {scheduleSummary(job.frequency, job.schedule, lang) ? <p className="mt-1 text-xs font-semibold text-ink/80">🕐 {scheduleSummary(job.frequency, job.schedule, lang)}</p> : null}
          {job.scheduleNote ? <p className="mt-1 text-xs text-ink/70">{job.scheduleNote}</p> : null}
          <p className="mt-2 text-xs text-ink/70">{t("areaNote")}</p>

          {job.mine ? (
            <div className="mt-3 rounded-xl bg-section p-3">
              <p className="text-sm font-bold text-ink">{t("responsesCount", { count: job.responses.length })}</p>
              <div className="mt-2"><QuoteList quotes={job.responses} visitHours={job.schedule.visitHours} canDecide /></div>
              <button type="button" onClick={async () => { const r = await removeJob(job.id); if (r.ok) router.refresh(); }} className="mt-2 text-xs font-bold text-ink/60 underline">{t("removeJob")}</button>
            </div>
          ) : job.sample ? null : job.myResponse ? (
            <p className="mt-3 rounded-xl bg-mint p-3 text-sm font-semibold text-forest">{t("sent", { rate: formatHourlyRate(job.myResponse.rateCents, lang) })}{job.myResponse.validUntil ? ` ${t("validUntil", { date: new Date(`${job.myResponse.validUntil}T12:00:00Z`).toLocaleDateString(lang === "en" ? "en-GB" : "nl-NL", { day: "numeric", month: "short", timeZone: "UTC" }) })}` : ""}</p>
          ) : !viewer.signedIn ? (
            <Link href={`/login?next=/jobs`} className="mt-3 inline-flex min-h-11 items-center justify-center rounded-full border-2 border-forest px-5 text-sm font-bold text-forest hover:bg-mint">{t("loginToRespond")}</Link>
          ) : !viewer.isCleaner ? null /* only cleaners respond; businesses and admins see no button */ : openForm === job.id ? (
            <RespondForm jobId={job.id} visitHours={job.schedule.visitHours} onDone={() => setOpenForm(null)} />
          ) : (
            <button type="button" onClick={() => setOpenForm(job.id)} className="mt-3 inline-flex min-h-11 items-center justify-center rounded-full border-2 border-forest px-5 text-sm font-bold text-forest hover:bg-mint">
              {t("respond")}
            </button>
          )}
          {!job.mine && !job.sample && viewer.signedIn ? <div className="mt-3 border-t border-line pt-2"><ReportButton subjectId={job.id} subjectType="job" /></div> : null}
        </li>
      ))}
    </ul>
  );
}
