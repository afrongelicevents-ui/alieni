import { useLocale } from "next-intl";
import { BUSINESS_TYPES, type BusinessType } from "@/lib/business";
import type { BusinessQuote } from "@/lib/business-pricing";
import { BusinessPrice } from "./BusinessPrice";

const ICONS: Record<BusinessType, React.ReactNode> = {
  airbnb: <path d="M4 11.5 12 5l8 6.5V20H4v-8.5Zm5 8.5v-5h6v5" strokeWidth="2" strokeLinejoin="round" />,
  hotel: <path d="M4 20V5h16v15M4 11h16M8 8h2m4 0h2M8 15h2m4 0h2M10 20v-3h4v3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
  restaurant: <path d="M7 3v8a2 2 0 0 0 2 2v8M5 3v5m4-5v5M16 3c-2 0-3 2-3 5s1 4 3 4v9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
  office: <path d="M4 21V4h11v17M15 9h5v12M7 8h2m-2 4h2m-2 4h2m2-8h2m-2 4h2m-2 4h2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
  school: <path d="M3 9l9-5 9 5-9 5-9-5Zm3 3v5c2 2 4 3 6 3s4-1 6-3v-5M21 9v6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
};

export function BusinessTypeIcon({ type, className = "h-8 w-8" }: { type: BusinessType; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" aria-hidden="true">
      {ICONS[type]}
    </svg>
  );
}

/** `quote` is what this type pays under the chosen business pricing model (Admin → Settings); none = "price to be announced". */
export function BusinessTypeCard({
  type,
  quote = { kind: "tba" },
  selected,
  compact,
}: {
  type: BusinessType;
  quote?: BusinessQuote;
  selected?: boolean;
  compact?: boolean;
}) {
  const lang = (useLocale() === "en" ? "en" : "nl") as "nl" | "en";
  const cfg = BUSINESS_TYPES[type];

  return (
    <div
      className={`flex h-full flex-col gap-2 rounded-card-lg border-2 p-5 transition-colors ${
        selected ? "border-forest bg-mint" : "border-line bg-white"
      }`}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-mint text-forest">
        <BusinessTypeIcon type={type} className="h-7 w-7" />
      </span>
      <h3 className="text-lg font-extrabold text-ink">{cfg.label[lang]}</h3>
      {!compact ? <p className="text-sm text-ink/70">{cfg.audience[lang]}</p> : null}
      <div className="mt-auto pt-2">
        <BusinessPrice quote={quote} unit={cfg.unit[lang]} variant="card" from={quote.kind === "tier"} />
      </div>
    </div>
  );
}
