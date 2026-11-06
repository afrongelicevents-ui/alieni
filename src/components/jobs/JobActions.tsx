"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { cancelAwardedJob, removeJob } from "@/app/[locale]/jobs/actions";

const btn = "inline-flex min-h-9 items-center rounded-full px-4 text-xs font-bold disabled:opacity-50";

/** Cancel an awarded job (either party). Two steps, so a stray tap does nothing. */
export function CancelAwardedButton({ jobId }: { jobId: string }) {
  const t = useTranslations("jobs");
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true); setError(null);
    const r = await cancelAwardedJob(jobId);
    setBusy(false);
    if (!r.ok) return setError(t(`error_${r.error ?? "failed"}` as "error_failed"));
    setAsking(false);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {asking ? (
        <>
          <span className="text-xs font-semibold text-ink/80">{t("cancelJobConfirm")}</span>
          <button type="button" disabled={busy} onClick={run} className={`${btn} bg-red-700 text-white`}>{t("cancelJobYes")}</button>
          <button type="button" onClick={() => setAsking(false)} className={`${btn} border border-line text-ink/70`}>{t("cancel")}</button>
        </>
      ) : (
        <button type="button" onClick={() => setAsking(true)} className={`${btn} border border-red-300 text-red-800`}>{t("cancelJob")}</button>
      )}
      {error ? <span className="text-xs font-semibold text-red-700" role="alert">{error}</span> : null}
    </div>
  );
}

/** Take a job that is still collecting quotations off the board. */
export function RemoveJobButton({ jobId }: { jobId: string }) {
  const t = useTranslations("jobs");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" disabled={busy} className={`${btn} border border-line text-ink/70`} onClick={async () => { setBusy(true); const r = await removeJob(jobId); setBusy(false); if (r.ok) router.refresh(); }}>
      {t("removeJob")}
    </button>
  );
}
