import { setRequestLocale } from "next-intl/server";
import { SettingsForm } from "@/components/admin/SettingsForm";
import { getSettings } from "@/lib/admin/data";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { values, demo } = await getSettings();
  return <SettingsForm initial={values} demo={demo} />;
}
