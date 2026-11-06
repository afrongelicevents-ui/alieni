import { setRequestLocale } from "next-intl/server";
import { Hero } from "@/components/home/Hero";
import { siteImageUrl } from "@/lib/site-media";
import { AudienceCards } from "@/components/home/AudienceCards";
import { TrustStrip } from "@/components/home/TrustStrip";
import { FeaturedCleaners } from "@/components/home/FeaturedCleaners";
import { HowItWorks } from "@/components/home/HowItWorks";
import { ConfidenceBanner } from "@/components/home/ConfidenceBanner";
import { getPublicHouseholdFeeCents } from "@/lib/site-settings";
import { fetchLiveCleaners } from "@/lib/cleaners-live";
import { createClient } from "@/lib/supabase/server";
import type { SampleCleaner } from "@/lib/sample-data";

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

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const heroImage = await siteImageUrl("hero-cleaner");
  const feeCents = await getPublicHouseholdFeeCents();
  const featured = await featuredLiveCleaners();

  return (
    <>
      <Hero imageUrl={heroImage} />
      <AudienceCards />
      <TrustStrip />
      <FeaturedCleaners cleaners={featured} />
      <HowItWorks feeCents={feeCents} />
      <ConfidenceBanner />
    </>
  );
}
