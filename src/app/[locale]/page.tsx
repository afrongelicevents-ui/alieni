import { setRequestLocale } from "next-intl/server";
import { siteImageUrl } from "@/lib/site-media";
import { getWebsiteSettings } from "@/lib/site-settings";
import { getPublishedTestimonials } from "@/lib/testimonials";
import { HomeHero } from "@/components/site/home/HomeHero";
import { Banner, BusinessAndCommunity, Explore, MobileAbout, MobileSearch, Testimonials, Why } from "@/components/site/home/HomeSections";

/**
 * Homepage. One page, two arrangements (brief §2 desktop / §3 mobile):
 * mobile reads hero → search → categories → about → why → explore → businesses;
 * desktop reads hero → explore → why → businesses & cleaners → banner.
 */
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [uploadedHero, settings, testimonials] = await Promise.all([
    siteImageUrl("hero-cleaner", undefined, { uploadedOnly: true }),
    getWebsiteSettings(),
    getPublishedTestimonials(),
  ]);
  const fee = new Intl.NumberFormat(locale === "en" ? "en-NL" : "nl-NL", { style: "currency", currency: "EUR" }).format(settings.householdFeeCents / 100);

  return (
    <div className="flex flex-col bg-page">
      <div className="order-1"><HomeHero photoUrl={uploadedHero} videoUrl={settings.videoUrl} /></div>
      <div className="order-2 lg:hidden"><MobileSearch modules={settings.modules} /></div>
      <div className="order-3 lg:hidden"><MobileAbout /></div>
      <div className="order-4 lg:order-5"><Why householdFee={fee} /></div>
      <div className="order-5 lg:order-4"><Explore modules={settings.modules} /></div>
      <div className="order-6"><BusinessAndCommunity /></div>
      <div className="order-7"><Testimonials items={testimonials} /></div>
      <div className="order-8"><Banner /></div>
    </div>
  );
}
