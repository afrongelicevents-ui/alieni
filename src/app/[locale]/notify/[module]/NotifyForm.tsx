"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { notifyMe, type NotifyState } from "./actions";

export function NotifyForm({ module }: { module: string }) {
  const t = useTranslations("site.notify");
  const [state, action, pending] = useActionState<NotifyState, FormData>(notifyMe, { status: "idle" });

  if (state.status === "done") {
    return (
      <div role="status" className="mt-6 rounded-2xl border border-edge bg-tint p-5 font-semibold text-navy">
        {t("done")}
        <p className="mt-3"><Link href="/" className="text-royal underline underline-offset-2">{t("back")}</Link></p>
      </div>
    );
  }

  return (
    <form action={action} className="mt-6 space-y-4">
      <input type="hidden" name="module" value={module} />
      <div className="hidden" aria-hidden="true">
        <label>Website<input type="text" name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>
      <div>
        <label htmlFor="notify-email" className="block text-sm font-bold text-navy">{t("email")}</label>
        <input id="notify-email" name="email" type="email" required autoComplete="email" maxLength={254} className="mt-1 min-h-12 w-full rounded-xl border border-edge bg-white px-4 text-base text-navy focus:border-royal focus:outline-none" />
      </div>
      <label className="flex items-start gap-3 text-sm leading-relaxed text-body">
        <input type="checkbox" name="consent" required className="mt-0.5 h-5 w-5 shrink-0 accent-royal" />
        <span>
          {t("consent")}{" "}
          <Link href="/privacy" className="font-semibold text-royal underline underline-offset-2">Privacy</Link>
        </span>
      </label>
      {state.status === "error" ? <p role="alert" className="text-sm font-semibold text-red-700">{t("error")}</p> : null}
      {state.status === "unavailable" ? <p role="alert" className="text-sm font-semibold text-red-700">{t("unavailable")}</p> : null}
      <button type="submit" disabled={pending} className="inline-flex min-h-12 items-center rounded-full bg-royal px-7 font-bold text-white hover:bg-royal-dark disabled:opacity-60">
        {t("submit")}
      </button>
    </form>
  );
}
