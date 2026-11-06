"use client";

import { useTranslations } from "next-intl";
import { useFavourites } from "@/lib/favourites";
import { useNavRole } from "@/components/layout/useNavRole";

export function FavouriteButton({ cleanerId, className = "" }: { cleanerId: string; className?: string }) {
  const t = useTranslations("common");
  const { has, toggle, loaded } = useFavourites();
  const role = useNavRole();
  const active = loaded && has(cleanerId);

  // cleaners and admins have no favourites: guests, households and businesses keep the heart
  if (role === "cleaner" || role === "admin") return null;

  return (
    <button
      type="button"
      aria-label={active ? t("unfavourite") : t("favourite")}
      aria-pressed={active}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(cleanerId);
      }}
      className={`flex h-11 w-11 items-center justify-center rounded-full text-forest transition-colors hover:bg-mint ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill={active ? "currentColor" : "none"}
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          d="M12 20s-7.5-4.6-9.3-9A5 5 0 0 1 12 6.4 5 5 0 0 1 21.3 11c-1.8 4.4-9.3 9-9.3 9Z"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
