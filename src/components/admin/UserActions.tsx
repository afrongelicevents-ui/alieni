"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { setUserSuspended } from "@/app/[locale]/admin/actions";

/** Suspend or restore one account (two-step for suspending). */
export function UserActions({ userId, suspended, role }: { userId: string; suspended: boolean; role: string }) {
  const t = useTranslations("admin");
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (role === "admin") return <span className="text-xs text-ink/50">—</span>;

  async function run(next: boolean) {
    setBusy(true); setError(null);
    const r = await setUserSuspended(userId, next);
    setBusy(false);
    if (!r.ok) return setError(t(`userError_${r.error ?? "failed"}` as "userError_failed"));
    setAsking(false);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {suspended ? <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-800">{t("userSuspended")}</span> : null}
      {suspended ? (
        <button type="button" disabled={busy} onClick={() => run(false)} className="inline-flex min-h-9 items-center rounded-full border border-forest px-3 text-xs font-bold text-forest disabled:opacity-50">{t("userRestore")}</button>
      ) : asking ? (
        <>
          <span className="text-xs font-semibold text-ink/80">{t("userSuspendConfirm")}</span>
          <button type="button" disabled={busy} onClick={() => run(true)} className="inline-flex min-h-9 items-center rounded-full bg-red-700 px-3 text-xs font-bold text-white disabled:opacity-50">{t("userSuspendYes")}</button>
          <button type="button" onClick={() => setAsking(false)} className="inline-flex min-h-9 items-center rounded-full border border-line px-3 text-xs font-bold text-ink/70">{t("userCancel")}</button>
        </>
      ) : (
        <button type="button" onClick={() => setAsking(true)} className="inline-flex min-h-9 items-center rounded-full border border-red-300 px-3 text-xs font-bold text-red-800">{t("userSuspend")}</button>
      )}
      {error ? <span role="alert" className="text-xs font-semibold text-red-700">{error}</span> : null}
    </div>
  );
}
