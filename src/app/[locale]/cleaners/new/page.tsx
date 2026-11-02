import { getTranslations, setRequestLocale } from "next-intl/server";
import { AdWizard, type ExistingAd } from "@/components/cleaners/AdWizard";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { profilePhotoUrl } from "@/lib/cleaners-live";

export const dynamic = "force-dynamic";

const euro = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

export default async function NewCleanerAdPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("wizard");
  const user = await getSessionUser();

  // The cleaner's own ad (any status) pre-fills the wizard.
  let existing: ExistingAd | null = null;
  const supabase = await createClient();
  if (user && supabase) {
    const { data: ad } = await supabase
      .from("cleaner_profiles")
      .select("id, status, rate_cents, min_hours, services, languages, postcode, radius_km, about, photo_path, job_types, kvk_number, emergency_rate_cents, availability_slots ( weekday, block ), vog_documents ( status, issued_at )")
      .eq("user_id", user.id)
      .maybeSingle();
    if (ad) {
      const availability: Record<number, string[]> = {};
      for (const s of (ad.availability_slots as { weekday: number; block: string }[]) ?? []) (availability[s.weekday] ??= []).push(s.block);
      const vog = (ad.vog_documents as { status: string; issued_at: string }[] | null)?.[0];
      existing = {
        adId: ad.id,
        status: ad.status,
        photoUrl: profilePhotoUrl(ad.photo_path),
        vogStatus: vog?.status ?? null,
        draft: {
          name: user.displayName,
          city: "",
          about: ad.about ?? "",
          services: ad.services ?? [],
          languages: ad.languages ?? [],
          jobTypes: ad.job_types ?? ["household"],
          kvkNumber: ad.kvk_number ?? "",
          emergencyRateEuro: ad.emergency_rate_cents ? euro(ad.emergency_rate_cents) : "",
          rateEuro: euro(ad.rate_cents),
          minHours: Number(ad.min_hours),
          postcode: ad.postcode,
          radiusKm: ad.radius_km,
          availability,
          vogIssuedAt: vog?.issued_at ?? "",
        } as ExistingAd["draft"],
      };
      const { data: profile } = await supabase.from("profiles").select("city").eq("id", user.id).maybeSingle();
      if (profile?.city) existing.draft.city = profile.city;
    }
  }

  return (
    <section className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="headline text-3xl text-ink">{existing ? t("myAdTitle") : t("title")}</h1>
      <p className="mt-2 text-ink/70">{existing ? t("myAdIntro") : t("intro")}</p>
      <div className="mt-6">
        <AdWizard signedIn={Boolean(user)} existing={existing} />
      </div>
    </section>
  );
}
