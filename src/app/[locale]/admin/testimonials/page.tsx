import { setRequestLocale } from "next-intl/server";
import { TestimonialsManager } from "@/components/admin/TestimonialsManager";
import { listTestimonials } from "@/lib/admin/data";

export const dynamic = "force-dynamic";

export default async function AdminTestimonialsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { items, demo } = await listTestimonials();
  return <TestimonialsManager items={items} demo={demo} />;
}
