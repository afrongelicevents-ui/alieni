import { getTranslations, setRequestLocale } from "next-intl/server";
import { MediaManager, type MediaSlotView } from "@/components/admin/MediaManager";
import { listSiteMedia, publicMediaUrl, SITE_MEDIA_SLOTS, SLOT_SPEC } from "@/lib/site-media";
import { hasPublicImage } from "@/lib/public-image";

export const dynamic = "force-dynamic";

export default async function AdminMediaPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("admin.media");

  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const rows = await listSiteMedia();

  const slots: MediaSlotView[] = SITE_MEDIA_SLOTS.map((slot) => {
    const row = rows[slot];
    const uploadedUrl = row ? publicMediaUrl(row) : null;
    const bundledUrl = hasPublicImage(`img/${slot}.webp`) ? `/img/${slot}.webp` : null;
    return {
      slot,
      aspect: SLOT_SPEC[slot].aspect,
      maxWidth: SLOT_SPEC[slot].maxWidth,
      currentUrl: uploadedUrl ?? bundledUrl,
      source: uploadedUrl ? "uploaded" : bundledUrl ? "bundled" : "none",
      updatedAt: row?.updated_at ?? null,
    };
  });

  return (
    <div>
      <h2 className="headline text-2xl text-ink">{t("title")}</h2>
      <p className="mt-2 max-w-2xl text-sm text-ink/70">{t("intro")}</p>
      {!configured ? (
        <p className="mt-4 rounded-xl bg-sun/25 p-3 text-sm font-medium text-ink/80">{t("notConfigured")}</p>
      ) : null}
      <MediaManager slots={slots} configured={configured} />
    </div>
  );
}
