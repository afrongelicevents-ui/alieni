"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

const ITEMS = [
  { href: "/business/dashboard", key: "dashboardTitle" },
  { href: "/business/requests", key: "navRequests" },
  { href: "/business/work", key: "navWork" },
  { href: "/business/billing", key: "navBilling" },
  { href: "/business/calendar", key: "navCalendar" },
  { href: "/business/profile", key: "navProfile" },
] as const;

/** The tab row itself (client side, for the active tab). The server wrapper decides whether Calendar is shown. */
export function BusinessSubnavLinks({ showCalendar }: { showCalendar: boolean }) {
  const t = useTranslations("business");
  const pathname = usePathname();
  return (
    <nav aria-label={t("dashboardTitle")} className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {ITEMS.filter((i) => showCalendar || i.href !== "/business/calendar").map((i) => {
        const active = pathname === i.href;
        return (
          <Link key={i.href} href={i.href} aria-current={active ? "page" : undefined}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${active ? "bg-forest text-white" : "border border-line bg-white text-forest hover:bg-mint"}`}>
            {t(i.key)}
          </Link>
        );
      })}
    </nav>
  );
}
