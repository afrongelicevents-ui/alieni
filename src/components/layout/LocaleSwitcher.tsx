"use client";

import { useLocale } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

export function LocaleSwitcher() {
  const pathname = usePathname();
  const current = useLocale();

  return (
    <nav aria-label="Taal / Language" className="flex gap-1">
      {routing.locales.map((locale) => (
        <Link
          key={locale}
          href={pathname}
          locale={locale}
          aria-current={locale === current ? "true" : undefined}
          className={`flex min-h-11 min-w-11 items-center justify-center rounded-full text-sm font-bold uppercase ${
            locale === current ? "bg-forest text-white" : "text-forest hover:bg-mint"
          }`}
        >
          {locale}
        </Link>
      ))}
    </nav>
  );
}
