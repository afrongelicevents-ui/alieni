"use client";

import { useLocale } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

/** NL/EN switch. `tone="dark"` for navy backgrounds; `compact` for the utility bar. */
export function LocaleSwitcher({ tone = "light", compact = false }: { tone?: "light" | "dark"; compact?: boolean }) {
  const pathname = usePathname();
  const current = useLocale();
  const size = compact ? "min-h-8 min-w-9 text-xs" : "min-h-11 min-w-11 text-sm";

  return (
    <nav aria-label="Taal / Language" className="flex gap-1">
      {routing.locales.map((locale) => {
        const active = locale === current;
        const colours =
          tone === "dark"
            ? active ? "bg-white text-navy" : "text-white hover:bg-white/10"
            : active ? "bg-navy text-white" : "text-navy hover:bg-tint";
        return (
          <Link
            key={locale}
            href={pathname}
            locale={locale}
            // No prefetch: the default-locale link (/nl → /) answers with a
            // redirect, which the router would otherwise keep re-prefetching.
            prefetch={false}
            aria-current={active ? "true" : undefined}
            className={`flex items-center justify-center rounded-full font-bold uppercase ${size} ${colours}`}
          >
            {locale}
          </Link>
        );
      })}
    </nav>
  );
}
