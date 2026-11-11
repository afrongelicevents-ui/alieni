import { setRequestLocale } from "next-intl/server";
import { DesktopHome } from "@/components/design-preview/DesktopHome";
import { previewCopy } from "@/components/design-preview/copy";

export default async function DesktopPreview({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <DesktopHome c={previewCopy(locale)} kvk={process.env.NEXT_PUBLIC_KVK_NUMBER ?? null} />;
}
