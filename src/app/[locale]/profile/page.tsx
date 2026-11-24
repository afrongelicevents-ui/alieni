import { getTranslations, setRequestLocale } from "next-intl/server";
import { AdWizard, type ExistingAd } from "@/components/cleaners/AdWizard";
import { requireRole } from "@/lib/guard";
import { all, first, json } from "@/lib/server/db";
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
  const nextQuery = new URLSearchParams();
  if (step) nextQuery.set("step", step);
  if (edit) nextQuery.set("edit", edit);
  const user = await requireRole(locale, ["cleaner"], `/profile${nextQuery.size ? `?${nextQuery}` : ""}`, { adminAllowed: false });
  const t = await getTranslations("wizard");

  let existing: ExistingAd | null = null;
  // Only the signed-in cleaner's own ad (user_id = session user); the full postcode is shown to its owner only.
  const ad = await first<{ id: string; status: string; rate_cents: number; min_hours: number; services: string; languages: string; radius_km: number; about: string | null;
    photo_key: string | null; job_types: string; works_as: string | null; experience_years: number | null; work_scope: string | null; work_types: string; postcode: string; city: string | null }>(
    `SELECT cp.id, cp.status, cp.rate_cents, cp.min_hours, cp.services, cp.languages, cp.radius_km, cp.about, cp.photo_key, cp.job_types, cp.works_as,
            cp.experience_years, cp.work_scope, cp.work_types, cp.postcode, p.city
     FROM cleaner_profiles cp JOIN profiles p ON p.id = cp.user_id WHERE cp.user_id = ?`, user.id);
  if (ad) {
    const availability: Record<number, string[]> = {};
    for (const s of await all<{ weekday: number; block: string }>("SELECT weekday, block FROM availability_slots WHERE cleaner_profile_id = ?", ad.id)) (availability[s.weekday] ??= []).push(s.block);
    const workTypes = json<string[]>(ad.work_types, []);
    existing = {
      adId: ad.id,
      status: ad.status,
      photoUrl: await profilePhotoUrl(ad.photo_key),
      draft: {
        name: user.displayName,
        city: ad.city ?? "",
        about: ad.about ?? "",
        services: json<string[]>(ad.services, []),
        languages: json<string[]>(ad.languages, []),
        jobTypes: json<string[]>(ad.job_types, ["household"]),
        workScope: ad.work_scope ?? "household",
        workTypes: workTypes.length ? workTypes : ["household_regular"],
        experienceYears: ad.experience_years ?? null,
        worksAs: (ad.works_as ?? "") as "" | "independent" | "company",
        rateEuro: euro(ad.rate_cents),
        minHours: Number(ad.min_hours),
        postcode: ad.postcode ?? "",
        radiusKm: ad.radius_km,
        availability,
      } as ExistingAd["draft"],
    };
  }

  return (
    <section className="mx-auto max-w-2xl px-4 py-8">
      <p className="text-xs font-bold uppercase tracking-wide text-forest">{t("eyebrow")}</p>
      <h1 className="headline mt-1 text-3xl text-ink">{existing ? t("myAdTitle") : t("title")}</h1>
      <p className="mt-2 text-ink/70">{existing ? t("myAdIntro") : t("intro")}</p>
      <div className="mt-6">
        <AdWizard existing={existing} initialStep={step ? Number(step) : undefined} startEditing={edit === "1"} />
      </div>
    </section>
  );
}
