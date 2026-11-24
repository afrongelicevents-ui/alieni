"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";

const inputCls = "min-h-11 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none disabled:bg-section";

/** Forgot password: request the e-mail; then set a new password from the link (Better Auth reset token). */
export function PasswordReset({ mode, resetToken, resetError }: { mode: "request" | "update"; resetToken?: string | null; resetError?: string | null }) {
  const t = useTranslations("auth");
  const locale = useLocale();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // The e-mailed link (Better Auth) lands on the update page with ?token=… (or ?error=INVALID_TOKEN when it expired).
  const [status, setStatus] = useState<"idle" | "busy" | "sent" | "done" | "error" | "nosession">("idle");
  const [message, setMessage] = useState("");
  const token = resetToken ?? null;
  const linkBroken = mode === "update" && (!token || Boolean(resetError));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("busy");
    setMessage("");
    if (mode === "request") {
      await authClient.requestPasswordReset({ email: email.trim().toLowerCase(), redirectTo: `/${locale}/reset-password/update` }).catch(() => null);
      setStatus("sent"); // always "sent" so e-mail addresses cannot be probed
      return;
    }
    if (!token) return setStatus("nosession");
    const { error } = await authClient.resetPassword({ newPassword: password, token });
    if (error) {
      const c = (error.code ?? "").toUpperCase();
      if (c.includes("TOKEN")) return setStatus("nosession");
      setStatus("error");
      setMessage(c.includes("PASSWORD") ? t("errWeakPassword") : t("networkError"));
      return;
    }
    setStatus("done");
  }

  if (status === "nosession" || linkBroken) {
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
            {t("resetDone")} <Link href="/login" className="underline">{t("loginTitle")}</Link>
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
