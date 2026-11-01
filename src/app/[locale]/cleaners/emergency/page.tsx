import { getTranslations, setRequestLocale } from "next-intl/server";
import { EmergencyCleanerList } from "@/components/emergency/EmergencyCleanerList";

export default async function CleanerEmergencyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("emergency");
  return (
    <section className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="headline text-3xl text-ink">{t("cleanerTitle")}</h1>
      <p className="mt-2 text-sm text-ink/70">{t("cleanerIntro")}</p>
      <div className="mt-6"><EmergencyCleanerList /></div>
    </section>
  );
}
