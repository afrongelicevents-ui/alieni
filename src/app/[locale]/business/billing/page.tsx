import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { BillingPanel } from "@/components/business/BillingPanel";
import { BusinessSubnav } from "@/components/business/BusinessSubnav";
import { BUSINESS_TYPES } from "@/lib/business";
import { loadBusinessPage } from "@/lib/business-page";
import { formatEuro } from "@/lib/money";
import { getActiveRules, ruleFor, MODEL_LABEL, SERVICE_KEYS } from "@/lib/services";

export const dynamic = "force-dynamic";

/** Statement preview from fee events (no invoice, no payment request) + existing invoices. */
export default async function BusinessBillingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("business");
  const lang = ((await getLocale()) === "en" ? "en" : "nl") as "nl" | "en";
  const { bundle } = await loadBusinessPage(locale, "/business/billing");
  const rules = await getActiveRules();
  const type = bundle.profile.business_type;
  const applying = SERVICE_KEYS.map((s) => ({ s, r: ruleFor(rules, s, type) })).filter((x) => x.r && x.r.model !== "none");
  const counted = bundle.feeEvents.filter((e) => e.status !== "waived");
  const net = counted.reduce((a, e) => a + e.amount_cents, 0);
  const btw = counted.reduce((a, e) => a + e.btw_cents, 0);
  const fmt = (iso: string) => new Date(iso).toLocaleString(lang === "en" ? "en-GB" : "nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const unitLabel = type ? BUSINESS_TYPES[type].unit[lang] : "";

  return (
    <section className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="headline text-3xl text-ink">{t("billingPageTitle")}</h1>
      <BusinessSubnav />
      <p className="mt-4 text-sm text-ink/70">{t("billingPageIntro")}</p>

      <div className="mt-5 rounded-card-lg bg-forest p-5 text-white" data-statement-total>
        <p className="text-sm font-semibold text-white/80">{t("monthTotal")}</p>
        <p className="mt-1 text-3xl font-extrabold">{formatEuro(net, lang)}</p>
        <p className="text-sm text-white/80">{t("plusBtw", { btw: formatEuro(btw, lang), gross: formatEuro(net + btw, lang) })}</p>
        {applying.length === 0 ? <p className="mt-3 rounded-xl bg-white/10 p-3 text-xs text-white/90">{t("billingNoRules")}</p> : (
          <ul className="mt-3 space-y-1 text-xs text-white/90">
            {applying.map(({ s, r }) => (
              <li key={s}>{t("billingRuleActive", { label: `${t(`tile_${s}`)} — ${MODEL_LABEL[r!.model][lang]}${r!.model === "percent" ? ` ${r!.percent}%` : ` ${formatEuro(r!.amount_cents, lang)}${r!.model === "monthly_per_unit" ? ` / ${r!.unit ?? unitLabel}` : ""}`}` })}</li>
            ))}
          </ul>
        )}
      </div>

      <section className="mt-5 overflow-x-auto rounded-card-lg border border-line bg-white">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="bg-section text-xs font-semibold uppercase text-ink/70">
            <tr><th className="px-4 py-2">{t("colWhen")}</th><th className="px-4 py-2">{t("colWhat")}</th><th className="px-4 py-2">{t("colService")}</th><th className="px-4 py-2 text-right">{t("colAmount")}</th><th className="px-4 py-2">{t("colStatus")}</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {bundle.feeEvents.length === 0 ? <tr><td colSpan={5} className="px-4 py-4 text-ink/70">{t("statementNone")}</td></tr> : bundle.feeEvents.map((e) => (
              <tr key={e.id} data-fee-event>
                <td className="px-4 py-2 whitespace-nowrap">{fmt(e.occurred_at)}</td>
                <td className="px-4 py-2 font-semibold text-ink">{t(`ev_${e.event_type}` as "ev_cover_accepted")}</td>
                <td className="px-4 py-2">{t(`tile_${e.service_key}` as "tile_cover")}</td>
                <td className="px-4 py-2 text-right font-bold text-forest">{formatEuro(e.amount_cents, lang)}</td>
                <td className="px-4 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${e.status === "waived" ? "bg-section text-ink/60" : "bg-mint text-forest"}`}>{t(`fee_${e.status}`)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="mt-5"><BillingPanel bundle={bundle} /></div>
      <p className="mt-4 text-xs text-ink/70">{t("billingText")}</p>
    </section>
  );
}
