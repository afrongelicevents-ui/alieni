import { setRequestLocale } from "next-intl/server";
import { SettingsForm } from "@/components/admin/SettingsForm";

export default async function AdminSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <SettingsForm />;
}
