"use client";

import { useTranslations } from "next-intl";
import { useFavourites } from "@/lib/favourites";
import { SAMPLE_CLEANERS } from "@/lib/sample-data";
import { CleanerCard } from "./CleanerCard";
import { ButtonLink } from "@/components/ui/Button";

export function FavouritesList() {
  const t = useTranslations("favourites");
  const { ids, loaded } = useFavourites();

  if (!loaded) return null;

  const cleaners = SAMPLE_CLEANERS.filter((c) => ids.includes(c.id));

  if (cleaners.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <svg viewBox="0 0 24 24" className="h-12 w-12 text-forest/30" fill="currentColor" aria-hidden="true">
          <path d="M12 20s-7.5-4.6-9.3-9A5 5 0 0 1 12 6.4 5 5 0 0 1 21.3 11c-1.8 4.4-9.3 9-9.3 9Z" />
        </svg>
        <p className="max-w-sm text-ink/70">{t("empty")}</p>
        <ButtonLink href="/search" variant="secondary">
          {t("browse")}
        </ButtonLink>
      </div>
    );
  }

  return (
    <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {cleaners.map((cleaner) => (
        <li key={cleaner.id}>
          <CleanerCard cleaner={cleaner} />
        </li>
      ))}
    </ul>
  );
}
