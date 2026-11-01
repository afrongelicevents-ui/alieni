import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { SAMPLE_BUSINESSES, SAMPLE_LINEN_ORDERS } from "@/lib/admin/sample-admin-data";
import { BUSINESS_TYPES, BUSINESS_TYPE_KEYS } from "@/lib/business";
import { formatEuro } from "@/lib/money";

export default async function AdminBusinessPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("admin");
  const lang = ((await getLocale()) === "en" ? "en" : "nl") as "nl" | "en";

  const mrrByType = Object.fromEntries(BUSINESS_TYPE_KEYS.map((k) => [k, 0])) as Record<string, number>;
  for (const b of SAMPLE_BUSINESSES) if (b.status === "active") mrrByType[b.type] += b.units * b.unitPriceCents;
  const totalMrr = Object.values(mrrByType).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-8">
      <section>
        <h2 className="headline text-xl text-ink">{t("bizTitle")}</h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
          <div className="rounded-card-lg bg-forest p-4 text-white">
            <dt className="text-xs font-semibold text-white/80">{t("bizMrrTotal")}</dt>
            <dd className="mt-1 text-2xl font-extrabold">{formatEuro(totalMrr, lang)}</dd>
          </div>
          {BUSINESS_TYPE_KEYS.map((k) => (
            <div key={k} className="rounded-card-lg border border-line bg-white p-4">
              <dt className="text-xs font-semibold text-ink/70">{BUSINESS_TYPES[k].label[lang]}</dt>
              <dd className="mt-1 text-xl font-extrabold text-ink">{formatEuro(mrrByType[k], lang)}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-ink/70">{t("bizMrrNote")}</p>
      </section>

      <section className="overflow-x-auto rounded-card-lg border border-line bg-white">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-section text-xs font-bold text-ink/70">
            <tr><th className="px-4 py-3">{t("colCompany")}</th><th className="px-4 py-3">{t("colType")}</th><th className="px-4 py-3">{t("colUnits")}</th><th className="px-4 py-3">{t("colMonthly")}</th><th className="px-4 py-3">{t("colStatus")}</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {SAMPLE_BUSINESSES.map((b) => (
              <tr key={b.id}>
                <td className="px-4 py-3 font-semibold text-ink">{b.company}</td>
                <td className="px-4 py-3">{BUSINESS_TYPES[b.type].label[lang]}</td>
                <td className="px-4 py-3">{b.units} {b.units === 1 ? BUSINESS_TYPES[b.type].unit[lang] : BUSINESS_TYPES[b.type].unitPlural[lang]}</td>
                <td className="px-4 py-3 font-semibold">{formatEuro(b.units * b.unitPriceCents, lang)}</td>
                <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${b.status === "active" ? "bg-mint text-forest" : b.status === "paused" ? "bg-red-100 text-red-800" : "bg-section text-ink/70"}`}>{t(`biz_${b.status}` as "biz_active")}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="headline text-xl text-ink">{t("linenTitle")}</h2>
        <p className="mt-1 text-sm text-ink/70">{t("linenText")}</p>
        <div className="mt-3 overflow-x-auto rounded-card-lg border border-line bg-white">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="bg-section text-xs font-bold text-ink/70">
              <tr><th className="px-4 py-3">{t("colCompany")}</th><th className="px-4 py-3">{t("colUnit")}</th><th className="px-4 py-3">{t("colDate")}</th><th className="px-4 py-3">{t("colKits")}</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {SAMPLE_LINEN_ORDERS.map((o) => (
                <tr key={o.id}><td className="px-4 py-3 font-semibold text-ink">{o.company}</td><td className="px-4 py-3">{o.unit}</td><td className="px-4 py-3">{o.date}</td><td className="px-4 py-3">{o.kits}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
