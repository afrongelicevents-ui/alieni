"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { BUSINESS_TYPES, monthlyFee } from "@/lib/business";
import { useBusinessAccount } from "@/lib/business-store";
import { formatEuro } from "@/lib/money";
import { ButtonLink } from "@/components/ui/Button";
import { BusinessTypeIcon } from "./BusinessTypeCard";

export function BusinessDashboard() {
  const t = useTranslations("business");
  const lang = (useLocale() === "en" ? "en" : "nl") as "nl" | "en";
  const { account, hydrated, update } = useBusinessAccount();

  if (!hydrated) return null;
  if (!account) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="max-w-sm text-ink/70">{t("noAccount")}</p>
        <ButtonLink href="/business/signup" withArrow>{t("heroCta")}</ButtonLink>
      </div>
    );
  }

  const cfg = BUSINESS_TYPES[account.businessType];
  const fee = monthlyFee(account.businessType, account.unitCount);
  const links = [
    { href: "/search", key: "navFind" },
    { href: "/jobs/new", key: "navPost" },
    { href: "/messages", key: "navChats" },
    { href: "/jobs", key: "navJobs" },
  ] as const;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-4 rounded-card-lg border border-line bg-white p-5">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-mint text-forest"><BusinessTypeIcon type={account.businessType} className="h-7 w-7" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-extrabold text-ink">{account.companyName}</h2>
          <p className="text-sm text-ink/70">{cfg.label[lang]} · KvK {account.kvkNumber}</p>
        </div>
      </div>

      {/* billing summary */}
      <section className="rounded-card-lg bg-forest p-5 text-white">
        <h3 className="text-sm font-semibold text-white/80">{t("billingSummary")}</h3>
        <p className="mt-1 text-2xl font-extrabold">
          {account.unitCount} {account.unitCount === 1 ? cfg.unit[lang] : cfg.unitPlural[lang]} × {formatEuro(cfg.defaultUnitPriceCents, lang)} = {formatEuro(fee.netCents, lang)}
          <span className="text-base font-semibold text-white/80">/{t("month")}</span>
        </p>
        <p className="text-sm text-white/80">{t("plusBtw", { btw: formatEuro(fee.btwCents, lang), gross: formatEuro(fee.grossCents, lang) })}</p>
        <p className="mt-3 rounded-xl bg-white/10 p-3 text-xs text-white/90">
          {account.billingStartedAt ? t("billingActive") : t("billingNotStarted")}
        </p>
        <label className="mt-3 block text-xs font-semibold text-white/80">
          {t("changeUnits", { units: cfg.unitPlural[lang] })}
          <input type="number" min={1} max={10000} value={account.unitCount}
            onChange={(e) => update({ unitCount: Math.max(1, Math.min(10000, Math.round(Number(e.target.value) || 1))) })}
            className="mt-1 w-32 rounded-xl border-0 bg-white px-3 py-2 text-base font-extrabold text-ink" />
          <span className="ml-2 text-white/70">{t("unitChangeNote")}</span>
        </label>
      </section>

      {/* quick links */}
      <ul className="grid grid-cols-2 gap-3">
        {links.map(({ href, key }) => (
          <li key={key}>
            <Link href={href} className="flex min-h-14 items-center justify-center rounded-card-lg border border-line bg-white px-3 text-center text-sm font-bold text-forest hover:bg-mint">{t(key)}</Link>
          </li>
        ))}
      </ul>

      {/* my locations */}
      <section>
        <h3 className="headline text-xl text-ink">{t("myUnits", { units: cfg.unitPlural[lang] })}</h3>
        <ul className="mt-3 space-y-2">
          {account.units.map((u) => (
            <li key={u.id} className="flex items-center justify-between gap-3 rounded-card-lg border border-line bg-white p-4">
              <div className="min-w-0">
                <p className="truncate font-extrabold text-ink">{u.name || u.addressLine}</p>
                <p className="truncate text-sm text-ink/70">{u.addressLine}, {u.postcode} {u.city}</p>
              </div>
              <span className="shrink-0 rounded-full bg-section px-3 py-1 text-xs font-semibold text-ink/70">{t("noCleanerYet")}</span>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-xs text-ink/70">{t("demoNote")}</p>
    </div>
  );
}
