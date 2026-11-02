import { useTranslations } from "next-intl";

/*
 * Trust strip. Per decision 2026-11-01: no "Verified"/"Vetted" claims until
 * verification is defined — we use "Real client reviews", which is true from
 * day one because reviews only come from confirmed in-app deals.
 */
export function TrustStrip() {
  const t = useTranslations("home");

  const items = [
    {
      label: t("trustSafe"),
      icon: (
        <path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3Zm-3 9 2.2 2.2L15.5 10" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      ),
    },
    {
      label: t("trustReviews"),
      icon: (
        <path d="M12 4.5l2.1 4.4 4.9.7-3.5 3.4.8 4.8L12 15.5l-4.3 2.3.8-4.8L5 9.6l4.9-.7L12 4.5Z" strokeWidth="2" strokeLinejoin="round" />
      ),
    },
    {
      label: t("trustFlexible"),
      icon: (
        <path d="M7 11l3.5 3.5L17 8m-9.5 8.5h9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      ),
    },
  ];

  return (
    <section className="mx-auto max-w-6xl px-4 py-2">
      <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-3 rounded-card-lg bg-section px-4 py-4 sm:flex-nowrap sm:justify-around">
        {items.map((item, i) => (
          <li key={item.label} className={`flex min-w-0 items-center gap-2.5 ${i > 0 ? "sm:border-l sm:border-line sm:pl-6" : ""}`}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-forest text-white">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" aria-hidden="true">
                {item.icon}
              </svg>
            </span>
            <span className="text-sm font-bold leading-tight text-ink">{item.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
