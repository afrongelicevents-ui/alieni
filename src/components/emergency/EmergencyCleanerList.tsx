"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { formatEuro } from "@/lib/money";
import { acceptEmergencyRequest } from "@/app/[locale]/emergency/actions";

export type OpenRequest = { id: string; postcode: string; city: string; windowStart: string; windowEnd: string; hours: number; tasks: string };
export type MineRequest = OpenRequest & { addressLine: string | null; requesterName: string | null };

/** Cleaner side: open same-day requests nearby — first to accept wins. */
export function EmergencyCleanerList({ open, mine, optedIn, myRateCents }: { open: OpenRequest[]; mine: MineRequest[]; optedIn: boolean; myRateCents: number | null }) {
  const t = useTranslations("emergency");
  const lang = (useLocale() === "en" ? "en" : "nl") as "nl" | "en";
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(lang === "en" ? "en-GB" : "nl-NL", { hour: "2-digit", minute: "2-digit" });

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
      <div className="rounded-card-lg border border-line bg-white p-6 text-center">
        <p className="text-ink/70">{t("notOptedIn")}</p>
        <Link href="/cleaners/new" className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-forest px-6 text-sm font-bold text-white">{t("optInCta")}</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section>
        <h2 className="headline text-xl text-ink">{t("openTitle", { count: open.length })}</h2>
        {open.length === 0 ? <p className="mt-2 text-sm text-ink/70">{t("openEmpty")}</p> : null}
        {error ? <p className="mt-2 text-sm font-semibold text-red-700">{error}</p> : null}
        <ul className="mt-3 space-y-3">
          {open.map((r) => (
            <li key={r.id} className="rounded-card-lg border border-line bg-white p-4">
              <p className="font-extrabold text-ink">{r.city} ({r.postcode.slice(0, 4)}) · {timeOf(r.windowStart)}–{timeOf(r.windowEnd)} · {r.hours} {t("hoursShort")}</p>
              <p className="mt-1 text-sm text-ink/80">{r.tasks}</p>
              <p className="mt-1 text-xs text-ink/70">{myRateCents ? `${t("yourRate", { rate: formatEuro(myRateCents, lang) })} · ` : ""}{t("addressAfterAccept")}</p>
              <button type="button" disabled={busy === r.id} onClick={() => accept(r.id)} className="mt-3 inline-flex min-h-11 items-center justify-center rounded-full bg-sun px-6 text-sm font-bold text-ink hover:bg-sun-dark disabled:opacity-50">{t("accept")}</button>
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
                <p className="text-sm text-ink/80">{timeOf(r.windowStart)}–{timeOf(r.windowEnd)} · {r.hours} {t("hoursShort")} · {r.tasks}</p>
                <p className="mt-1 text-xs text-forest">{t("acceptedByYou")}{r.requesterName ? ` · ${r.requesterName}` : ""}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
