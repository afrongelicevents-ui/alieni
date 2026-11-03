import { getTranslations, setRequestLocale } from "next-intl/server";
import { AdWizard, type ExistingAd } from "@/components/cleaners/AdWizard";
import { requireRole } from "@/lib/guard";
import { createClient } from "@/lib/supabase/server";
import { profilePhotoUrl } from "@/lib/cleaners-live";

export const dynamic = "force-dynamic";

const euro = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

/** The cleaner's professional profile: create it, edit it, go online or offline. */
export default async function CleanerProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ step?: string; edit?: string }>;
}) {
  const { locale } = await params;
  const { step, edit } = await searchParams;
  setRequestLocale(locale);
  const user = await requireRole(locale, ["cleaner"], "/profile");
  const t = await getTranslations("wizard");
  const supabase = (await createClient())!;

  let existing: ExistingAd | null = null;
  const { data: ad } = await supabase
    .from("cleaner_profiles")
    .select("id, status, rate_cents, min_hours, services, languages, postcode, radius_km, about, photo_path, job_types, works_as, emergency_rate_cents, experience_years, work_scope, work_types, availability_slots ( weekday, block ), vog_documents ( status, issued_at )")
    .eq("user_id", user.id)
    .maybeSingle();
  if (ad) {
    const availability: Record<number, string[]> = {};
    for (const s of (ad.availability_slots as { weekday: number; block: string }[]) ?? []) (availability[s.weekday] ??= []).push(s.block);
    const vog = (ad.vog_documents as { status: string; issued_at: string }[] | null)?.[0];
    const { data: profile } = await supabase.from("profiles").select("city").eq("id", user.id).maybeSingle();
    existing = {
      adId: ad.id,
      status: ad.status,
      photoUrl: profilePhotoUrl(ad.photo_path),
      vogStatus: vog?.status ?? null,
      draft: {
        name: user.displayName,
        city: profile?.city ?? "",
        about: ad.about ?? "",
        services: ad.services ?? [],
        languages: ad.languages ?? [],
        jobTypes: ad.job_types ?? ["household"],
        workScope: ad.work_scope ?? "household",
        workTypes: ad.work_types?.length ? ad.work_types : ["household_regular"],
        experienceYears: ad.experience_years ?? null,
        worksAs: (ad.works_as ?? "") as "" | "independent" | "company",
        emergencyRateEuro: ad.emergency_rate_cents ? euro(ad.emergency_rate_cents) : "",
        rateEuro: euro(ad.rate_cents),
        minHours: Number(ad.min_hours),
        postcode: ad.postcode,
        radiusKm: ad.radius_km,
        availability,
        vogIssuedAt: vog?.issued_at ?? "",
      } as ExistingAd["draft"],
    };
  }

  return (
    <section className="mx-auto max-w-2xl px-4 py-8">
      <p className="text-xs font-bold uppercase tracking-wide text-forest">{t("eyebrow")}</p>
      <h1 className="headline mt-1 text-3xl text-ink">{existing ? t("myAdTitle") : t("title")}</h1>
      <p className="mt-2 text-ink/70">{existing ? t("myAdIntro") : t("intro")}</p>
      <div className="mt-6">
        <AdWizard signedIn existing={existing} initialStep={step ? Number(step) : undefined} startEditing={edit === "1"} />
      </div>
    </section>
  );
}
