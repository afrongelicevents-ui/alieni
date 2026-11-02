import { setRequestLocale } from "next-intl/server";
import { PaymentsTable } from "@/components/admin/PaymentsTable";
import { listPayments } from "@/lib/admin/data";

export const dynamic = "force-dynamic";

export default async function AdminPaymentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { payments } = await listPayments();
  return <PaymentsTable payments={payments} />;
}
