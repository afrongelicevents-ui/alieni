import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { Link, getPathname } from "@/i18n/navigation";
import { DESIGN_IMAGES, type DesignImageKey } from "@/lib/design-images";
import { moduleHref, type ModuleKey, type ModuleState } from "@/lib/site-modules";
import type { BusinessPricingModel } from "@/lib/business-pricing";
import { Icon, type IconName } from "@/components/site/Icon";
import { RoundArrow, SoonBadge } from "@/components/site/bits";

type Modules = Record<ModuleKey, ModuleState>;

/** Where a tile goes: a working flow, a live module, or the module's "Notify me" page. */
function tile(modules: Modules, target: { href: string } | { module: ModuleKey }) {
  if ("href" in target) return { href: target.href, soon: false };
  const state = modules[target.module];
  return { href: moduleHref(target.module, state), soon: !state.live };
}

/* ---------------------------------------------------------------- mobile search + icon row */

export async function MobileSearch({ modules }: { modules: Modules }) {
  const tMobileSearch = await getTranslations("site");
  const locale = await getLocale();
  const items: { icon: IconName; label: string; target: { href: string } | { module: ModuleKey } }[] = [
    { icon: "home", label: tMobileSearch("iconRow.find"), target: { href: "/search" } },
    { icon: "building", label: tMobileSearch("iconRow.businesses"), target: { href: "/business" } },
    { icon: "box", label: tMobileSearch("iconRow.suppliers"), target: { module: "suppliers" } },
    { icon: "gear", label: tMobileSearch("iconRow.equipment"), target: { module: "equipment" } },
    { icon: "briefcase", label: tMobileSearch("iconRow.careers"), target: { module: "careers" } },
    { icon: "grid", label: tMobileSearch("iconRow.more"), target: { href: "#explore" } },
  ];
  return (
    <section className="relative z-10 -mt-14 px-4 sm:px-6 lg:hidden">
      <form action={getPathname({ href: "/search", locale })} method="get" role="search" aria-label={tMobileSearch("searchBar.label")} className="mx-auto flex max-w-2xl items-center gap-2 rounded-2xl bg-white p-2 pl-4 shadow-[0_16px_34px_-18px_rgba(11,31,75,0.5)]">
        <Icon name="search" className="h-5 w-5 shrink-0 text-navy" />
        <label className="sr-only" htmlFor="home-search">{tMobileSearch("searchBar.label")}</label>
        <input id="home-search" name="q" type="search" autoComplete="postal-code" placeholder={tMobileSearch("searchBar.placeholder")} className="min-h-11 w-full min-w-0 bg-transparent text-[15px] text-navy outline-none placeholder:text-body" />
        <button type="submit" className="min-h-11 shrink-0 rounded-xl bg-navy px-5 text-sm font-bold text-white">{tMobileSearch("searchBar.button")}</button>
      </form>

      <nav aria-label={tMobileSearch("iconRow.label")} className="mx-auto mt-4 max-w-2xl rounded-2xl border border-edge bg-white">
        <ul className="grid grid-cols-6 py-2">
          {items.map((i, idx) => {
            const { href, soon } = tile(modules, i.target);
            return (
              <li key={i.label} className={idx ? "border-l border-edge" : ""}>
                {href.startsWith("#") ? (
                  <a href={href} className="flex min-h-[68px] flex-col items-center justify-center gap-1.5 px-0.5 text-center text-[11px] font-semibold leading-tight text-navy">
                    <Icon name={i.icon} className="h-7 w-7" />
                    {i.label}
                  </a>
                ) : (
                  <Link href={href} prefetch={soon ? false : undefined} className="relative flex min-h-[68px] flex-col items-center justify-center gap-1.5 px-0.5 text-center text-[11px] font-semibold leading-tight text-navy">
                    <Icon name={i.icon} className="h-7 w-7" />
                    {i.label}
                    {soon ? (
                      <>
                        <span className="absolute right-1.5 top-1 h-2 w-2 rounded-full bg-royal" aria-hidden="true" />
                        <span className="sr-only">({tMobileSearch("soon")})</span>
                      </>
                    ) : null}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
    </section>
  );

}

/* ---------------------------------------------------------------- about (mobile) */

export async function MobileAbout() {
  const tMobileAbout = await getTranslations("site.about");
  return (
    <section className="mx-auto mt-10 grid max-w-2xl grid-cols-[44%_1fr] items-center gap-4 pr-4 sm:pr-6 lg:hidden">
      <div className="relative aspect-[10/11] overflow-hidden rounded-r-[28px]">
        <Image src={DESIGN_IMAGES.aboutLiving.src} alt={tMobileAbout("imageAlt")} fill sizes="45vw" className="object-cover" />
        <svg viewBox="0 0 40 200" preserveAspectRatio="none" className="absolute inset-y-0 right-0 h-full w-7" aria-hidden="true">
          <path d="M40 0H22C34 60 34 140 6 200H40Z" fill="#1667E0" />
          <path d="M40 0H34C40 70 40 140 22 200H40Z" fill="#0B1F4B" />
        </svg>
      </div>
      <div>
        <p className="text-xs font-bold text-royal">{tMobileAbout("eyebrow")}</p>
        <h2 className="headline mt-1.5 text-[1.3rem] leading-tight text-navy">{tMobileAbout("title")}</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-body">{tMobileAbout("text")}</p>
        <Link href="/about" className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-navy px-5 text-sm font-bold text-white">
          {tMobileAbout("cta")} <Icon name="arrow" className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- explore (both) */

const CARDS: { key: string; img: DesignImageKey; target: { href: string } | { module: ModuleKey } }[] = [
  { key: "findCleaners", img: "catFindCleaners", target: { href: "/search" } },
  { key: "companies", img: "catCompanies", target: { href: "/business" } },
  { key: "suppliers", img: "catSuppliers", target: { module: "suppliers" } },
  { key: "linen", img: "catLinen", target: { module: "linen" } },
  { key: "careers", img: "catJobs", target: { module: "careers" } },
  { key: "commercial", img: "catCommercial", target: { href: "/business" } },
];

export async function Explore({ modules }: { modules: Modules }) {
  const tExplore = await getTranslations("site");
  return (
    <section id="explore" className="scroll-mt-20 bg-page pb-14 pt-12 lg:pb-20 lg:pt-10">
      <div className="mx-auto max-w-[1360px] px-4 sm:px-6 lg:px-10">
        <div className="lg:border-b lg:border-edge lg:pb-6">
          <p className="text-sm font-bold text-royal lg:hidden">{tExplore("explore.title")}</p>
          <h2 className="headline mt-1 text-[1.45rem] leading-tight text-navy lg:mt-0 lg:text-[2.4rem]">
            <span className="lg:hidden">{tExplore("explore.mobileTitle")}</span>
            <span className="hidden lg:inline">{tExplore("explore.title")}</span>
          </h2>
          <p className="mt-1 hidden text-lg text-body lg:block">{tExplore("explore.subtitle")}</p>
        </div>

        <ul className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:mt-8 lg:gap-5 xl:grid-cols-3">
          {CARDS.map((card) => {
            const { href, soon } = tile(modules, card.target);
            const img = DESIGN_IMAGES[card.img];
            return (
              <li key={card.key}>
                {/* "Coming soon" pages are not prefetched (rarely visited; see e2e audit note). */}
                <Link href={href} prefetch={soon ? false : undefined} className="group flex h-full flex-col overflow-hidden rounded-2xl border border-edge bg-white transition-colors hover:border-royal lg:h-[104px] lg:flex-row lg:items-center lg:rounded-[14px]">
                  <div className="relative aspect-[2/1] lg:aspect-auto lg:h-full lg:w-[38%] lg:shrink-0">
                    <Image src={img.src} alt="" fill sizes="(min-width: 1024px) 200px, 45vw" className="object-cover" />
                    {soon ? <SoonBadge label={tExplore("soon")} className="absolute left-2 top-2" /> : null}
                  </div>
                  <div className="flex flex-1 items-end justify-between gap-2 p-3 lg:items-center lg:gap-3 lg:px-5">
                    <div>
                      <h3 className="text-[14px] font-bold leading-tight text-navy lg:text-lg">{tExplore(`cards.${card.key}.t`)}</h3>
                      <p className="mt-0.5 flex items-center gap-1.5 text-[13px] font-medium text-royal lg:mt-1 lg:text-[15px]">
                        {tExplore(`cards.${card.key}.s`)} <Icon name="arrow" className="hidden h-4 w-4 lg:block" />
                      </p>
                    </div>
                    <RoundArrow className="h-8 w-8 lg:h-10 lg:w-10" />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- why (both) */

/** `householdFee` is the formatted monthly price while charging is active; null keeps the copy price-neutral. */
export async function Why({ householdFee }: { householdFee: string | null }) {
  const tWhy = await getTranslations("site.why");
  const items = [...(tWhy.raw("items") as { t: string; d: string }[])];
  if (householdFee) items[2] = tWhy.raw("itemPriced") as { t: string; d: string };
  return (
    <section className="bg-page px-4 pt-10 sm:px-6 lg:bg-white lg:px-0 lg:py-20">
      <div className="mx-auto max-w-2xl rounded-[22px] bg-navy px-5 py-6 text-white lg:grid lg:max-w-[1360px] lg:grid-cols-[1fr_2fr] lg:items-start lg:gap-12 lg:rounded-none lg:bg-transparent lg:px-10 lg:py-0 lg:text-navy">
        <div>
          <h2 className="headline text-[1.85rem] lg:text-[2.6rem]">
            {tWhy("pre")} <span className="text-bright lg:text-royal">{tWhy("accent")}</span>
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-white/85 lg:mt-4 lg:max-w-sm lg:text-lg lg:text-body">{tWhy("text")}</p>
          <Link href="/signup" className="mt-5 hidden min-h-12 items-center gap-2 rounded-full bg-royal px-6 font-bold text-white hover:bg-royal-dark lg:inline-flex">
            {tWhy("cta")} <Icon name="arrow" className="h-5 w-5" />
          </Link>
        </div>
        <dl className="mt-4 divide-y divide-white/15 lg:mt-0 lg:grid lg:grid-cols-2 lg:gap-x-12 lg:divide-y-0">
          {items.map((i) => (
            <div key={i.t} className="py-3.5 lg:border-t-2 lg:border-navy lg:py-6">
              <dt className="font-bold leading-snug lg:text-xl lg:font-extrabold lg:tracking-[-0.01em]">{householdFee ? i.t.replace("{price}", householdFee) : i.t}</dt>
              <dd className="mt-1 text-[13px] leading-relaxed text-white/75 lg:mt-2 lg:text-[15px] lg:text-body">{i.d}</dd>
            </div>
          ))}
        </dl>
        <Link href="/signup" className="mt-4 inline-flex min-h-12 items-center gap-2 rounded-full bg-white px-6 text-[15px] font-bold text-navy lg:hidden">
          {tWhy("cta")} <Icon name="arrow" className="h-5 w-5" />
        </Link>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- businesses & cleaners */

/** `pricingModel` is the business pricing model (Admin → Settings); the first business point follows it. */
export async function BusinessAndCommunity({ pricingModel = "per_location" }: { pricingModel?: BusinessPricingModel }) {
  const tBusinessAndCommunity = await getTranslations("site");
  const pointsFor = (k: "biz" | "community") => {
    const points = [...(tBusinessAndCommunity.raw(`${k}.points`) as string[])];
    if (k === "biz") points[0] = tBusinessAndCommunity(`pricingPoint.${pricingModel}`);
    return points;
  };
  const blocks = [
    { k: "biz" as const, dark: true, href: "/business" },
    { k: "community" as const, dark: false, href: "/cleaners/new" },
  ];
  return (
    <section className="bg-page py-10 lg:py-20">
      <div className="mx-auto grid max-w-2xl gap-4 px-4 sm:px-6 lg:max-w-[1360px] lg:grid-cols-2 lg:gap-6 lg:px-10">
        {blocks.map(({ k, dark, href }) => (
          <div key={k} className={`rounded-[22px] p-5 lg:p-10 ${dark ? "bg-navy text-white" : "border border-edge bg-white text-navy"}`}>
            <p className={`text-sm font-bold ${dark ? "text-bright" : "text-royal"}`}>{tBusinessAndCommunity(`${k}.eyebrow`)}</p>
            <h2 className="headline mt-2 max-w-md text-[1.45rem] leading-tight lg:text-[2rem]">{tBusinessAndCommunity(`${k}.title`)}</h2>
            <p className={`mt-2 max-w-md text-sm leading-relaxed lg:mt-3 lg:text-base ${dark ? "text-white/80" : "text-body"}`}>{tBusinessAndCommunity(`${k}.text`)}</p>
            <ul className="mt-4 space-y-2.5 text-sm lg:mt-6 lg:space-y-3 lg:text-base">
              {pointsFor(k).map((p) => (
                <li key={p} className="flex items-center gap-3 font-semibold">
                  <Icon name="check" className={`h-5 w-5 shrink-0 ${dark ? "text-bright" : "text-royal"}`} />
                  {p}
                </li>
              ))}
            </ul>
            <Link href={href} className={`mt-6 inline-flex min-h-12 items-center gap-2 rounded-full px-6 font-bold lg:mt-8 ${dark ? "bg-white text-navy hover:bg-tint" : "bg-royal text-white hover:bg-royal-dark"}`}>
              {tBusinessAndCommunity(`${k}.cta`)} <Icon name="arrow" className="h-5 w-5" />
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- testimonials (only real ones) */

export type Testimonial = { id: string; name: string; role: string | null; city: string | null; quote: string };

export async function Testimonials({ items }: { items: Testimonial[] }) {
  if (items.length === 0) return null; // never show sample testimonials (brief §8)
  const tTestimonials = await getTranslations("site.testimonials");
  return (
    <section className="bg-white py-12 lg:py-20">
      <div className="mx-auto max-w-[1360px] px-4 sm:px-6 lg:px-10">
        <h2 className="headline text-[1.6rem] text-navy lg:text-[2.4rem]">{tTestimonials("title")}</h2>
        <ul className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {items.slice(0, 6).map((x) => (
            <li key={x.id}>
              <figure className="h-full rounded-2xl border border-edge bg-page p-6">
                <blockquote className="text-[15px] leading-relaxed text-navy">“{x.quote}”</blockquote>
                <figcaption className="mt-4 text-sm text-body">
                  <span className="font-bold text-navy">{x.name}</span>
                  {[x.role, x.city].filter(Boolean).length ? ` · ${[x.role, x.city].filter(Boolean).join(", ")}` : ""}
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-body">{tTestimonials("consent")}</p>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- closing banner */

export async function Banner() {
  const tBanner = await getTranslations("site.banner");
  return (
    <section className="bg-page pb-14 lg:pb-20">
      <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:max-w-[1360px] lg:px-10">
        <div className="relative overflow-hidden rounded-[22px] bg-navy lg:flex lg:min-h-[220px] lg:items-center">
          <div className="relative aspect-[2/1] lg:absolute lg:inset-y-0 lg:right-0 lg:aspect-auto lg:w-[48%]">
            <Image src={DESIGN_IMAGES.dutchStreet.src} alt={tBanner("imageAlt")} fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-navy via-navy/10 to-transparent lg:bg-gradient-to-r lg:from-navy lg:via-navy/20" />
          </div>
          <div className="relative flex flex-wrap items-center justify-between gap-6 px-6 pb-8 pt-2 lg:w-[60%] lg:px-12 lg:py-12">
          <div>
            <h2 className="headline text-[1.7rem] leading-tight text-white lg:text-[2.3rem]">
              {tBanner("pre")}
              <br />
              <span className="text-bright">{tBanner("accent")}</span>
            </h2>
            <p className="mt-2 max-w-sm text-sm text-white/85 lg:text-base">{tBanner("text")}</p>
          </div>
          <Link href="/signup" className="inline-flex min-h-[52px] items-center gap-2 rounded-full bg-white px-7 font-bold text-navy hover:bg-tint">
            {tBanner("cta")} <Icon name="arrow" className="h-5 w-5" />
          </Link>
        </div>
        </div>
      </div>
    </section>
  );
}
