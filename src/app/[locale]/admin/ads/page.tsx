import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SAMPLE_CLEANERS } from "@/lib/sample-data";
import { formatHourlyRate } from "@/lib/money";

export default async function AdminAdsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("admin");
  const lang = ((await getLocale()) === "en" ? "en" : "nl") as "nl" | "en";

  return (
    <div>
      <h2 className="headline text-xl text-ink">{t("tabAds")}</h2>
      <div className="mt-4 overflow-x-auto rounded-card-lg border border-line bg-white">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-section text-xs font-bold text-ink/70">
            <tr>
              <th className="px-4 py-3">{t("colName")}</th>
              <th className="px-4 py-3">{t("colCity")}</th>
              <th className="px-4 py-3">{t("colRate")}</th>
              <th className="px-4 py-3">{t("colReviews")}</th>
              <th className="px-4 py-3">{t("colStatus")}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {SAMPLE_CLEANERS.map((cleaner) => (
              <tr key={cleaner.id}>
                <td className="px-4 py-3 font-semibold text-ink">{cleaner.name}</td>
                <td className="px-4 py-3">{cleaner.city}</td>
                <td className="px-4 py-3">{formatHourlyRate(cleaner.rateCents, lang)}</td>
                <td className="px-4 py-3">
                  {cleaner.rating.toFixed(1)} ({cleaner.reviewCount})
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-mint px-2.5 py-0.5 text-xs font-bold text-forest">
                    {t("adPublished")}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Link href={`/cleaners/${cleaner.id}`} className="text-xs font-bold text-forest underline">
                    {t("view")}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
