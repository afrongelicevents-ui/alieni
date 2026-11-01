import { setRequestLocale } from "next-intl/server";
import { PaymentsTable } from "@/components/admin/PaymentsTable";

export default async function AdminPaymentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <PaymentsTable />;
}
