import Image from "next/image";
import { DESIGN_IMAGES, type DesignImageKey } from "@/lib/design-images";
import { AlieniLogo } from "@/components/brand/AlieniLogo";
import { DesktopHeader } from "./DesktopHeader";
import { Icon, type IconName } from "./icons";
import { DesignImage, HeroSwoosh, RoundArrow, SoonBadge } from "./shared";
import type { PreviewCopy } from "./copy";

/** DESIGN 1 — desktop website homepage (discover & explore). */
export function DesktopHome({ c, kvk }: { c: PreviewCopy; kvk: string | null }) {
  return (
    <div className="bg-white text-navy">
      <UtilityBar c={c} />
      <DesktopHeader c={c} />
      <Hero c={c} />
      <Explore c={c} />
      <Why c={c} />
      <BusinessAndCommunity c={c} />
      <Banner c={c} />
      <Footer c={c} kvk={kvk} />
    </div>
  );
}

function UtilityBar({ c }: { c: PreviewCopy }) {
  const items: { icon: IconName; t: string }[] = [
    { icon: "person", t: c.utility.independent },
    { icon: "star", t: c.utility.reviews },
    { icon: "calendar", t: c.utility.book },
  ];
  return (
    <div className="bg-navy text-white">
      <div className="mx-auto flex h-11 max-w-[1360px] items-center justify-between px-6 text-[13px] font-medium lg:px-10">
        <ul className="flex items-center divide-x divide-white/25">
          {items.map((i) => (
            <li key={i.t} className="flex items-center gap-2 px-4 first:pl-0">
              <Icon name={i.icon} className="h-4 w-4" />
              {i.t}
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-1">
          <span className="mr-3 hidden md:inline">{c.utility.join}</span>
          {(["linkedin", "instagram", "facebook"] as const).map((s) => (
            <a key={s} href="#" aria-label={s} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10">
              <Icon name={s} className="h-[18px] w-[18px]" />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

function Hero({ c }: { c: PreviewCopy }) {
  return (
    <section className="relative overflow-hidden bg-white">
      {/* blurred bright interior on the right, fading into white on the left */}
      <div className="absolute inset-y-0 right-0 w-[68%]">
        <Image src={DESIGN_IMAGES.heroInterior.src} alt="" fill priority sizes="68vw" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-white via-white/55 to-white/0" />
        <div className="absolute inset-0 bg-white/20" />
      </div>
      <HeroSwoosh className="absolute right-0 top-0 h-full w-[46%]" />

      <div className="relative mx-auto grid min-h-[600px] max-w-[1360px] grid-cols-1 px-6 lg:grid-cols-[1.15fr_1fr] lg:px-10">
        <div className="relative z-10 pb-28 pt-14 lg:pt-16">
          <p className="eyebrow text-royal">{c.hero.eyebrow}</p>
          <h1 className="headline mt-4 text-[3.4rem] text-navy xl:text-[4.1rem]">
            {c.hero.pre}
            <br />
            <span className="text-royal">{c.hero.accent}</span> {c.hero.post}
          </h1>
          <p className="mt-5 max-w-[34rem] text-lg leading-relaxed text-body">{c.hero.text}</p>
          <div className="mt-8 flex flex-wrap gap-4">
            <a href="#" className="inline-flex min-h-[52px] items-center gap-2 rounded-full bg-royal px-7 text-base font-bold text-white  hover:bg-royal-dark">
              {c.hero.find} <Icon name="arrow" className="h-5 w-5" />
            </a>
            <a href="#explore" className="inline-flex min-h-[52px] items-center gap-2 rounded-full border-[1.5px] border-navy bg-white/70 px-7 text-base font-bold text-navy hover:bg-tint">
              {c.hero.explore} <Icon name="chevron" className="h-5 w-5" />
            </a>
          </div>

          {/* trust strip overlapping the hero's bottom-left */}
          <ul className="mt-12 grid max-w-[52rem] grid-cols-[1fr_1.15fr_1fr_0.9fr] divide-x divide-edge rounded-2xl border border-edge bg-white/95 px-2 py-4">
            {c.trust.map((t) => (
              <li key={t.t} className="flex items-center gap-3 px-4 text-[13px] font-semibold leading-snug text-navy">
                <Icon name={t.icon as IconName} className="h-8 w-8 shrink-0 text-royal" />
                {t.t}
              </li>
            ))}
          </ul>
        </div>

        {/* cut-out cleaner standing in front of the swoosh */}
        <div className="relative hidden lg:block">
          <Image
            src={DESIGN_IMAGES.heroCutout.src}
            alt="Smiling cleaner in a navy apron with arms crossed"
            width={DESIGN_IMAGES.heroCutout.width}
            height={DESIGN_IMAGES.heroCutout.height}
            priority
            sizes="(min-width: 1024px) 520px, 0px"
            className="absolute bottom-0 right-[6%] h-auto w-[min(520px,92%)] "
          />
        </div>
      </div>

      {/* soft white wave closing the hero */}
      <svg viewBox="0 0 1440 80" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 h-16 w-full" aria-hidden="true">
        <path d="M0 50C320 10 620 0 900 30s420 40 540 10V80H0Z" fill="#F7FAFE" />
      </svg>
    </section>
  );
}

function Explore({ c }: { c: PreviewCopy }) {
  return (
    <section id="explore" className="bg-[#F7FAFE] pb-20 pt-10">
      <div className="mx-auto max-w-[1360px] px-6 lg:px-10">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-edge pb-6">
          <div>
            <h2 className="headline text-[2.4rem] text-navy">{c.explore.title}</h2>
            <p className="mt-1 text-lg text-body">{c.explore.subtitle}</p>
          </div>
        </div>

        <ul className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {c.explore.cards.map((card) => (
            <li key={card.t}>
              <a href="#" className="group flex h-[104px] items-center overflow-hidden rounded-[14px] border border-edge bg-white transition-colors hover:border-royal">
                <div className="relative h-full w-[38%] shrink-0">
                  <DesignImage name={card.img as DesignImageKey} alt="" fill sizes="200px" className="object-cover" />
                  {card.soon ? <SoonBadge label={c.soon} className="absolute left-2 top-2" /> : null}
                </div>
                <div className="flex flex-1 items-center justify-between gap-3 px-5">
                  <div>
                    <h3 className="text-lg font-bold leading-tight text-navy">{card.t}</h3>
                    <p className="mt-1 flex items-center gap-1.5 text-[15px] font-medium text-royal">
                      {card.s} <Icon name="arrow" className="h-4 w-4" />
                    </p>
                  </div>
                  <RoundArrow />
                </div>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Why({ c }: { c: PreviewCopy }) {
  return (
    <section className="bg-white py-20">
      <div className="mx-auto grid max-w-[1360px] items-start gap-12 px-6 lg:grid-cols-[1fr_2fr] lg:px-10">
        <div>
          <h2 className="headline text-[2.6rem] text-navy">
            {c.why.pre} <span className="text-royal">{c.why.accent}</span>
          </h2>
          <p className="mt-4 max-w-sm text-lg text-body">{c.why.text}</p>
        </div>
        <dl className="grid gap-x-12 sm:grid-cols-2">
          {c.why.items.map((i) => (
            <div key={i.t} className="border-t-2 border-navy py-6">
              <dt className="text-xl font-extrabold leading-snug tracking-[-0.01em] text-navy">{i.t}</dt>
              <dd className="mt-2 text-[15px] leading-relaxed text-body">{i.d}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function BusinessAndCommunity({ c }: { c: PreviewCopy }) {
  const blocks = [
    { b: c.biz, dark: true },
    { b: c.community, dark: false },
  ];
  return (
    <section className="bg-[#F7FAFE] py-20">
      <div className="mx-auto grid max-w-[1360px] gap-6 px-6 lg:grid-cols-2 lg:px-10">
        {blocks.map(({ b, dark }) => (
          <div key={b.title} className={`relative overflow-hidden rounded-[22px] p-10 ${dark ? "bg-navy text-white" : "border border-edge bg-white text-navy"}`}>
            <div className="relative">
              <p className={`text-sm font-bold ${dark ? "text-bright" : "text-royal"}`}>{b.eyebrow}</p>
              <h2 className="headline mt-2 max-w-md text-[2rem]">{b.title}</h2>
              <p className={`mt-3 max-w-md ${dark ? "text-white/80" : "text-body"}`}>{b.text}</p>
              <ul className="mt-6 space-y-3">
                {b.points.map((p) => (
                  <li key={p} className="flex items-center gap-3 font-semibold">
                    <Icon name="check" className={`h-5 w-5 shrink-0 ${dark ? "text-bright" : "text-royal"}`} />
                    {p}
                  </li>
                ))}
              </ul>
              <a href="#" className={`mt-8 inline-flex min-h-12 items-center gap-2 rounded-full px-6 font-bold ${dark ? "bg-white text-navy hover:bg-tint" : "bg-royal text-white hover:bg-royal-dark"}`}>
                {b.cta} <Icon name="arrow" className="h-5 w-5" />
              </a>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Banner({ c }: { c: PreviewCopy }) {
  return (
    <section className="bg-[#F7FAFE] pb-20">
      <div className="mx-auto max-w-[1360px] px-6 lg:px-10">
        <div className="relative flex min-h-[200px] items-center overflow-hidden rounded-[22px] bg-navy">
          <div className="relative flex w-full flex-wrap items-center justify-between gap-6 px-12 py-12">
            <div>
              <h2 className="headline text-[2.3rem] text-white">
                {c.banner.pre}
                <br />
                <span className="text-bright">{c.banner.accent}</span>
              </h2>
              <p className="mt-2 max-w-sm text-white/85">{c.banner.text}</p>
            </div>
            <a href="#" className="inline-flex min-h-[52px] items-center gap-2 rounded-full bg-white px-7 font-bold text-navy hover:bg-tint">
              {c.banner.cta} <Icon name="arrow" className="h-5 w-5" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer({ c, kvk }: { c: PreviewCopy; kvk: string | null }) {
  return (
    <footer className="bg-navy-deep text-white">
      <div className="mx-auto grid max-w-[1360px] gap-10 px-6 py-16 lg:grid-cols-[1.4fr_repeat(5,1fr)] lg:px-10">
        <div>
          <AlieniLogo height={38} tone="white" />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/75">{c.footer.about}</p>
          <div className="mt-6 flex gap-1">
            {(["linkedin", "instagram", "facebook"] as const).map((s) => (
              <a key={s} href="#" aria-label={s} className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 hover:bg-white/20">
                <Icon name={s} className="h-5 w-5" />
              </a>
            ))}
          </div>
        </div>
        {c.footer.cols.map((col) => (
          <nav key={col.h} aria-label={col.h}>
            <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-bright">{col.h}</h3>
            <ul className="mt-4 space-y-2.5 text-[15px] text-white/80">
              {col.l.map((l) => (
                <li key={l}><a href="#" className="hover:text-white hover:underline">{l}</a></li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-[1360px] flex-wrap items-center justify-between gap-4 px-6 py-5 text-sm text-white/65 lg:px-10">
          <p>© {new Date().getFullYear()} Alieni. {c.footer.rights}{kvk ? ` · ${c.footer.kvk} ${kvk}` : ""}</p>
          <div className="flex gap-1" aria-label="Taal / Language">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white font-bold text-navy">NL</span>
            <span className="flex h-11 w-11 items-center justify-center rounded-full font-bold text-white">EN</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
