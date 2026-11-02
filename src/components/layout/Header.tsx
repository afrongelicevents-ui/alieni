"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { LogoLockup } from "@/components/brand/Logo";
import { ButtonLink } from "@/components/ui/Button";
import { NAV } from "@/lib/nav";
import { useNavRole } from "./useNavRole";

/** Header with role-specific navigation. Guests get Log in / Sign up. */
export function Header() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const role = useNavRole();
  const [menuOpen, setMenuOpen] = useState(false);
  const items = NAV[role ?? "guest"].filter((i) => i.key !== "login");
  const signedIn = role !== null && role !== "guest";

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2">
          <button type="button" aria-label={t("menu")} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)} className="flex h-11 w-11 items-center justify-center rounded-full text-forest hover:bg-mint md:hidden">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </button>
          <Link href={signedIn ? items[0].href : "/"} aria-label="Alieni — home">
            <LogoLockup />
          </Link>
        </div>

        <nav className="hidden items-center gap-6 text-sm font-semibold text-forest md:flex">
          {items.map(({ href, key }) => (
            <Link key={href} href={href} className={`hover:underline ${pathname === href ? "underline underline-offset-4" : ""}`}>
              {t(key)}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {role === null ? null : signedIn ? (
            <ButtonLink href={items[items.length - 1].href} variant="dark" className="px-5 py-2">
              {t(role === "admin" ? "admin" : "account")}
            </ButtonLink>
          ) : (
            <>
              <ButtonLink href="/login" variant="secondary" className="px-5 py-2">{t("login")}</ButtonLink>
              <ButtonLink href="/signup" variant="dark" className="hidden px-5 py-2 sm:inline-flex">{t("signup")}</ButtonLink>
            </>
          )}
        </div>
      </div>

      {menuOpen ? (
        <nav className="border-t border-line bg-white px-4 py-3 md:hidden">
          <ul className="flex flex-col gap-1 text-base font-semibold text-forest">
            {[...items, ...(signedIn ? [] : [{ href: "/signup", key: "signup" }])].map(({ href, key }) => (
              <li key={href}>
                <Link href={href} onClick={() => setMenuOpen(false)} className="block rounded-xl px-3 py-2.5 hover:bg-mint">
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
