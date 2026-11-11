import { setRequestLocale } from "next-intl/server";
import { ServicesForm } from "@/components/admin/ServicesForm";
import { WebsiteModulesForm } from "@/components/admin/WebsiteModulesForm";
import { listCatalog, listWebsiteModules } from "@/lib/admin/data";

export const dynamic = "force-dynamic";

export default async function AdminServicesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [{ catalog, demo }, web] = await Promise.all([listCatalog(), listWebsiteModules()]);
  return (
    <>
      <ServicesForm catalog={catalog} demo={demo} />
      <WebsiteModulesForm initial={web.modules} interest={web.interest} demo={web.demo} />
    </>
  );
}
