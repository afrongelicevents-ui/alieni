"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { FREQUENCY_LABELS, SPACE_TYPE_LABELS, type Frequency, type SpaceType } from "@/lib/jobs";
import { formatHourlyRate } from "@/lib/money";
import { DEFAULT_RATE_FLOOR_CENTS } from "@/lib/validation";
import { removeJob, respondToJob, startConversation } from "@/app/[locale]/jobs/actions";

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
  myResponse: { rateCents: number } | null;
  responses: { id: string; cleanerProfileId: string; name: string; rateCents: number; message: string }[];
};

export type Viewer = { signedIn: boolean; isCleaner: boolean; isBusiness: boolean };

function RespondForm({ jobId, onDone }: { jobId: string; onDone: () => void }) {
  const t = useTranslations("jobs");
  const router = useRouter();
  const [rate, setRate] = useState("17,50");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const cents = Math.round(Number(rate.replace(",", ".")) * 100);
    if (!Number.isFinite(cents) || cents < DEFAULT_RATE_FLOOR_CENTS) return setError(t("rateError"));
    if (!message.trim()) return setError(t("messageError"));
    setBusy(true);
    const r = await respondToJob(jobId, cents, message.trim());
    setBusy(false);
    if (!r.ok) return setError(t(`error_${r.error ?? "failed"}` as "error_failed"));
    onDone();
    router.refresh();
  }

  const inputCls = "min-h-11 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none";

  return (
    <form onSubmit={submit} className="mt-3 rounded-xl bg-section p-4">
      <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
        <label className="text-xs font-semibold text-ink/80">
          {t("rateLabel")}
          <input type="text" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} className={`mt-1 ${inputCls}`} />
        </label>
        <label className="text-xs font-semibold text-ink/80">
          {t("messageLabel")}
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} maxLength={1000} className={`mt-1 ${inputCls}`} />
        </label>
      </div>
      {error ? <p className="mt-2 text-xs font-semibold text-red-700">{error}</p> : null}
      <button type="submit" disabled={busy} className="mt-3 inline-flex min-h-11 items-center justify-center rounded-full bg-sun px-6 text-sm font-bold text-ink hover:bg-sun-dark disabled:opacity-50">
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
  const [busy, setBusy] = useState<string | null>(null);

  async function message(cleanerProfileId: string) {
    setBusy(cleanerProfileId);
    const r = await startConversation(cleanerProfileId);
    setBusy(null);
    if (r.ok && r.conversationId) router.push(`/messages/${r.conversationId}`);
  }

  if (jobs.length === 0) {
    return <p className="mt-6 rounded-card-lg border border-line bg-white p-6 text-center text-ink/70">{t("empty")}</p>;
  }

  return (
    <ul className="mt-6 space-y-4">
      {jobs.map((job) => (
        <li key={job.id} className="rounded-card-lg border border-line bg-white p-5">
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
          {job.scheduleNote ? <p className="mt-1 text-xs text-ink/70">🕐 {job.scheduleNote}</p> : null}
          <p className="mt-2 text-xs text-ink/70">{t("areaNote")}</p>

          {job.mine ? (
            <div className="mt-3 rounded-xl bg-section p-3">
              <p className="text-sm font-bold text-ink">{t("responsesCount", { count: job.responses.length })}</p>
              {job.responses.length ? (
                <ul className="mt-2 divide-y divide-line">
                  {job.responses.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                      <span><strong className="text-ink">{r.name}</strong> · {formatHourlyRate(r.rateCents, lang)}{lang === "nl" ? "/uur" : "/hr"}<br /><span className="text-ink/70">{r.message}</span></span>
                      <span className="flex gap-2">
                        <Link href={`/cleaners/${r.cleanerProfileId}`} className="rounded-full border border-forest px-3 py-1 text-xs font-bold text-forest">{t("viewProfile")}</Link>
                        <button type="button" disabled={busy === r.cleanerProfileId} onClick={() => message(r.cleanerProfileId)} className="rounded-full bg-forest px-3 py-1 text-xs font-bold text-white disabled:opacity-50">{t("message")}</button>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <button type="button" onClick={async () => { await removeJob(job.id); router.refresh(); }} className="mt-2 text-xs font-bold text-ink/60 underline">{t("removeJob")}</button>
            </div>
          ) : job.sample ? null : job.myResponse ? (
            <p className="mt-3 rounded-xl bg-mint p-3 text-sm font-semibold text-forest">{t("sent", { rate: formatHourlyRate(job.myResponse.rateCents, lang) })}</p>
          ) : !viewer.signedIn ? (
            <Link href={`/login?next=/jobs`} className="mt-3 inline-flex min-h-11 items-center justify-center rounded-full border-2 border-forest px-5 text-sm font-bold text-forest hover:bg-mint">{t("loginToRespond")}</Link>
          ) : !viewer.isCleaner ? (
            <Link href="/cleaners/new" className="mt-3 inline-flex min-h-11 items-center justify-center rounded-full border-2 border-forest px-5 text-sm font-bold text-forest hover:bg-mint">{t("needAdToRespond")}</Link>
          ) : openForm === job.id ? (
            <RespondForm jobId={job.id} onDone={() => setOpenForm(null)} />
          ) : (
            <button type="button" onClick={() => setOpenForm(job.id)} className="mt-3 inline-flex min-h-11 items-center justify-center rounded-full border-2 border-forest px-5 text-sm font-bold text-forest hover:bg-mint">
              {t("respond")}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
