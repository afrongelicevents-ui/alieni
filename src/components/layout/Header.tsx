"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { LogoLockup } from "@/components/brand/Logo";
import { ButtonLink } from "@/components/ui/Button";

export function Header() {
  const t = useTranslations();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={t("nav.menu")}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className="flex h-11 w-11 items-center justify-center rounded-full text-forest hover:bg-mint md:hidden"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
              <path
                d="M4 7h16M4 12h16M4 17h16"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <Link href="/" aria-label="Alieni — home">
            <LogoLockup />
          </Link>
        </div>

        <nav className="hidden items-center gap-6 text-sm font-semibold text-forest md:flex">
          <Link href="/search" className="hover:underline">
            {t("nav.search")}
          </Link>
          <Link href="/jobs" className="hover:underline">
            {t("nav.jobs")}
          </Link>
          <Link href="/favourites" className="hover:underline">
            {t("nav.favourites")}
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <ButtonLink href="/login" variant="secondary" className="px-5 py-2">
            {t("nav.login")}
          </ButtonLink>
          <ButtonLink href="/signup" variant="dark" className="hidden px-5 py-2 sm:inline-flex">
            {t("nav.signup")}
          </ButtonLink>
        </div>
      </div>

      {menuOpen ? (
        <nav className="border-t border-line bg-white px-4 py-3 md:hidden">
          <ul className="flex flex-col gap-1 text-base font-semibold text-forest">
            {(
              [
                ["/", "nav.home"],
                ["/search", "nav.search"],
                ["/jobs", "nav.jobs"],
                ["/favourites", "nav.favourites"],
                ["/account", "nav.account"],
                ["/signup", "nav.signup"],
              ] as const
            ).map(([href, key]) => (
              <li key={href}>
                <Link
                  href={href}
                  onClick={() => setMenuOpen(false)}
                  className="block rounded-xl px-3 py-2.5 hover:bg-mint"
                >
                  {t(key)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
