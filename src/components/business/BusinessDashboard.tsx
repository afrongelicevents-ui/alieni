"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { BUSINESS_TYPES } from "@/lib/business";
import type { BusinessBundle } from "@/lib/business-data";
import { formatEuro } from "@/lib/money";
import { BusinessTypeIcon } from "./BusinessTypeCard";
import { ServiceTiles, type Tile } from "./ServiceTiles";
import { WorkRecords } from "./WorkRecords";

/** Business dashboard: service tiles, this month's statement, what waits on you, recent work. */
export function BusinessDashboard({ bundle, tiles, unitPriceCents }: { bundle: BusinessBundle; tiles: Tile[]; unitPriceCents: number | null }) {
  const t = useTranslations("business");
  const lang = (useLocale() === "en" ? "en" : "nl") as "nl" | "en";
  const { profile, feeEvents, workRecords, emergencies, jobs } = bundle;
  const type = profile.business_type ?? "office";
  const cfg = BUSINESS_TYPES[type];

  const counted = feeEvents.filter((e) => e.status !== "waived");
  const monthNet = counted.reduce((a, e) => a + e.amount_cents, 0);
  const toConfirm = workRecords.filter((w) => w.outcome === "done" && !w.business_confirmed_at).length;
  const searching = emergencies.filter((e) => e.status === "searching").length;
  const responses = jobs.reduce((a, j) => a + j.responses, 0);
  const waiting = [
    toConfirm ? { key: "waitingConfirm", count: toConfirm, href: "/business/work" } : null,
    searching ? { key: "waitingSearching", count: searching, href: "/emergency" } : null,
    responses ? { key: "waitingResponses", count: responses, href: "/jobs" } : null,
  ].filter(Boolean) as { key: "waitingConfirm" | "waitingSearching" | "waitingResponses"; count: number; href: string }[];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-4 rounded-card-lg border border-line bg-white p-5">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-mint text-forest"><BusinessTypeIcon type={type} className="h-7 w-7" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-extrabold text-ink">{profile.company_name}</h2>
          <p className="text-sm text-ink/70">{cfg.label[lang]}{profile.kvk_number ? ` · KvK ${profile.kvk_number}` : ""} · {profile.unit_count} {profile.unit_count === 1 ? cfg.unit[lang] : cfg.unitPlural[lang]}</p>
        </div>
        <Link href="/business/profile" className="rounded-full border border-line px-4 py-2 text-xs font-bold text-forest hover:bg-mint">{t("navProfile")}</Link>
      </div>

      <ServiceTiles tiles={tiles} />

      <div className="grid gap-4 md:grid-cols-2">
        {/* this month */}
        <section className="rounded-card-lg bg-forest p-5 text-white" data-statement>
          <h3 className="text-sm font-semibold text-white/80">{t("statementTitle")}</h3>
          <p className="mt-1 text-2xl font-extrabold">{monthNet > 0 ? formatEuro(monthNet, lang) : t("statementNone")}</p>
          <p className="text-sm text-white/80">{t("statementEvents", { count: counted.length })}</p>
          {unitPriceCents ? (
            <p className="mt-2 text-sm text-white/90">{profile.unit_count} × {formatEuro(unitPriceCents, lang)} {t("perUnitMonth", { unit: cfg.unit[lang] })}</p>
          ) : (
            <p className="mt-3 rounded-xl bg-white/10 p-3 text-xs text-white/90">{t("statementModelNone")}</p>
          )}
          <Link href="/business/billing" className="mt-3 inline-flex min-h-10 items-center rounded-full bg-sun px-4 text-xs font-bold text-ink">{t("statementLink")}</Link>
        </section>

        {/* waiting on you */}
        <section className="rounded-card-lg border border-line bg-white p-5" data-waiting>
          <h3 className="font-extrabold text-ink">{t("waitingTitle")}</h3>
          {waiting.length === 0 ? <p className="mt-1 text-sm text-ink/70">{t("waitingNone")}</p> : (
            <ul className="mt-2 space-y-2">
              {waiting.map((w) => (
                <li key={w.key}><Link href={w.href} className="flex items-center justify-between gap-3 rounded-xl bg-sun/25 px-3 py-2 text-sm font-semibold text-ink hover:bg-sun/40">{t(w.key, { count: w.count })}<span aria-hidden="true">→</span></Link></li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* recent work */}
      <section>
        <div className="flex items-center justify-between gap-3">
          <h3 className="headline text-xl text-ink">{t("workTitle")}</h3>
          <Link href="/business/work" className="text-sm font-bold text-forest underline">{t("navWork")}</Link>
        </div>
        <div className="mt-3"><WorkRecords records={workRecords.slice(0, 5)} compact /></div>
      </section>
    </div>
  );
}
