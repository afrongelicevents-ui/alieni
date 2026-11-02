"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { ICON_PATHS, NAV } from "@/lib/nav";
import { useNavRole } from "./useNavRole";

export function BottomNav() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const role = useNavRole();
  const items = NAV[role ?? "guest"];

  return (
    <nav aria-label={t("menu")} className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
      <ul className="flex">
        {items.map(({ href, key, icon }) => {
          const active = pathname === href || (href !== "/" && pathname.startsWith(href + "/"));
          return (
            <li key={href} className="flex-1">
              <Link href={href} aria-current={active ? "page" : undefined} className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${active ? "text-forest" : "text-ink/70"}`}>
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" aria-hidden="true">
                  <path d={ICON_PATHS[icon]} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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
