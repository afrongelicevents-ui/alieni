import Image from "next/image";
import { DESIGN_IMAGES, type DesignImageKey } from "@/lib/design-images";
import { AlieniLogo } from "@/components/brand/AlieniLogo";
import { MobileHeader } from "./MobileMenu";
import { Icon, type IconName } from "./icons";
import { DesignImage, HeroSwoosh, RoundArrow, SoonBadge } from "./shared";
import type { PreviewCopy } from "./copy";

/**
 * DESIGN 2 — mobile website homepage (browse, discover, register).
 * Vertical scrolling, hamburger menu, NO bottom navigation bar.
 */
export function MobileWebHome({ c, showVideo, kvk }: { c: PreviewCopy; showVideo: boolean; kvk: string | null }) {
  return (
    <div className="mx-auto max-w-[480px] bg-[#F7FAFE] text-navy">
      <Hero c={c} showVideo={showVideo} />
      <SearchAndCategories c={c} />
      <About c={c} />
      <Why c={c} />
      <Explore c={c} />
      <Business c={c} />
      {/* Testimonials: hidden while there are no real, consented testimonials (brief §8). */}
      <Footer c={c} kvk={kvk} />
    </div>
  );
}

function Hero({ c, showVideo }: { c: PreviewCopy; showVideo: boolean }) {
  return (
    <section className="relative overflow-hidden bg-navy pb-16 text-white">
      <MobileHeader c={c} />
      {/* faint interior + swoosh behind the cut-out */}
      <div className="absolute inset-0 opacity-25">
        <Image src={DESIGN_IMAGES.heroInterior.src} alt="" fill priority sizes="100vw" className="object-cover" />
      </div>
      <div className="absolute inset-0 bg-gradient-to-r from-navy via-navy/85 to-navy/20" />
      <HeroSwoosh variant="dark" className="absolute -right-6 top-10 h-[86%] w-[62%]" />

      <Image
        src={DESIGN_IMAGES.heroCutout.src}
        alt="Smiling cleaner in a navy apron with arms crossed"
        width={DESIGN_IMAGES.heroCutout.width}
        height={DESIGN_IMAGES.heroCutout.height}
        priority
        sizes="200px"
        className="absolute -right-4 top-[150px] h-auto w-[50%] max-w-[230px] [mask-image:linear-gradient(to_bottom,black_72%,transparent)]"
      />

      <div className="relative z-10 px-5 pt-28">
        <p className="eyebrow max-w-[62%] text-[10px] text-bright before:hidden">{c.hero.eyebrow}</p>
        <h1 className="headline mt-3 text-[2.15rem] leading-[1.04] [text-shadow:0_2px_18px_rgba(7,22,56,0.6)]">
          {c.hero.pre}
          <br />
          <span className="text-bright">{c.hero.accent}</span>
          <br />
          {c.hero.post}
        </h1>
        <p className="mt-4 max-w-[56%] text-[14px] leading-relaxed text-white/90 [text-shadow:0_1px_10px_rgba(7,22,56,0.8)]">{c.hero.text}</p>
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <a href="#" className="inline-flex min-h-12 items-center gap-2 rounded-full bg-royal px-6 text-[15px] font-bold shadow-[0_10px_24px_-10px_rgba(46,139,255,0.9)]">
            {c.hero.find} <Icon name="arrow" className="h-5 w-5" />
          </a>
          {showVideo ? (
            <button type="button" className="inline-flex min-h-12 items-center gap-2.5 text-[15px] font-semibold">
              <span className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-white">
                <Icon name="play" className="h-5 w-5" />
              </span>
              {c.hero.video}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function SearchAndCategories({ c }: { c: PreviewCopy }) {
  return (
    <section className="relative z-10 -mt-9 px-4">
      <form role="search" aria-label={c.searchBar.label} className="flex items-center gap-2 rounded-2xl bg-white p-2 pl-4 shadow-[0_16px_34px_-16px_rgba(11,31,75,0.45)]">
        <Icon name="search" className="h-5 w-5 shrink-0 text-navy" />
        <label className="sr-only" htmlFor="m-search">{c.searchBar.label}</label>
        <input id="m-search" type="search" placeholder={c.searchBar.placeholder} className="min-h-11 w-full min-w-0 bg-transparent text-[14px] text-navy placeholder:text-body outline-none" />
        <button type="submit" className="min-h-11 shrink-0 rounded-xl bg-navy px-5 text-sm font-bold text-white">{c.searchBar.button}</button>
      </form>

      <nav aria-label="Categories" className="mt-4 rounded-2xl bg-white shadow-[0_10px_26px_-18px_rgba(11,31,75,0.4)]">
        <ul className="no-scrollbar flex overflow-x-auto py-3">
          {c.iconRow.map((i, idx) => (
            <li key={i.t} className={`min-w-[58px] flex-1 ${idx ? "border-l border-edge" : ""}`}>
              <a href="#" className="relative flex min-h-16 flex-col items-center justify-center gap-1.5 px-0.5 text-center text-[11px] font-semibold leading-tight text-navy">
                <Icon name={i.icon as IconName} className="h-7 w-7 text-navy" />
                {i.t}
                {i.soon ? <span className="absolute right-2 top-0 h-2 w-2 rounded-full bg-bright" title={c.soon} aria-label={c.soon} /> : null}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </section>
  );
}

function About({ c }: { c: PreviewCopy }) {
  return (
    <section className="mt-8 grid grid-cols-[46%_1fr] items-center gap-4 pr-4">
      <div className="relative aspect-[10/11] overflow-hidden rounded-r-[28px]">
        <DesignImage name="aboutLiving" alt="Bucket with cleaning products in a bright living room" fill sizes="45vw" className="object-cover" />
        <svg viewBox="0 0 40 200" preserveAspectRatio="none" className="absolute inset-y-0 right-0 h-full w-8" aria-hidden="true">
          <path d="M40 0H22C34 60 34 140 6 200H40Z" fill="#1667E0" />
          <path d="M40 0H34C40 70 40 140 22 200H40Z" fill="#0B1F4B" />
        </svg>
      </div>
      <div>
        <p className="eyebrow text-[10px] text-royal before:w-5">{c.about.eyebrow}</p>
        <h2 className="headline mt-2 text-[1.35rem] leading-tight">{c.about.title}</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-body">{c.about.text}</p>
        <a href="#" className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-navy px-5 text-sm font-bold text-white">
          {c.about.cta} <Icon name="arrow" className="h-4 w-4" />
        </a>
      </div>
    </section>
  );
}

function Why({ c }: { c: PreviewCopy }) {
  return (
    <section className="mt-8 px-4">
      <div className="relative overflow-hidden rounded-[22px] bg-navy px-5 pb-28 pt-6 text-white">
        <div className="absolute inset-x-0 bottom-0 h-28">
          <DesignImage name="skyline" alt="" fill sizes="100vw" className="object-cover object-bottom" />
          <div className="absolute inset-0 bg-gradient-to-b from-navy via-navy/30 to-transparent" />
        </div>
        <div className="relative">
          <p className="eyebrow text-[11px] text-white/85">{c.why.eyebrow}</p>
          <h2 className="headline mt-2 text-[1.85rem]">
            {c.why.pre} <span className="text-bright">{c.why.accent}</span>
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-white/85">{c.why.text}</p>
          <ul className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-white/10">
            {c.why.items.map((i) => (
              <li key={i.t} className="flex flex-col items-center gap-2 bg-navy px-2 py-4 text-center text-[13px] font-semibold leading-snug">
                <Icon name={i.icon as IconName} className="h-8 w-8 text-bright" />
                {i.t}
              </li>
            ))}
          </ul>
          <a href="#" className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-full bg-white px-6 text-[15px] font-bold text-navy">
            {c.why.cta} <Icon name="arrow" className="h-5 w-5" />
          </a>
        </div>
      </div>
    </section>
  );
}

function Explore({ c }: { c: PreviewCopy }) {
  return (
    <section className="mt-12 px-4">
      <div className="flex items-center justify-center gap-4">
        <span className="h-0.5 w-8 rounded bg-royal" />
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-navy">{c.explore.mobileEyebrow}</p>
        <span className="h-0.5 w-8 rounded bg-royal" />
      </div>
      <h2 className="headline mt-2 text-center text-[1.45rem] leading-tight">{c.explore.mobileTitle}</h2>
      <ul className="mt-6 grid grid-cols-2 gap-3">
        {c.explore.cards.map((card) => (
          <li key={card.t}>
            <a href="#" className="group block overflow-hidden rounded-2xl border border-edge bg-white shadow-[0_8px_20px_-16px_rgba(11,31,75,0.4)]">
              <div className="relative aspect-[2/1]">
                <DesignImage name={card.img as DesignImageKey} alt="" fill sizes="45vw" className="object-cover" />
                {card.soon ? <SoonBadge label={c.soon} className="absolute left-2 top-2" /> : null}
              </div>
              <div className="flex items-end justify-between gap-2 p-3">
                <div>
                  <h3 className="text-[14px] font-bold leading-tight">{card.t}</h3>
                  <p className="mt-0.5 text-[13px] font-medium text-royal">{card.s}</p>
                </div>
                <RoundArrow className="h-8 w-8" />
              </div>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Business({ c }: { c: PreviewCopy }) {
  return (
    <section className="mt-10 px-4">
      <div className="rounded-[22px] border border-edge bg-white p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-tint text-royal">
            <Icon name="building" className="h-6 w-6" />
          </span>
          <p className="eyebrow text-[11px] text-royal before:hidden">{c.biz.eyebrow}</p>
        </div>
        <h2 className="headline mt-3 text-[1.45rem] leading-tight">{c.biz.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-body">{c.biz.mobileText}</p>
        <a href="#" className="mt-4 inline-flex min-h-12 items-center gap-2 rounded-full bg-royal px-6 text-[15px] font-bold text-white">
          {c.biz.cta} <Icon name="arrow" className="h-5 w-5" />
        </a>
      </div>
    </section>
  );
}

function Footer({ c, kvk }: { c: PreviewCopy; kvk: string | null }) {
  return (
    <footer className="mt-12 bg-navy-deep px-5 pb-10 pt-10 text-white">
      <AlieniLogo height={32} tone="white" />
      <p className="mt-3 text-sm leading-relaxed text-white/75">{c.footer.about}</p>
      <div className="mt-6 divide-y divide-white/10 border-y border-white/10">
        {c.footer.cols.map((col) => (
          <details key={col.h} className="group">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between font-bold">
              {col.h}
              <Icon name="chevron" className="h-5 w-5 transition-transform group-open:rotate-180" />
            </summary>
            <ul className="space-y-2 pb-4 text-[15px] text-white/80">
              {col.l.map((l) => (
                <li key={l}><a href="#" className="block py-1">{l}</a></li>
              ))}
            </ul>
          </details>
        ))}
      </div>
      <div className="mt-6 flex items-center justify-between">
        <div className="flex gap-1">
          {(["linkedin", "instagram", "facebook"] as const).map((s) => (
            <a key={s} href="#" aria-label={s} className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10">
              <Icon name={s} className="h-5 w-5" />
            </a>
          ))}
        </div>
        <div className="flex gap-1">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-sm font-bold text-navy">NL</span>
          <span className="flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold">EN</span>
        </div>
      </div>
      <p className="mt-6 text-xs text-white/60">© {new Date().getFullYear()} Alieni. {c.footer.rights}{kvk ? ` · ${c.footer.kvk} ${kvk}` : ""}</p>
    </footer>
  );
}
