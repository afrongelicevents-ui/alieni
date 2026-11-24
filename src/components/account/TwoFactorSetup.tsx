"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { renderSVG } from "uqr";
import { authClient } from "@/lib/auth-client";

const inputCls = "min-h-11 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none";
const btnCls = "inline-flex min-h-12 items-center justify-center rounded-full bg-forest px-6 font-bold text-white hover:bg-forest-dark disabled:opacity-50";

/**
 * Set up two-step login: confirm the password → scan the QR code (or type the key) in an authenticator app →
 * enter a 6-digit code to switch it on → keep the backup codes. All checks happen in Better Auth on the server.
 */
export function TwoFactorSetup({ enabled, next }: { enabled: boolean; next: string }) {
  const t = useTranslations("twoFactor");
  const [step, setStep] = useState<"password" | "scan" | "done">("password");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [uri, setUri] = useState("");
  const [backup, setBackup] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (enabled && step === "password") {
    return (
      <div className="rounded-card-lg border border-line bg-white p-6" data-two-factor="on">
        <p className="rounded-xl bg-mint p-3 text-sm font-semibold text-forest">{t("alreadyOn")}</p>
        <a href={next} className={`mt-4 ${btnCls}`}>{t("continue")}</a>
      </div>
    );
  }

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const { data, error: err } = await authClient.twoFactor.enable({ password });
    setBusy(false);
    if (err || !data || !("totpURI" in data)) return setError(err?.status === 429 ? t("errorRate") : t("errorPassword"));
    setUri(data.totpURI);
    setBackup(data.backupCodes ?? []);
    setStep("scan");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error: err } = await authClient.twoFactor.verifyTotp({ code: code.replace(/\s/g, "") });
    setBusy(false);
    if (err) return setError(err.status === 429 ? t("errorRate") : t("errorCode"));
    setStep("done");
  }

  if (step === "scan") {
    const secret = (() => { try { return new URL(uri).searchParams.get("secret") ?? ""; } catch { return ""; } })();
    return (
      <form onSubmit={verify} className="flex flex-col gap-4 rounded-card-lg border border-line bg-white p-6" data-two-factor="scan">
        <p className="text-sm text-ink/80">{t("scan")}</p>
        {/* QR made locally from the otpauth link (no third-party service sees the secret) */}
        <div className="mx-auto w-52" aria-label={t("qrLabel")} role="img" dangerouslySetInnerHTML={{ __html: renderSVG(uri, { border: 1 }) }} />
        <p className="text-xs text-ink/70">{t("manual")} <code className="break-all rounded bg-section px-1 py-0.5 font-mono text-ink" data-totp-secret>{secret}</code></p>
        <label className="text-sm font-semibold text-ink/80">
          {t("codeLabel")}
          <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required value={code} onChange={(e) => setCode(e.target.value)} className={`mt-1 ${inputCls} tracking-[0.3em]`} />
        </label>
        {error ? <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800" role="alert">{error}</p> : null}
        <button type="submit" disabled={busy} className={btnCls}>{t("turnOn")}</button>
      </form>
    );
  }

  if (step === "done") {
    return (
      <div className="flex flex-col gap-4 rounded-card-lg border border-line bg-white p-6" data-two-factor="done">
        <p className="rounded-xl bg-mint p-3 text-sm font-semibold text-forest">{t("done")}</p>
        {backup.length ? (
          <div>
            <p className="text-sm font-semibold text-ink">{t("backupTitle")}</p>
            <p className="text-xs text-ink/70">{t("backupText")}</p>
            <ul className="mt-2 grid grid-cols-2 gap-1 font-mono text-sm text-ink" data-backup-codes>
              {backup.map((c) => <li key={c} className="rounded bg-section px-2 py-1">{c}</li>)}
            </ul>
          </div>
        ) : null}
        {/* full reload: the server must see that two-step login is now on */}
        <a href={next} className={btnCls}>{t("continue")}</a>
      </div>
    );
  }

  return (
    <form onSubmit={start} className="flex flex-col gap-4 rounded-card-lg border border-line bg-white p-6" data-two-factor="password">
      <label className="text-sm font-semibold text-ink/80">
        {t("passwordLabel")}
        <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={`mt-1 ${inputCls}`} />
      </label>
      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800" role="alert">{error}</p> : null}
      <button type="submit" disabled={busy} className={btnCls}>{t("start")}</button>
    </form>
  );
}
