import { getTranslations, setRequestLocale } from "next-intl/server";
import { EmergencyRequestForm } from "@/components/emergency/EmergencyRequestForm";

export default async function EmergencyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("emergency");
  return (
    <section className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="headline text-3xl text-ink">{t("title")}</h1>
      <p className="mt-2 text-ink/70">{t("intro")}</p>
      <div className="mt-6"><EmergencyRequestForm /></div>
    </section>
  );
}
