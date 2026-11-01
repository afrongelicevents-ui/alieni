"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

const items = [
  {
    href: "/",
    key: "nav.home",
    icon: (
      <path d="M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    ),
  },
  {
    href: "/search",
    key: "nav.search",
    icon: (
      <path d="M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Zm9.5 3-4.9-4.9" strokeWidth="2" strokeLinecap="round" />
    ),
  },
  {
    href: "/jobs",
    key: "nav.jobs",
    icon: (
      <path d="M4 8h16v11H4V8Zm5 0V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M4 12h16" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    ),
  },
  {
    href: "/favourites",
    key: "nav.favourites",
    icon: (
      <path d="M12 20s-7.5-4.6-9.3-9A5 5 0 0 1 12 6.4 5 5 0 0 1 21.3 11c-1.8 4.4-9.3 9-9.3 9Z" strokeWidth="2" strokeLinejoin="round" />
    ),
  },
  {
    href: "/account",
    key: "nav.account",
    icon: (
      <path d="M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-7 9a7 7 0 0 1 14 0" strokeWidth="2" strokeLinecap="round" />
    ),
  },
] as const;

export function BottomNav() {
  const t = useTranslations();
  const pathname = usePathname();

  return (
    <nav
      aria-label={t("nav.menu")}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="flex">
        {items.map(({ href, key, icon }) => {
          const active = pathname === href;
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${
                  active ? "text-forest" : "text-ink/60"
                }`}
              >
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" aria-hidden="true">
                  {icon}
                </svg>
                {t(key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
