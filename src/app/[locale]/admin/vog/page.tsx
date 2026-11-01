import { setRequestLocale } from "next-intl/server";
import { VogQueue } from "@/components/admin/VogQueue";

export default async function AdminVogPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <VogQueue />;
}
