import { getTranslations, setRequestLocale } from "next-intl/server";
import { BusinessSubnav } from "@/components/business/BusinessSubnav";
import { WorkRecords } from "@/components/business/WorkRecords";
import { loadBusinessPage } from "@/lib/business-page";

export const dynamic = "force-dynamic";

export default async function BusinessWorkPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("business");
  const { bundle } = await loadBusinessPage(locale, "/business/work");
  return (
    <section className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="headline text-3xl text-ink">{t("workTitle")}</h1>
      <BusinessSubnav />
      <p className="mt-4 text-sm text-ink/70">{t("workIntro")}</p>
      <div className="mt-5"><WorkRecords records={bundle.workRecords} /></div>
    </section>
  );
}
