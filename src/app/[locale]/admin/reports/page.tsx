import { setRequestLocale } from "next-intl/server";
import { ReportQueue } from "@/components/admin/ReportQueue";
import { listReports } from "@/lib/admin/data";

export const dynamic = "force-dynamic";

export default async function AdminReportsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { reports, demo } = await listReports();
  return <ReportQueue reports={reports} demo={demo} />;
}
