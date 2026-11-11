"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { formatEuro } from "@/lib/money";
import { acceptEmergencyRequest } from "@/app/[locale]/emergency/actions";

export type OpenRequest = { id: string; postcode: string; city: string; windowStart: string; windowEnd: string; hours: number; tasks: string };
export type MineRequest = OpenRequest & { addressLine: string | null; requesterName: string | null; reportTo?: string | null };

/** Cleaner side: open same-day requests nearby — first to accept wins. */
export function EmergencyCleanerList({ open, mine, optedIn, myRateCents, strikes = 0, strikeLimit = 2 }: { open: OpenRequest[]; mine: MineRequest[]; optedIn: boolean; myRateCents: number | null; strikes?: number; strikeLimit?: number }) {
  const t = useTranslations("emergency");
  const lang = (useLocale() === "en" ? "en" : "nl") as "nl" | "en";
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(lang === "en" ? "en-GB" : "nl-NL", { hour: "2-digit", minute: "2-digit" });
  // cover can be for a later day (businesses): show the day when it is not today
  const dayOf = (iso: string) => (new Date(iso).toDateString() === new Date().toDateString() ? "" : new Date(iso).toLocaleDateString(lang === "en" ? "en-GB" : "nl-NL", { weekday: "short", day: "numeric", month: "short" }) + " · ");

  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, 15000);
    return () => clearInterval(id);
  }, [router]);

  async function accept(id: string) {
    setBusy(id);
    setError(null);
    const r = await acceptEmergencyRequest(id);
    setBusy(null);
    if (!r.ok) setError(t(`error_${r.error ?? "failed"}` as "error_failed"));
    router.refresh();
  }

  if (!optedIn) {
    return (
      <div className="rounded-card-lg border border-line bg-white p-6 text-center" data-opt-in-removed={strikes >= strikeLimit ? "1" : undefined}>
        <p className="text-ink/70">{strikes >= strikeLimit ? t("optInRemoved", { count: strikes }) : t("notOptedIn")}</p>
        <Link href="/profile" className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-forest px-6 text-sm font-bold text-white">{t("optInCta")}</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {strikes > 0 ? <p className="rounded-xl bg-sun/25 p-3 text-sm font-semibold text-ink/80">{t("strikesNote", { count: strikes, limit: strikeLimit })}</p> : null}
      <section>
        <h2 className="headline text-xl text-ink">{t("openTitle", { count: open.length })}</h2>
        {open.length === 0 ? <p className="mt-2 text-sm text-ink/70">{t("openEmpty")}</p> : null}
        {error ? <p className="mt-2 text-sm font-semibold text-red-700">{error}</p> : null}
        <ul className="mt-3 space-y-3">
          {open.map((r) => (
            <li key={r.id} className="rounded-card-lg border border-line bg-white p-4">
              <p className="font-extrabold text-ink">{r.city} ({r.postcode.slice(0, 4)}) · {dayOf(r.windowStart)}{timeOf(r.windowStart)}–{timeOf(r.windowEnd)} · {r.hours} {t("hoursShort")}</p>
              <p className="mt-1 text-sm text-ink/80">{r.tasks}</p>
              <p className="mt-1 text-xs text-ink/70">{myRateCents ? `${t("yourRate", { rate: formatEuro(myRateCents, lang) })} · ` : ""}{t("addressAfterAccept")}</p>
              <button type="button" disabled={busy === r.id} onClick={() => accept(r.id)} className="mt-3 inline-flex min-h-11 items-center justify-center rounded-full bg-sun px-6 text-sm font-bold text-white hover:bg-sun-dark disabled:opacity-50">{t("accept")}</button>
            </li>
          ))}
        </ul>
      </section>
      {mine.length > 0 ? (
        <section>
          <h2 className="headline text-xl text-ink">{t("mineTitle")}</h2>
          <ul className="mt-3 space-y-3">
            {mine.map((r) => (
              <li key={r.id} className="rounded-card-lg bg-mint p-4">
                <p className="font-extrabold text-ink">{r.addressLine ? `${r.addressLine}, ` : ""}{r.postcode} {r.city}</p>
                <p className="text-sm text-ink/80">{dayOf(r.windowStart)}{timeOf(r.windowStart)}–{timeOf(r.windowEnd)} · {r.hours} {t("hoursShort")} · {r.tasks}</p>
                {r.reportTo ? <p className="mt-1 text-sm font-semibold text-ink">{t("reportToShown", { reportTo: r.reportTo })}</p> : null}
                <p className="mt-1 text-xs text-forest">{t("acceptedByYou")}{r.requesterName ? ` · ${r.requesterName}` : ""}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
