import { getTranslations } from "next-intl/server";
import { ButtonLink } from "@/components/ui/Button";
import { getSessionUser } from "@/lib/auth";

function HouseIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-12 w-12 text-forest" fill="currentColor" aria-hidden="true">
      <path d="M6 22 24 7l18 15v17a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V22Z" />
      <rect x="19" y="24" width="10" height="10" rx="1.5" fill="#2E8BFF" />
    </svg>
  );
}

function CleanerIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-12 w-12 text-forest" fill="currentColor" aria-hidden="true">
      <circle cx="24" cy="14" r="7" />
      <path d="M24 5a8 8 0 0 1 8 7H16a8 8 0 0 1 8-7Z" fill="#2E8BFF" />
      <path d="M10 41a14 14 0 0 1 28 0v2H10v-2Z" />
    </svg>
  );
}

function BuildingIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-12 w-12 text-forest" fill="currentColor" aria-hidden="true">
      <rect x="8" y="12" width="16" height="29" rx="1.5" />
      <rect x="27" y="20" width="13" height="21" rx="1.5" opacity="0.85" />
      <rect x="12" y="17" width="3.5" height="3.5" fill="#2E8BFF" />
      <rect x="18" y="17" width="3.5" height="3.5" fill="#EEF6F0" />
      <rect x="12" y="24" width="3.5" height="3.5" fill="#EEF6F0" />
      <rect x="18" y="24" width="3.5" height="3.5" fill="#EEF6F0" />
      <rect x="31" y="24" width="3.5" height="3.5" fill="#EEF6F0" />
    </svg>
  );
}

export async function AudienceCards() {
  const t = await getTranslations("home");
  // guests (and other roles) start a cleaner account; a signed-in cleaner goes straight to their profile
  const user = await getSessionUser();
  const cleanerHref = user?.role === "cleaner" ? "/profile" : "/signup?role=cleaner";

  const cards = [
    {
      icon: <HouseIcon />,
      title: t("householdsTitle"),
      text: t("householdsText"),
      cta: t("householdsCta"),
      href: "/search",
    },
    {
      icon: <CleanerIcon />,
      title: t("cleanersTitle"),
      text: t("cleanersText"),
      cta: t("cleanersCta"),
      href: cleanerHref,
    },
    {
      icon: <BuildingIcon />,
      title: t("businessesTitle"),
      text: t("businessesText"),
      cta: t("businessesCta"),
      href: "/business",
      desktopOnly: true,
    },
  ];

  return (
    <section className="mx-auto max-w-6xl px-4 py-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <article
            key={card.title}
            className={`flex flex-col items-center gap-3 rounded-card-lg border border-forest/30 bg-mint p-6 text-center ${
              card.desktopOnly ? "hidden lg:flex" : "flex"
            }`}
          >
            {card.icon}
            <h2 className="headline text-xl text-ink">{card.title}</h2>
            <p className="text-sm text-ink/70">{card.text}</p>
            <ButtonLink href={card.href} withArrow className="mt-2">
              {card.cta}
            </ButtonLink>
          </article>
        ))}
      </div>
    </section>
  );
}
