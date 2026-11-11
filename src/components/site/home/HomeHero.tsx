import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { DESIGN_IMAGES } from "@/lib/design-images";
import { Icon, type IconName } from "@/components/site/Icon";
import { HeroSwoosh } from "@/components/site/bits";
import { VideoButton } from "./VideoButton";

const TRUST_ICONS: IconName[] = ["person", "scale", "chat", "star"];

/**
 * Homepage hero. One responsive section:
 * - mobile: dark navy, cut-out at the bottom right, never over the headline or button;
 * - desktop: bright interior on the right, cut-out in front of the blue swoosh,
 *   trust strip under the buttons.
 * `photoUrl` is an admin-uploaded replacement (Admin → Photos), ideally a cut-out PNG.
 */
export async function HomeHero({ photoUrl, videoUrl }: { photoUrl: string | null; videoUrl: string | null }) {
  const t = await getTranslations("site");
  const trust = t.raw("trust") as string[];
  const cut = DESIGN_IMAGES.heroCutout;

  return (
    <section className="relative overflow-hidden bg-navy text-white lg:bg-white lg:text-navy">
      {/* Desktop: blurred bright interior on the right, fading into white */}
      <div className="absolute inset-y-0 right-0 hidden w-[68%] lg:block" aria-hidden="true">
        <Image src={DESIGN_IMAGES.heroInterior.src} alt="" fill sizes="68vw" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-white via-white/60 to-white/0" />
      </div>
      <HeroSwoosh variant="dark" className="absolute -right-8 top-24 h-[80%] w-[70%] lg:hidden" />
      <HeroSwoosh className="absolute right-0 top-0 hidden h-full w-[46%] lg:block" />

      {/* The cleaner: one image, positioned per breakpoint (the LCP element) */}
      <Image
        src={photoUrl ?? cut.src}
        alt={t("hero.imageAlt")}
        width={cut.width}
        height={cut.height}
        priority
        unoptimized={Boolean(photoUrl?.startsWith("http"))}
        sizes="(min-width: 1024px) 520px, 56vw"
        className="pointer-events-none absolute bottom-0 right-[-5%] h-auto w-[56%] max-w-[280px] object-contain object-bottom [mask-image:linear-gradient(to_bottom,black_80%,transparent)] sm:max-w-[320px] lg:right-[max(3%,calc((100vw-1360px)/2+24px))] lg:w-[min(520px,38vw)] lg:max-w-none lg:[mask-image:none]"
      />

      <div className="relative mx-auto max-w-[1360px] px-5 sm:px-6 lg:min-h-[600px] lg:px-10">
        <div className="relative z-10 pb-24 pt-8 sm:pb-28 lg:max-w-[46rem] lg:pb-28 lg:pt-16">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-bright lg:text-xs lg:text-royal">{t("hero.eyebrow")}</p>
          <h1 className="headline mt-3 text-[2.05rem] leading-[1.06] sm:text-5xl lg:text-[3.6rem] xl:text-[4rem]">
            <span className="block">{t("hero.pre")}</span>
            <span className="text-bright lg:text-royal">{t("hero.accent")}</span>
            {t("hero.post") ? <> {t("hero.post")}</> : null}
          </h1>
          <p className="mt-4 max-w-[55%] text-[15px] leading-relaxed text-white/90 sm:max-w-md lg:mt-5 lg:max-w-[34rem] lg:text-lg lg:text-body">{t("hero.text")}</p>
          <div className="mt-6 flex max-w-[55%] flex-col items-start gap-4 sm:max-w-none sm:flex-row sm:flex-wrap sm:items-center lg:mt-8">
            <Link href="/search" className="inline-flex min-h-12 items-center gap-2 rounded-full bg-royal px-6 text-[15px] font-bold text-white hover:bg-royal-dark lg:min-h-[52px] lg:px-7 lg:text-base">
              {t("hero.find")} <Icon name="arrow" className="h-5 w-5" />
            </Link>
            <a href="#explore" className="hidden min-h-[52px] items-center gap-2 rounded-full border-[1.5px] border-navy bg-white/70 px-7 text-base font-bold text-navy hover:bg-tint lg:inline-flex">
              {t("hero.explore")} <Icon name="chevron" className="h-5 w-5" />
            </a>
            {videoUrl ? <VideoButton url={videoUrl} label={t("hero.video")} closeLabel={t("hero.closeVideo")} /> : null}
          </div>

          {/* Desktop trust strip */}
          <ul className="mt-12 hidden max-w-[52rem] grid-cols-4 divide-x divide-edge rounded-2xl border border-edge bg-white/95 px-2 py-4 lg:grid">
            {trust.map((label, i) => (
              <li key={label} className="flex items-center gap-3 px-4 text-[13px] font-semibold leading-snug text-navy">
                <Icon name={TRUST_ICONS[i] ?? "check"} className="h-7 w-7 shrink-0 text-royal" />
                {label}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Desktop: soft wave closing the hero */}
      <svg viewBox="0 0 1440 80" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 hidden h-16 w-full lg:block" aria-hidden="true">
        <path d="M0 50C320 10 620 0 900 30s420 40 540 10V80H0Z" fill="#F7FAFE" />
      </svg>
    </section>
  );
}
