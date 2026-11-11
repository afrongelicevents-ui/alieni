import { setRequestLocale } from "next-intl/server";
import { siteImageUrl } from "@/lib/site-media";
import { getPublicHouseholdFeeCents } from "@/lib/site-settings";
import { getWebsiteSettings } from "@/lib/website-settings";
import { getPublishedTestimonials } from "@/lib/testimonials";
import { formatEuro } from "@/lib/money";
import { fetchLiveCleaners } from "@/lib/cleaners-live";
import { createClient } from "@/lib/supabase/server";
import type { SampleCleaner } from "@/lib/sample-data";
import { FeaturedCleaners } from "@/components/home/FeaturedCleaners";
import { HowItWorks } from "@/components/home/HowItWorks";
import { HomeHero } from "@/components/site/home/HomeHero";
import { Banner, BusinessAndCommunity, Explore, MobileAbout, MobileSearch, Testimonials, Why } from "@/components/site/home/HomeSections";

/** Up to 3 real published ads: most verified jobs first, then the newest. */
async function featuredLiveCleaners(): Promise<SampleCleaner[]> {
  const live = await fetchLiveCleaners();
  if (!live || live.length === 0) return [];
  const created = new Map<string, number>();
  const supabase = await createClient();
  if (supabase) {
    const { data } = await supabase.from("cleaner_profiles").select("id, created_at").in("id", live.map((c) => c.id));
    for (const r of (data ?? []) as { id: string; created_at: string }[]) created.set(r.id, Date.parse(r.created_at) || 0);
  }
  return [...live]
    .sort((a, b) => b.verifiedJobs - a.verifiedJobs || (created.get(b.id) ?? 0) - (created.get(a.id) ?? 0))
    .slice(0, 3);
}

/**
 * Homepage. One page, two arrangements (brief §2 desktop / §3 mobile):
 * mobile reads hero → search → categories → about → why → explore → featured → how it works → businesses;
 * desktop reads hero → explore → featured → why → how it works → businesses & cleaners → banner.
 * Prices appear only while charging is active (getPublicHouseholdFeeCents); otherwise the copy is price-neutral.
 */
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [uploadedHero, settings, testimonials, feeCents, featured] = await Promise.all([
    siteImageUrl("hero-cleaner", undefined, { uploadedOnly: true }),
    getWebsiteSettings(),
    getPublishedTestimonials(),
    getPublicHouseholdFeeCents(),
    featuredLiveCleaners(),
  ]);
  const fee = feeCents ? formatEuro(feeCents, locale) : null;

  return (
    <div className="flex flex-col bg-page">
      <div className="order-1"><HomeHero photoUrl={uploadedHero} videoUrl={settings.videoUrl} /></div>
      <div className="order-2 lg:hidden"><MobileSearch modules={settings.modules} /></div>
      <div className="order-3 lg:hidden"><MobileAbout /></div>
      <div className="order-4 lg:order-6"><Why householdFee={fee} /></div>
      <div className="order-5 lg:order-4"><Explore modules={settings.modules} /></div>
      <div className="order-6 bg-white lg:order-5"><FeaturedCleaners cleaners={featured} /></div>
      <div className="order-7"><HowItWorks feeCents={feeCents} /></div>
      <div className="order-8"><BusinessAndCommunity /></div>
      <div className="order-9"><Testimonials items={testimonials} /></div>
      <div className="order-10"><Banner /></div>
    </div>
  );
}
