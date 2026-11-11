"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

type Props = { tone?: "light" | "dark"; compact?: boolean };

/** NL/EN switch. `tone="dark"` for navy backgrounds; `compact` for the desktop utility bar. */
function Switcher({ search, tone = "light", compact = false }: Props & { search: URLSearchParams | null }) {
  const pathname = usePathname();
  const current = useLocale();
  const size = compact ? "min-h-8 min-w-9 text-xs" : "min-h-11 min-w-11 text-sm";

  // Keep the query string (filters, ?tab=, ?next=) when switching language.
  const query: Record<string, string | string[]> = {};
  search?.forEach((value, key) => {
    const prev = query[key];
    query[key] = prev === undefined ? value : Array.isArray(prev) ? [...prev, value] : [prev, value];
  });

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
            href={{ pathname, query }}
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

function WithSearchParams(props: Props) {
  return <Switcher {...props} search={useSearchParams()} />;
}

export function LocaleSwitcher(props: Props) {
  // useSearchParams needs a Suspense boundary on statically rendered pages.
  return (
    <Suspense fallback={<Switcher {...props} search={null} />}>
      <WithSearchParams {...props} />
    </Suspense>
  );
}
