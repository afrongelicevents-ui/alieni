import { setRequestLocale } from "next-intl/server";
import { FeeEventsTable } from "@/components/admin/FeeEventsTable";
import { listFeeEvents } from "@/lib/admin/data";

export const dynamic = "force-dynamic";

export default async function AdminFeesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { events, demo } = await listFeeEvents();
  return <FeeEventsTable events={events} demo={demo} />;
}
