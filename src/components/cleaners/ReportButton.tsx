"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

/**
 * DSA report flow (brief §6). Stores locally until Supabase is connected;
 * the payload shape matches the `reports` table.
 */
const REASONS = ["scam", "inappropriate", "fake", "offensive", "other"] as const;

export function ReportButton({ subjectId }: { subjectId: string }) {
  const t = useTranslations("profile");
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [reason, setReason] = useState<string>("scam");
  const [details, setDetails] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const key = "alieni.reports";
      const existing = JSON.parse(window.localStorage.getItem(key) ?? "[]");
      existing.push({
        subject_type: "cleaner_profile",
        subject_id: subjectId,
        reason,
        details: details.slice(0, 1000),
        created_at: new Date().toISOString(),
      });
      window.localStorage.setItem(key, JSON.stringify(existing));
    } catch {
      // storage unavailable — report is still acknowledged in the UI
    }
    setSent(true);
  }

  if (sent) {
    return <p className="rounded-xl bg-mint p-4 text-sm text-forest">{t("reportThanks")}</p>;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-ink/60 underline-offset-2 hover:underline"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" aria-hidden="true">
          <path d="M5 21V4m0 1h13l-2.5 4L18 13H5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {t("report")}
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-card-lg border border-line bg-white p-5">
      <h3 className="text-lg font-extrabold text-ink">{t("reportTitle")}</h3>
      <p className="mt-1 text-sm text-ink/70">{t("reportIntro")}</p>
      <fieldset className="mt-4 flex flex-col gap-2">
        {REASONS.map((r) => (
          <label key={r} className="flex min-h-11 items-center gap-3 rounded-xl border border-line px-3 text-sm font-medium text-ink has-[:checked]:border-forest has-[:checked]:bg-mint">
            <input
              type="radio"
              name="reason"
              value={r}
              checked={reason === r}
              onChange={() => setReason(r)}
              className="accent-forest"
            />
            {t(`reason${r[0].toUpperCase()}${r.slice(1)}` as "reasonScam")}
          </label>
        ))}
      </fieldset>
      <label className="mt-3 block text-sm font-semibold text-ink/70">
        {t("reportDetails")}
        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          maxLength={1000}
          rows={3}
          className="mt-1 w-full rounded-xl border border-line p-3 text-sm focus:outline-none"
        />
      </label>
      <div className="mt-4 flex gap-3">
        <button
          type="submit"
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-forest px-6 text-sm font-bold text-white hover:bg-forest-dark"
        >
          {t("reportSubmit")}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="inline-flex min-h-11 items-center justify-center rounded-full border-2 border-line px-6 text-sm font-bold text-ink/70"
        >
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}
