"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { BUSINESS_TYPES, monthlyFee } from "@/lib/business";
import type { BusinessBundle } from "@/lib/business-data";
import { formatEuro } from "@/lib/money";
import { addBusinessUnit, cancelBusinessBilling, updateUnitCount } from "@/app/[locale]/business/actions";
import { BusinessTypeIcon } from "./BusinessTypeCard";
import { CalendarSync } from "./CalendarSync";

const inputCls = "min-h-11 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none";

/** Business dashboard on live data (server-loaded bundle, server actions for changes). */
export function BusinessDashboard({ bundle }: { bundle: BusinessBundle }) {
  const t = useTranslations("business");
  const lang = (useLocale() === "en" ? "en" : "nl") as "nl" | "en";
  const router = useRouter();
  const { profile, units, invoices, connectedCleaners, jobs } = bundle;
  const [count, setCount] = useState(String(profile.pending_unit_count ?? profile.unit_count));
  const [busy, setBusy] = useState(false);
  const [newUnit, setNewUnit] = useState({ name: "", addressLine: "", postcode: "", city: "" });
  const [unitError, setUnitError] = useState<string | null>(null);

  const type = profile.business_type ?? "office";
  const cfg = BUSINESS_TYPES[type];
  const unitPrice = profile.unit_price_cents ?? cfg.defaultUnitPriceCents;
  const fee = monthlyFee(type, profile.unit_count, { ...Object.fromEntries(Object.keys(BUSINESS_TYPES).map((k) => [k, BUSINESS_TYPES[k as keyof typeof BUSINESS_TYPES].defaultUnitPriceCents])), [type]: unitPrice } as Parameters<typeof monthlyFee>[2]);
  const links = [
    { href: "/search", key: "navFind" },
    { href: "/jobs/new", key: "navPost" },
    { href: "/messages", key: "navChats" },
    { href: "/jobs", key: "navJobs" },
  ] as const;

  async function saveCount() {
    const n = Math.max(1, Math.min(10000, Math.round(Number(count) || 1)));
    setBusy(true);
    await updateUnitCount(n);
    setBusy(false);
    router.refresh();
  }

  async function addUnit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setUnitError(null);
    const r = await addBusinessUnit(newUnit);
    setBusy(false);
    if (!r.ok) setUnitError(t(`error_${r.error ?? "failed"}` as "error_failed"));
    else {
      setNewUnit({ name: "", addressLine: "", postcode: "", city: "" });
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-4 rounded-card-lg border border-line bg-white p-5">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-mint text-forest"><BusinessTypeIcon type={type} className="h-7 w-7" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-extrabold text-ink">{profile.company_name}</h2>
          <p className="text-sm text-ink/70">{cfg.label[lang]}{profile.kvk_number ? ` · KvK ${profile.kvk_number}` : ""}</p>
        </div>
      </div>

      {/* billing summary */}
      <section className="rounded-card-lg bg-forest p-5 text-white">
        <h3 className="text-sm font-semibold text-white/80">{t("billingSummary")}</h3>
        <p className="mt-1 text-2xl font-extrabold">
          {profile.unit_count} {profile.unit_count === 1 ? cfg.unit[lang] : cfg.unitPlural[lang]} × {formatEuro(unitPrice, lang)} = {formatEuro(fee.netCents, lang)}
          <span className="text-base font-semibold text-white/80">/{t("month")}</span>
        </p>
        <p className="text-sm text-white/80">{t("plusBtw", { btw: formatEuro(fee.btwCents, lang), gross: formatEuro(fee.grossCents, lang) })}</p>
        <p className="mt-3 rounded-xl bg-white/10 p-3 text-xs text-white/90">
          {profile.payment_failed_at ? t("paymentFailed") : profile.billing_ended_at ? t("cancelledNote") : profile.billing_started_at ? t("billingActive") : t("billingNotStarted")}
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="block text-xs font-semibold text-white/80">
            {t("changeUnits", { units: cfg.unitPlural[lang] })}
            <input id="unit-count" type="number" min={1} max={10000} value={count} onChange={(e) => setCount(e.target.value)}
              className="mt-1 block w-32 rounded-xl border-0 bg-white px-3 py-2 text-base font-extrabold text-ink" />
          </label>
          <button type="button" onClick={saveCount} disabled={busy} className="inline-flex min-h-10 items-center rounded-full bg-sun px-4 text-xs font-bold text-ink disabled:opacity-50">{t("save")}</button>
          {profile.billing_started_at ? <span className="text-xs text-white/70">{t("unitChangeNote")}</span> : null}
        </div>
        {profile.pending_unit_count ? (
          <p className="mt-2 text-xs text-white/90">{t("pendingUnits", { count: profile.pending_unit_count, units: cfg.unitPlural[lang], fee: formatEuro(monthlyFee(type, profile.pending_unit_count).netCents, lang) })}</p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <a href="/api/invoices/export" download className="inline-flex min-h-10 items-center rounded-full bg-white/15 px-4 text-xs font-bold text-white hover:bg-white/25">{t("exportCsv")}</a>
          {profile.billing_started_at && !profile.billing_ended_at ? (
            <button type="button" disabled={busy} onClick={async () => { setBusy(true); await cancelBusinessBilling(); setBusy(false); router.refresh(); }}
              className="inline-flex min-h-10 items-center rounded-full border border-white/40 px-4 text-xs font-bold text-white hover:bg-white/10 disabled:opacity-50">{t("cancelBilling")}</button>
          ) : null}
        </div>
      </section>

      {/* invoices */}
      <section className="rounded-card-lg border border-line bg-white p-5">
        <h3 className="font-extrabold text-ink">{t("invoicesTitle")}</h3>
        {invoices.length === 0 ? (
          <p className="mt-1 text-sm text-ink/70">{t("invoicesText")}</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {invoices.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="font-semibold text-ink">{inv.number} · {new Date(inv.issued_at).toLocaleDateString(lang === "en" ? "en-GB" : "nl-NL")}</span>
                <span className="flex items-center gap-3">
                  <span className="font-bold text-forest">{formatEuro(inv.gross_cents, lang)}</span>
                  <a href={`/api/invoices/${inv.id}/pdf`} className="text-xs font-bold text-forest underline">PDF</a>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* quick links */}
      <ul className="grid grid-cols-2 gap-3">
        {links.map(({ href, key }) => (
          <li key={key}>
            <Link href={href} className="flex min-h-14 items-center justify-center rounded-card-lg border border-line bg-white px-3 text-center text-sm font-bold text-forest hover:bg-mint">{t(key)}</Link>
          </li>
        ))}
      </ul>

      {/* my jobs */}
      {jobs.length > 0 ? (
        <section className="rounded-card-lg border border-line bg-white p-5">
          <h3 className="font-extrabold text-ink">{t("navJobs")}</h3>
          <ul className="mt-2 divide-y divide-line">
            {jobs.map((j) => (
              <li key={j.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="font-semibold text-ink">{j.space_type} · {j.frequency} · <span className="text-ink/60">{j.status}</span></span>
                <Link href="/jobs" className="rounded-full bg-mint px-3 py-1 text-xs font-bold text-forest">{t("responsesCount", { count: j.responses })}</Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <CalendarSync bundle={bundle} />

      {/* my locations */}
      <section>
        <h3 className="headline text-xl text-ink">{t("myUnits", { units: cfg.unitPlural[lang] })}</h3>
        <ul className="mt-3 space-y-2">
          {units.map((u) => (
            <li key={u.id} className="flex items-center justify-between gap-3 rounded-card-lg border border-line bg-white p-4">
              <div className="min-w-0">
                <p className="truncate font-extrabold text-ink">{u.name || u.address_line}</p>
                <p className="truncate text-sm text-ink/70">{u.address_line}, {u.postcode} {u.city}</p>
              </div>
              <span className="shrink-0 rounded-full bg-section px-3 py-1 text-xs font-semibold text-ink/70">
                {connectedCleaners.length ? connectedCleaners.map((c) => c.name).join(", ") : t("noCleanerYet")}
              </span>
            </li>
          ))}
        </ul>
        <form onSubmit={addUnit} className="mt-3 grid gap-2 rounded-card-lg border border-dashed border-line p-4 sm:grid-cols-2">
          <p className="text-sm font-bold text-ink sm:col-span-2">{t("addUnit", { unit: cfg.unit[lang] })}</p>
          <input className={inputCls} placeholder={t("unitName")} value={newUnit.name} onChange={(e) => setNewUnit({ ...newUnit, name: e.target.value })} />
          <input className={inputCls} placeholder={t("addressLine")} value={newUnit.addressLine} onChange={(e) => setNewUnit({ ...newUnit, addressLine: e.target.value })} required />
          <input className={inputCls} placeholder="1012 AB" value={newUnit.postcode} onChange={(e) => setNewUnit({ ...newUnit, postcode: e.target.value })} required />
          <input className={inputCls} placeholder={t("city")} value={newUnit.city} onChange={(e) => setNewUnit({ ...newUnit, city: e.target.value })} required />
          {unitError ? <p className="text-xs font-semibold text-red-700 sm:col-span-2">{unitError}</p> : null}
          <button type="submit" disabled={busy} className="inline-flex min-h-11 items-center justify-center rounded-full border-2 border-forest px-5 text-sm font-bold text-forest hover:bg-mint disabled:opacity-50 sm:col-span-2">{t("addUnitCta")}</button>
        </form>
      </section>
    </div>
  );
}
