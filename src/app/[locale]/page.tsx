import { setRequestLocale } from "next-intl/server";
import { Hero } from "@/components/home/Hero";
import { AudienceCards } from "@/components/home/AudienceCards";
import { TrustStrip } from "@/components/home/TrustStrip";
import { FeaturedCleaners } from "@/components/home/FeaturedCleaners";
import { HowItWorks } from "@/components/home/HowItWorks";
import { ConfidenceBanner } from "@/components/home/ConfidenceBanner";

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <Hero />
      <AudienceCards />
      <TrustStrip />
      <FeaturedCleaners />
      <HowItWorks />
      <ConfidenceBanner />
    </>
  );
}
