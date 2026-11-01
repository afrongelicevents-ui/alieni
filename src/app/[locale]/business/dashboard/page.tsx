import { getTranslations, setRequestLocale } from "next-intl/server";
import { BusinessDashboard } from "@/components/business/BusinessDashboard";

export default async function BusinessDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("business");

  return (
    <section className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="headline text-3xl text-ink">{t("dashboardTitle")}</h1>
      <div className="mt-6">
        <BusinessDashboard />
      </div>
    </section>
  );
}
