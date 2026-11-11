import { setRequestLocale } from "next-intl/server";
import { MobileWebHome } from "@/components/design-preview/MobileWebHome";
import { previewCopy } from "@/components/design-preview/copy";

export default async function MobileWebPreview({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  // Watch Video is shown here for the design review only; on the live site it
  // stays hidden until a video URL is set in admin (brief §8).
  return <MobileWebHome c={previewCopy(locale)} showVideo kvk={process.env.NEXT_PUBLIC_KVK_NUMBER ?? null} />;
}
