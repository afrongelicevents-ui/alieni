"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { FREQUENCY_LABELS, SAMPLE_JOBS, SPACE_TYPE_LABELS, type Frequency, type SpaceType } from "@/lib/jobs";
import { useJobsStore } from "@/lib/jobs-store";
import { formatHourlyRate } from "@/lib/money";
import { DEFAULT_RATE_FLOOR_CENTS } from "@/lib/validation";

type BoardJob = {
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
};

function RespondForm({ jobId, onDone }: { jobId: string; onDone: () => void }) {
  const t = useTranslations("jobs");
  const { respond } = useJobsStore();
  const [rate, setRate] = useState("17,50");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const cents = Math.round(Number(rate.replace(",", ".")) * 100);
    if (!Number.isFinite(cents) || cents < DEFAULT_RATE_FLOOR_CENTS) {
      setError(t("rateError"));
      return;
    }
    if (!message.trim()) {
      setError(t("messageError"));
      return;
    }
    respond(jobId, cents, message.trim());
    onDone();
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
      <button
        type="submit"
        className="mt-3 inline-flex min-h-11 items-center justify-center rounded-full bg-sun px-6 text-sm font-bold text-ink hover:bg-sun-dark"
      >
        {t("send")}
      </button>
    </form>
  );
}

export function JobsBoard() {
  const t = useTranslations("jobs");
  const lang = (useLocale() === "en" ? "en" : "nl") as "nl" | "en";
  const { postedJobs, responses, hydrated } = useJobsStore();
  const [openForm, setOpenForm] = useState<string | null>(null);

  if (!hydrated) return null;

  const jobs: BoardJob[] = [
    ...postedJobs.map((j) => ({ ...j, mine: true })),
    ...SAMPLE_JOBS.map((j) => ({
      ...j,
      scheduleNote: j.scheduleNote?.[lang] ?? null,
      description: j.description[lang],
      mine: false,
    })),
  ];

  return (
    <ul className="mt-6 space-y-4">
      {jobs.map((job) => {
        const responded = responses[job.id];
        return (
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
                {job.mine ? (
                  <span className="rounded-full bg-sun/30 px-2.5 py-0.5 text-xs font-bold text-ink/80">{t("myJobBadge")}</span>
                ) : null}
              </div>
            </div>

            <p className="mt-2 text-sm text-ink/80">{job.description}</p>
            {job.scheduleNote ? <p className="mt-1 text-xs text-ink/70">🕐 {job.scheduleNote}</p> : null}
            <p className="mt-2 text-xs text-ink/70">{t("areaNote")}</p>

            {!job.mine ? (
              responded ? (
                <p className="mt-3 rounded-xl bg-mint p-3 text-sm font-semibold text-forest">
                  {t("sent", { rate: formatHourlyRate(responded.rateCents, lang) })}
                </p>
              ) : openForm === job.id ? (
                <RespondForm jobId={job.id} onDone={() => setOpenForm(null)} />
              ) : (
                <button
                  type="button"
                  onClick={() => setOpenForm(job.id)}
                  className="mt-3 inline-flex min-h-11 items-center justify-center rounded-full border-2 border-forest px-5 text-sm font-bold text-forest hover:bg-mint"
                >
                  {t("respond")}
                </button>
              )
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
