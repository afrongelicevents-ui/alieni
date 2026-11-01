"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEmergency } from "@/lib/emergency-store";
import { formatEuro } from "@/lib/money";

/** Cleaner side: open same-day requests nearby — first to accept wins. */
export function EmergencyCleanerList() {
  const t = useTranslations("emergency");
  const lang = (useLocale() === "en" ? "en" : "nl") as "nl" | "en";
  const { requests, hydrated, accept } = useEmergency();
  if (!hydrated) return null;

  const open = requests.filter((r) => r.status === "searching");
  const mine = requests.filter((r) => r.status === "accepted" && r.acceptedBy === "me");

  return (
    <div className="space-y-6">
      <section>
        <h2 className="headline text-xl text-ink">{t("openTitle", { count: open.length })}</h2>
        {open.length === 0 ? <p className="mt-2 text-sm text-ink/70">{t("openEmpty")}</p> : null}
        <ul className="mt-3 space-y-3">
          {open.map((r) => (
            <li key={r.id} className="rounded-card-lg border border-line bg-white p-4">
              <p className="font-extrabold text-ink">{r.city} ({r.postcode.slice(0, 4)}) · {r.windowStart.slice(11, 16)}–{r.windowEnd.slice(11, 16)} · {r.hours} {t("hoursShort")}</p>
              <p className="mt-1 text-sm text-ink/80">{r.tasks}</p>
              <p className="mt-1 text-xs text-ink/70">{t("yourRate", { rate: formatEuro(2700, lang) })} · {t("addressAfterAccept")}</p>
              <button type="button" onClick={() => accept(r.id, "me")} className="mt-3 inline-flex min-h-11 items-center justify-center rounded-full bg-sun px-6 text-sm font-bold text-ink hover:bg-sun-dark">{t("accept")}</button>
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
                <p className="font-extrabold text-ink">{r.addressLine}, {r.postcode} {r.city}</p>
                <p className="text-sm text-ink/80">{r.windowStart.slice(11, 16)}–{r.windowEnd.slice(11, 16)} · {r.hours} {t("hoursShort")} · {r.tasks}</p>
                <p className="mt-1 text-xs text-forest">{t("acceptedByYou")}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
