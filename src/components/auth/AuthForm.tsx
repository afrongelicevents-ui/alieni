"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { Turnstile } from "./Turnstile";

/**
 * Login / signup form. Fully wired to Supabase Auth — until the project
 * keys are configured it shows a friendly "not active yet" state instead.
 */
/** Only same-site paths may be used as the post-login destination. */
function safeNext(next: string | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

export function AuthForm({ mode, defaultRole = "household", next }: { mode: "login" | "signup"; defaultRole?: string; next?: string }) {
  const t = useTranslations("auth");
  const supabase = createClient();
  const locale = useLocale();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role] = useState(defaultRole);
  const [captchaToken, setCaptchaToken] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<"idle" | "busy" | "error" | "sent" | "done">("idle");
  const [message, setMessage] = useState("");

  const active = supabase !== null;
  const [resent, setResent] = useState(false);

  /** Map Supabase's technical messages to plain language (nl/en via messages). */
  function friendlyError(raw: string): string {
    const m = raw.toLowerCase();
    if (m.includes("not confirmed")) return t("errNotConfirmed");
    if (m.includes("invalid login credentials")) return t("errBadLogin");
    if (m.includes("rate limit")) return t("errRateLimit");
    if (m.includes("already registered") || m.includes("already exists")) return t("alreadyRegistered");
    if (m.includes("password") && m.includes("least")) return t("errWeakPassword");
    return raw;
  }

  async function resendConfirmation() {
    if (!supabase || !email) return;
    const { error } = await supabase.auth.resend({ type: "signup", email });
    setResent(true);
    if (error) setMessage(friendlyError(error.message));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setStatus("busy");
    setMessage("");
    try {
      const call =
        mode === "login"
          ? supabase.auth.signInWithPassword({ email, password, options: { captchaToken } })
          : supabase.auth.signUp({
              email,
              password,
              options: { data: { role }, captchaToken, emailRedirectTo: `${window.location.origin}/${locale}/login?confirmed=1` },
            });
      // Never hang: if Supabase does not answer within 20s, say so.
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 20_000),
      );
      const result = await Promise.race([call, timeout]);

      if (result.error) {
        setStatus("error");
        setMessage(friendlyError(result.error.message));
        return;
      }
      if (result.data.session) {
        // Signed in (login, or signup without e-mail confirmation).
        setStatus("done");
        // Full reload on purpose: the server must see the fresh auth cookies.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign(`/${locale}${safeNext(next) ?? "/home"}`);
        return;
      }
      if (mode === "signup" && result.data.user && (result.data.user.identities?.length ?? 1) === 0) {
        // Supabase returns an empty identities list when the e-mail is already registered.
        setStatus("error");
        setMessage(t("alreadyRegistered"));
        return;
      }
      // Signup with e-mail confirmation on: tell them to check their inbox.
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error && err.message === "timeout" ? t("timeout") : t("networkError"));
    }
  }

  const inputCls =
    "min-h-11 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none disabled:bg-section";

  return (
    <form onSubmit={submit} className="rounded-card-lg border border-line bg-white p-6">
      {!active ? (
        <p className="mb-4 rounded-xl bg-sun/25 p-3 text-sm font-medium text-ink/80">
          {t("notActive")}{" "}
          <Link href="/cleaners/new" className="font-bold text-forest underline">
            {t("cleanerCta")}
          </Link>
        </p>
      ) : null}

      <div className="flex flex-col gap-4">
        {mode === "signup" ? <input type="hidden" name="role" value={role} /> : null}

        <label className="text-sm font-semibold text-ink/80">
          {t("email")}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            disabled={!active}
            className={`mt-1 ${inputCls}`}
          />
        </label>

        <label className="text-sm font-semibold text-ink/80">
          {t("password")}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
            minLength={8}
            disabled={!active}
            className={`mt-1 ${inputCls}`}
          />
        </label>

        {mode === "login" ? (
          <p className="-mt-2 text-right text-xs">
            <Link href="/reset-password" className="font-semibold text-forest underline">{t("forgot")}</Link>
          </p>
        ) : null}

        <Turnstile onToken={setCaptchaToken} />

        {status === "error" ? (
          <div className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800">
            <p>{message}</p>
            {message === t("errNotConfirmed") && !resent ? (
              <button type="button" onClick={resendConfirmation} className="mt-2 font-bold text-forest underline">
                {t("resend")}
              </button>
            ) : null}
            {resent ? <p className="mt-2 text-forest">{t("resent")}</p> : null}
          </div>
        ) : null}
        {status === "sent" ? (
          <div className="rounded-xl bg-mint p-3 text-sm font-semibold text-forest">
            <p>{t("checkEmail")}</p>
            <p className="mt-2 font-medium text-ink/80">{t("checkEmailSteps")}</p>
          </div>
        ) : null}
        {status === "done" ? (
          <p className="rounded-xl bg-mint p-3 text-sm font-semibold text-forest">
            {t("redirecting")}{" "}
            <a href={`/${locale}${safeNext(next) ?? "/home"}`} className="underline">{t("goToAccount")}</a>
          </p>
        ) : null}

        <button
          type="submit"
          disabled={!active || status === "busy" || status === "done"}
          className="inline-flex min-h-12 items-center justify-center rounded-full bg-forest px-6 font-bold text-white transition-colors hover:bg-forest-dark disabled:opacity-50"
        >
          {status === "busy" ? t("busy") : mode === "login" ? t("submitLogin") : t("submitSignup")}
        </button>

        <p className="text-center text-sm text-ink/70">
          {mode === "login" ? (
            <>
              {t("noAccount")}{" "}
              <Link href={next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"} className="font-bold text-forest underline">
                {t("signupTitle")}
              </Link>
            </>
          ) : (
            <>
              {t("haveAccount")}{" "}
              <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="font-bold text-forest underline">
                {t("loginTitle")}
              </Link>
            </>
          )}
        </p>
      </div>
    </form>
  );
}
