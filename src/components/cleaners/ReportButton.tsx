"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { submitReport } from "@/app/[locale]/cleaners/[id]/actions";

/** DSA report flow (brief §6): saved to the `reports` table, admin reviews it. */
const REASONS = ["scam", "inappropriate", "fake", "offensive", "other"] as const;

export function ReportButton({ subjectId, subjectType = "cleaner_profile", compact = false }: { subjectId: string; subjectType?: "cleaner_profile" | "job" | "review" | "message"; compact?: boolean }) {
  const t = useTranslations("profile");
  const pathname = usePathname();
  const sfx = subjectType === "job" ? "Job" : subjectType === "review" ? "Review" : subjectType === "message" ? "Message" : "";
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [reason, setReason] = useState<"scam" | "inappropriate" | "fake" | "offensive" | "other">("scam");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await submitReport({ subjectType, subjectId, reason, details });
    setBusy(false);
    if (result.ok) setSent(true);
    else setError(result.error ?? "failed");
  }

  if (sent) {
    return <p className="rounded-xl bg-mint p-4 text-sm text-forest">{t("reportThanks")}</p>;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={compact ? "inline-flex min-h-9 items-center gap-1 px-1 text-xs font-semibold text-ink/60 underline-offset-2 hover:underline" : "inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-ink/70 underline-offset-2 hover:underline"}
      >
        <svg viewBox="0 0 24 24" className={compact ? "h-3 w-3" : "h-4 w-4"} fill="none" stroke="currentColor" aria-hidden="true">
          <path d="M5 21V4m0 1h13l-2.5 4L18 13H5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {t(`report${sfx}` as "report")}
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="w-full rounded-card-lg border border-line bg-white p-5 text-left">
      <h3 className="text-lg font-extrabold text-ink">{t(`reportTitle${sfx}` as "reportTitle")}</h3>
      <p className="mt-1 text-sm text-ink/70">{t(`reportIntro${sfx}` as "reportIntro")}</p>
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
      {error === "not_signed_in" ? (
        <p className="mt-3 rounded-xl bg-sun/25 p-3 text-sm text-ink/80">
          {t("reportLogin")}{" "}
          <Link href={`/login?next=${encodeURIComponent(pathname)}`} className="font-bold text-forest underline">{t("reportLoginCta")}</Link>
        </p>
      ) : error ? (
        <p className="mt-3 text-sm font-semibold text-red-700">{t(`reportError_${error}` as "reportError_failed")}</p>
      ) : null}
      <div className="mt-4 flex gap-3">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-forest px-6 text-sm font-bold text-white hover:bg-forest-dark disabled:opacity-50"
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
