import { setRequestLocale } from "next-intl/server";
import { ServicesForm } from "@/components/admin/ServicesForm";
import { listCatalog } from "@/lib/admin/data";

export const dynamic = "force-dynamic";

export default async function AdminServicesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { catalog, demo } = await listCatalog();
  return <ServicesForm catalog={catalog} demo={demo} />;
}
