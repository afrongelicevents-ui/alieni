import { getTranslations, setRequestLocale } from "next-intl/server";
import { FavouritesList } from "@/components/cleaners/FavouritesList";
import { CleanerCard } from "@/components/cleaners/CleanerCard";
import { ButtonLink } from "@/components/ui/Button";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchLiveCleaners } from "@/lib/cleaners-live";

export const dynamic = "force-dynamic";

export default async function FavouritesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("favourites");
  const user = await getSessionUser();

  // Signed in: favourites table joined with the published ads.
  let saved: Awaited<ReturnType<typeof fetchLiveCleaners>> = null;
  if (user) {
    const supabase = await createClient();
    const { data } = await supabase!.from("favourites").select("cleaner_profile_id").eq("user_id", user.id);
    const ids = new Set((data ?? []).map((r: { cleaner_profile_id: string }) => r.cleaner_profile_id));
    const live = (await fetchLiveCleaners()) ?? [];
    saved = live.filter((c) => ids.has(c.id));
  }

  return (
    <section className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="headline text-3xl text-ink">{t("title")}</h1>
      <div className="mt-6">
        {saved ? (
          saved.length === 0 ? (
            <div className="flex flex-col items-center gap-4 py-16 text-center">
              <p className="max-w-sm text-ink/70">{t("empty")}</p>
              <ButtonLink href="/search" variant="secondary">{t("browse")}</ButtonLink>
            </div>
          ) : (
            <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {saved.map((cleaner) => (
                <li key={cleaner.id}>
                  <CleanerCard cleaner={cleaner} />
                </li>
              ))}
            </ul>
          )
        ) : (
          <>
            <p className="mb-4 rounded-xl bg-sun/25 p-3 text-sm text-ink/80">{t("deviceNote")}</p>
            <FavouritesList />
          </>
        )}
      </div>
    </section>
  );
}
