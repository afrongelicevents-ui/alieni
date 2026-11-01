import { getTranslations, setRequestLocale } from "next-intl/server";
import { ComingSoon } from "@/components/ComingSoon";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();

  return <ComingSoon title={t("nav.jobs")} />;
}
