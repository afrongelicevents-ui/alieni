"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { deleteAccount } from "@/app/[locale]/account/actions";

/** Download my data, and delete my account (type your e-mail address to confirm). */
export function AccountDanger({ email, isAdmin }: { email: string; isAdmin: boolean }) {
  const t = useTranslations("account");
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true); setError(null);
    const r = await deleteAccount(typed);
    setBusy(false);
    if (!r.ok) return setError(t(`error_${r.error ?? "failed"}` as "error_failed"));
    window.location.assign("/");
  }

  return (
    <section className="mt-6 rounded-card-lg border border-line bg-white p-5" data-account-data>
      <h2 className="font-extrabold text-ink">{t("dataTitle")}</h2>
      <p className="mt-1 text-sm text-ink/70">{t("dataText")}</p>
      <a href="/api/account/export" download className="mt-3 inline-flex min-h-11 items-center rounded-full border-2 border-forest px-5 text-sm font-bold text-forest hover:bg-mint">{t("downloadData")}</a>

      <div className="mt-6 border-t border-line pt-5">
        <h3 className="font-extrabold text-ink">{t("deleteTitle")}</h3>
        {isAdmin ? <p className="mt-1 text-sm text-ink/70">{t("error_admin_cannot")}</p> : (
          <>
            <p className="mt-1 text-sm text-ink/70">{t("deleteText")}</p>
            {open ? (
              <form className="mt-3 flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); void run(); }}>
                <label className="text-sm font-semibold text-ink/80" htmlFor="delete-email">{t("deleteTypeEmail", { email })}</label>
                <input id="delete-email" type="email" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} className="min-h-11 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none" />
                {error ? <p className="text-xs font-semibold text-red-700" role="alert">{error}</p> : null}
                <div className="flex flex-wrap gap-2">
                  <button type="submit" disabled={busy || typed.trim().toLowerCase() !== email.toLowerCase()} className="inline-flex min-h-11 items-center rounded-full bg-red-700 px-5 text-sm font-bold text-white disabled:opacity-40">{t("deleteConfirm")}</button>
                  <button type="button" onClick={() => { setOpen(false); setTyped(""); setError(null); }} className="inline-flex min-h-11 items-center rounded-full border border-line px-5 text-sm font-bold text-ink/70">{t("cancel")}</button>
                </div>
              </form>
            ) : (
              <button type="button" onClick={() => setOpen(true)} className="mt-3 inline-flex min-h-11 items-center rounded-full border border-red-300 px-5 text-sm font-bold text-red-800">{t("deleteStart")}</button>
            )}
          </>
        )}
      </div>
    </section>
  );
}
