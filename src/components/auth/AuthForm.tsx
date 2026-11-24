"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { Turnstile } from "./Turnstile";

/**
 * Login / signup form on Better Auth (/api/auth/*). The role chosen at sign-up is only a wish: the server
 * corrects it (admin only via the allow-list). An account with two-step login gets a 6-digit code step.
 * `paused` (Admin → Settings → Sign-ups, pre-launch mode) closes sign-up only; logging in keeps working.
 */
/** Only same-site paths may be used as the post-login destination. */
function safeNext(next: string | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return null;
  return next;
}

type AuthError = { message?: string; code?: string; status?: number } | null | undefined;

export function AuthForm({ mode, defaultRole = "household", next, paused = false }: { mode: "login" | "signup"; defaultRole?: string; next?: string; paused?: boolean }) {
  const t = useTranslations("auth");
  const locale = useLocale();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [role] = useState(defaultRole);
  const [captchaToken, setCaptchaToken] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<"idle" | "busy" | "error" | "sent" | "done" | "code">("idle");
  const [message, setMessage] = useState("");

  const active = !(mode === "signup" && paused);
  const [resent, setResent] = useState(false);
  const fetchOptions = captchaToken ? { headers: { "x-captcha-response": captchaToken } } : undefined;
  const destination = `/${locale}${safeNext(next) ?? "/home"}`;

  /** Map technical messages to plain language (nl/en via messages). */
  function friendlyError(err: AuthError): string {
    const c = (err?.code ?? "").toUpperCase();
    const m = (err?.message ?? "").toLowerCase();
    if (c === "EMAIL_NOT_VERIFIED" || m.includes("not verified") || m.includes("not confirmed")) return t("errNotConfirmed");
    if (c === "INVALID_EMAIL_OR_PASSWORD" || m.includes("invalid email or password")) return t("errBadLogin");
    if (err?.status === 429 || m.includes("too many")) return t("errRateLimit");
    if (c.includes("USER_ALREADY_EXISTS") || m.includes("already exists")) return t("alreadyRegistered");
    if (c === "PASSWORD_TOO_SHORT" || (m.includes("password") && m.includes("short"))) return t("errWeakPassword");
    if (c.includes("INVALID") && (c.includes("CODE") || c.includes("TOTP") || c.includes("OTP"))) return t("errBadCode");
    return t("networkError");
  }

  async function resendConfirmation() {
    if (!email) return;
    const { error } = await authClient.sendVerificationEmail({ email: email.trim().toLowerCase(), callbackURL: `/${locale}/login?confirmed=1` });
    setResent(true);
    if (error) setMessage(friendlyError(error));
  }

  /** Never hang: if the server does not answer within 20s, say so. */
  function withTimeout<T>(p: Promise<T>): Promise<T> {
    return Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 20_000))]);
  }

  function signedIn() {
    setStatus("done");
    // Full reload on purpose: the server must see the fresh session cookie.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload so the server sees the new session state
    window.location.assign(destination);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!active) return;
    setStatus("busy");
    setMessage("");
    try {
      if (mode === "login") {
        const { data, error } = await withTimeout(authClient.signIn.email({ email: email.trim().toLowerCase(), password, fetchOptions }));
        if (error) {
          setStatus("error");
          setMessage(friendlyError(error));
          return;
        }
        if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) {
          setStatus("code");
          return;
        }
        signedIn();
        return;
      }
      // `role` is an extra sign-up field (Better Auth additionalFields); the server corrects it (never admin).
      const body = {
        email: email.trim().toLowerCase(),
        password,
        name: name.trim().slice(0, 80) || t(`defaultName_${role}` as "defaultName_household"),
        role,
        callbackURL: `/${locale}/login?confirmed=1${safeNext(next) ? `&next=${encodeURIComponent(safeNext(next) as string)}` : ""}`,
        fetchOptions,
      };
      const { data, error } = await withTimeout(authClient.signUp.email(body as Parameters<typeof authClient.signUp.email>[0]));
      if (error) {
        setStatus("error");
        setMessage(friendlyError(error));
        return;
      }
      // Signed in straight away (e-mail confirmation off), or: check your inbox.
      if (data && "token" in data && data.token) signedIn();
      else setStatus("sent");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error && err.message === "timeout" ? t("timeout") : t("networkError"));
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    try {
      const { error } = await withTimeout(authClient.twoFactor.verifyTotp({ code: code.replace(/\s/g, ""), trustDevice: false }));
      if (error) {
        setMessage(friendlyError(error));
        return;
      }
      signedIn();
    } catch (err) {
      setMessage(err instanceof Error && err.message === "timeout" ? t("timeout") : t("networkError"));
    }
  }

  const inputCls =
    "min-h-11 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none disabled:bg-section";

  if (status === "code") {
    return (
      <form onSubmit={submitCode} className="rounded-card-lg border border-line bg-white p-6" data-two-factor-step>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ink/80">{t("codeIntro")}</p>
          <label className="text-sm font-semibold text-ink/80">
            {t("codeLabel")}
            <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required value={code} onChange={(e) => setCode(e.target.value)} className={`mt-1 ${inputCls} tracking-[0.3em]`} />
          </label>
          {message ? <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800" role="alert">{message}</p> : null}
          <button type="submit" className="inline-flex min-h-12 items-center justify-center rounded-full bg-forest px-6 font-bold text-white transition-colors hover:bg-forest-dark">
            {t("codeSubmit")}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-card-lg border border-line bg-white p-6">
      {!active ? (
        <p className="mb-4 rounded-xl bg-sun/25 p-3 text-sm font-medium text-ink/80" data-signup-closed="paused">
          {t("signupsPaused")}{" "}
          <Link href="/signup?role=cleaner" className="font-bold text-forest underline">
            {t("cleanerCta")}
          </Link>
        </p>
      ) : null}

      <div className="flex flex-col gap-4">
        {mode === "signup" ? <input type="hidden" name="role" value={role} /> : null}

        {mode === "signup" ? (
          <label className="text-sm font-semibold text-ink/80">
            {t("nameLabel")}
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="given-name" className={`mt-1 ${inputCls}`} />
            <span className="mt-1 block text-xs font-normal text-ink/70">{t("nameHint")}</span>
          </label>
        ) : null}

        <label className="text-sm font-semibold text-ink/80">
          {t("email")}
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required disabled={!active} className={`mt-1 ${inputCls}`} />
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
            maxLength={128}
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
            <a href={destination} className="underline">{t("goToAccount")}</a>
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
