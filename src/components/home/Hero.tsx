import Image from "next/image";
import { useTranslations } from "next-intl";
import { PostcodeSearch } from "./PostcodeSearch";
import { Link } from "@/i18n/navigation";

export function Hero({ imageUrl }: { imageUrl: string | null }) {
  const t = useTranslations("home");

  return (
    <section className="relative overflow-hidden bg-white">
      {/* green/yellow arcs behind the photo (brief §9) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 top-0 hidden h-[480px] w-[480px] rounded-full border-[28px] border-forest/15 md:block"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-10 top-24 hidden h-[360px] w-[360px] rounded-full border-[20px] border-sun/40 md:block"
      />

      <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-10 md:grid-cols-2 md:py-16">
        <div>
          <h1 className="headline text-4xl text-ink sm:text-5xl lg:text-[3.4rem]">
            {t("heroTitlePre")}
            <span className="swoosh text-sun-text">
              {t("heroTitleAccent")}
              <svg viewBox="0 0 120 12" preserveAspectRatio="none" aria-hidden="true">
                <path
                  d="M2 9 C 30 2, 90 2, 118 7"
                  stroke="#2E8BFF"
                  strokeWidth="5"
                  strokeLinecap="round"
                  fill="none"
                />
              </svg>
            </span>
          </h1>
          <p className="mt-5 max-w-md text-lg text-ink/75">{t("heroSubtitle")}</p>
          <div className="mt-7">
            <PostcodeSearch />
          </div>
          <p className="mt-3 text-sm">
            <Link href="/emergency" className="font-bold text-forest underline underline-offset-2">{t("emergencyCta")}</Link>
          </p>
        </div>

        {/* Marketing photo (Admin → Foto's, or public/img) — silhouette until one exists */}
        <div className="relative mx-auto hidden aspect-[3/4] w-full max-w-sm md:block">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt=""
              fill
              sizes="(min-width: 768px) 384px, 0px"
              priority
              unoptimized={imageUrl.startsWith("http")}
              className="rounded-[2rem] object-cover shadow-xl shadow-forest/10"
            />
          ) : (
            <div className="absolute inset-0 flex items-end justify-center overflow-hidden rounded-[2rem] bg-mint">
              <svg viewBox="0 0 200 250" className="h-5/6 w-auto text-forest/20" fill="currentColor" aria-hidden="true">
                <circle cx="100" cy="80" r="45" />
                <path d="M30 250c0-50 31-85 70-85s70 35 70 85" />
              </svg>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
