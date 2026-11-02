import { setRequestLocale } from "next-intl/server";
import { VogQueue } from "@/components/admin/VogQueue";
import { getSettings, listVog } from "@/lib/admin/data";

export const dynamic = "force-dynamic";

export default async function AdminVogPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [{ items, demo }, { values }] = await Promise.all([listVog(), getSettings()]);
  const maxAgeMonths = Number(values?.vogMaxAgeMonths ?? 12) || 12;
  return <VogQueue items={items} demo={demo} maxAgeMonths={maxAgeMonths} />;
}
