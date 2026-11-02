"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";

const inputCls = "min-h-11 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none disabled:bg-section";

/** Forgot password: request the e-mail; then set a new password from the link. */
export function PasswordReset({ mode }: { mode: "request" | "update" }) {
  const t = useTranslations("auth");
  const locale = useLocale();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "busy" | "sent" | "done" | "error" | "nosession">("idle");
  const [message, setMessage] = useState("");

  // The recovery link signs the browser in; without that session the form cannot work.
  useEffect(() => {
    if (mode !== "update" || !supabase) return;
    let cancelled = false;
    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (!cancelled && !data.session) {
        // Give the URL-code exchange a moment, then re-check once.
        await new Promise((r) => setTimeout(r, 1500));
        const again = await supabase.auth.getSession();
        if (!cancelled && !again.data.session) setStatus("nosession");
      }
    };
    void check();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, [mode]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setStatus("busy");
    setMessage("");
    if (mode === "request") {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: `${window.location.origin}/${locale}/reset-password/update`,
      });
      if (error && !/rate limit/i.test(error.message)) {
        setStatus("error");
        setMessage(error.message);
        return;
      }
      setStatus("sent"); // always "sent" so e-mail addresses cannot be probed
      return;
    }
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setStatus("error");
      setMessage(/least/i.test(error.message) ? t("errWeakPassword") : error.message);
      return;
    }
    setStatus("done");
  }

  if (!supabase) return <p className="rounded-xl bg-sun/25 p-3 text-sm text-ink/80">{t("notActive")}</p>;

  if (status === "nosession") {
    return (
      <div className="rounded-card-lg border border-line bg-white p-6">
        <p className="text-sm text-ink/80">{t("resetLinkInvalid")}</p>
        <Link href="/reset-password" className="mt-3 inline-block font-bold text-forest underline">{t("resetAgain")}</Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-card-lg border border-line bg-white p-6">
      <div className="flex flex-col gap-4">
        {mode === "request" ? (
          <label className="text-sm font-semibold text-ink/80">
            {t("email")}
            <input id="reset-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required disabled={status === "busy" || status === "sent"} className={`mt-1 ${inputCls}`} />
          </label>
        ) : (
          <label className="text-sm font-semibold text-ink/80">
            {t("newPassword")}
            <input id="new-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required minLength={8} disabled={status === "busy" || status === "done"} className={`mt-1 ${inputCls}`} />
          </label>
        )}

        {status === "error" ? <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800">{message}</p> : null}
        {status === "sent" ? <p className="rounded-xl bg-mint p-3 text-sm font-semibold text-forest">{t("resetSent")}</p> : null}
        {status === "done" ? (
          <p className="rounded-xl bg-mint p-3 text-sm font-semibold text-forest">
            {t("resetDone")} <Link href="/account" className="underline">{t("goToAccount")}</Link>
          </p>
        ) : null}

        <button type="submit" disabled={status === "busy" || status === "sent" || status === "done"} className="inline-flex min-h-12 items-center justify-center rounded-full bg-forest px-6 font-bold text-white hover:bg-forest-dark disabled:opacity-50">
          {status === "busy" ? t("busy") : mode === "request" ? t("resetSubmit") : t("resetSave")}
        </button>
        {mode === "request" ? (
          <p className="text-center text-sm text-ink/70">
            <Link href="/login" className="font-bold text-forest underline">{t("loginTitle")}</Link>
          </p>
        ) : null}
      </div>
    </form>
  );
}
