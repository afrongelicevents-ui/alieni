"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

function Switcher({ search }: { search: URLSearchParams | null }) {
  const pathname = usePathname();
  const current = useLocale();

  // Keep the query string (filters, ?tab=, ?next=) when switching language.
  const query: Record<string, string | string[]> = {};
  search?.forEach((value, key) => {
    const prev = query[key];
    query[key] = prev === undefined ? value : Array.isArray(prev) ? [...prev, value] : [prev, value];
  });

  return (
    <nav aria-label="Taal / Language" className="flex gap-1">
      {routing.locales.map((locale) => (
        <Link
          key={locale}
          href={{ pathname, query }}
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

function WithSearchParams() {
  return <Switcher search={useSearchParams()} />;
}

export function LocaleSwitcher() {
  // useSearchParams needs a Suspense boundary on statically rendered pages.
  return (
    <Suspense fallback={<Switcher search={null} />}>
      <WithSearchParams />
    </Suspense>
  );
}
