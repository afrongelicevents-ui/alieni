import { setRequestLocale } from "next-intl/server";
import { ReportQueue } from "@/components/admin/ReportQueue";

export default async function AdminReportsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ReportQueue />;
}
