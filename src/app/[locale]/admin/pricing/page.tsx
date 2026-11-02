import { setRequestLocale } from "next-intl/server";
import { PricingRules } from "@/components/admin/PricingRules";
import { listPricingRules } from "@/lib/admin/data";

export const dynamic = "force-dynamic";

export default async function AdminPricingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { rules, demo } = await listPricingRules();
  return <PricingRules rules={rules} demo={demo} />;
}
