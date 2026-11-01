import { getTranslations, setRequestLocale } from "next-intl/server";
import { FavouritesList } from "@/components/cleaners/FavouritesList";

export default async function FavouritesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("favourites");

  return (
    <section className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="headline text-3xl text-ink">{t("title")}</h1>
      <div className="mt-6">
        <FavouritesList />
      </div>
    </section>
  );
}
