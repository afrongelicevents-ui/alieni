import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { computeKpis } from "@/lib/admin/kpis";
import {
  SAMPLE_CONNECTIONS,
  SAMPLE_COUNTS,
  SAMPLE_PAYMENTS,
  SAMPLE_REPORTS,
} from "@/lib/admin/sample-admin-data";
import { formatEuro } from "@/lib/money";

export default async function AdminDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("admin");
  const lang = ((await getLocale()) === "en" ? "en" : "nl") as "nl" | "en";

  const kpis = computeKpis(SAMPLE_PAYMENTS, SAMPLE_CONNECTIONS, new Date("2026-11-15T12:00:00Z"));
  const openReports = SAMPLE_REPORTS.filter((r) => r.status === "open").length;

  const cards = [
    { label: t("kpiRevenueGross"), value: formatEuro(kpis.revenueGrossCents, lang) },
    { label: t("kpiRevenueNet"), value: formatEuro(kpis.revenueNetCents, lang) },
    { label: t("kpiBtw"), value: formatEuro(kpis.revenueBtwCents, lang) },
    { label: t("kpiActiveConnections"), value: String(kpis.activeConnections) },
    { label: t("kpiMeetings"), value: String(SAMPLE_COUNTS.meetingsRequestedThisMonth) },
    { label: t("kpiNewAds"), value: String(SAMPLE_COUNTS.newAdsThisMonth) },
    { label: t("kpiChurn"), value: `${kpis.churnPct}%` },
  ];

  return (
    <div>
      {/* needs-you queue */}
      <Link
        href="/admin/reports"
        className="flex items-center justify-between rounded-card-lg border-2 border-sun bg-sun/15 p-5 transition-colors hover:bg-sun/25"
      >
        <div>
          <h2 className="font-extrabold text-ink">{t("needsYou")}</h2>
          <p className="text-sm text-ink/70">{t("needsYouText", { count: openReports })}</p>
        </div>
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sun text-lg font-extrabold text-ink">
          {openReports}
        </span>
      </Link>

      <h2 className="headline mt-8 text-xl text-ink">{t("kpiTitle")}</h2>
      <dl className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-card-lg border border-line bg-white p-4">
            <dt className="text-xs font-semibold text-ink/60">{card.label}</dt>
            <dd className="mt-1 text-2xl font-extrabold text-ink">{card.value}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-6 text-xs text-ink/50">{t("autoNote")}</p>
    </div>
  );
}
