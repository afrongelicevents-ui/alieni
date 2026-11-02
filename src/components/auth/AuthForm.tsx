"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { Turnstile } from "./Turnstile";

/**
 * Login / signup form. Fully wired to Supabase Auth — until the project
 * keys are configured it shows a friendly "not active yet" state instead.
 */
export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const t = useTranslations("auth");
  const supabase = createClient();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("household");
  const [captchaToken, setCaptchaToken] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<"idle" | "busy" | "error" | "sent" | "done">("idle");
  const [message, setMessage] = useState("");

  const active = supabase !== null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setStatus("busy");
    const result =
      mode === "login"
        ? await supabase.auth.signInWithPassword({ email, password, options: { captchaToken } })
        : await supabase.auth.signUp({ email, password, options: { data: { role }, captchaToken } });
    if (result.error) {
      setStatus("error");
      setMessage(result.error.message);
    } else if (result.data.session) {
      // Signed in (login, or signup without e-mail confirmation): go to the account page.
      setStatus("done");
      router.push("/account");
      router.refresh();
    } else {
      // Signup with e-mail confirmation on: tell them to check their inbox.
      setStatus("sent");
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
        {mode === "signup" ? (
          <label className="text-sm font-semibold text-ink/80">
            {t("roleLabel")}
            <select value={role} onChange={(e) => setRole(e.target.value)} disabled={!active} className={`mt-1 ${inputCls}`}>
              <option value="household">{t("roleHousehold")}</option>
              <option value="cleaner">{t("roleCleaner")}</option>
              <option value="business">{t("roleBusiness")}</option>
            </select>
          </label>
        ) : null}

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

        <Turnstile onToken={setCaptchaToken} />

        {status === "error" ? <p className="text-sm font-semibold text-red-700">{message}</p> : null}
        {status === "sent" ? <p className="rounded-xl bg-mint p-3 text-sm font-semibold text-forest">{t("checkEmail")}</p> : null}
        {status === "done" ? <p className="rounded-xl bg-mint p-3 text-sm font-semibold text-forest">{t("redirecting")}</p> : null}

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
              <Link href="/signup" className="font-bold text-forest underline">
                {t("signupTitle")}
              </Link>
            </>
          ) : (
            <>
              {t("haveAccount")}{" "}
              <Link href="/login" className="font-bold text-forest underline">
                {t("loginTitle")}
              </Link>
            </>
          )}
        </p>
      </div>
    </form>
  );
}
