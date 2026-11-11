import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { AlieniLogo } from "@/components/brand/AlieniLogo";
import { Icon } from "@/components/site/Icon";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { COMPANY } from "@/lib/company";

const BUILD = (process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.NEXT_PUBLIC_BUILD_ID ?? "dev").slice(0, 7);

/** Social profiles: only shown once a URL is configured. */
const SOCIAL = [
  { key: "linkedin", url: process.env.NEXT_PUBLIC_LINKEDIN_URL },
  { key: "instagram", url: process.env.NEXT_PUBLIC_INSTAGRAM_URL },
  { key: "facebook", url: process.env.NEXT_PUBLIC_FACEBOOK_URL },
] as const;

type Col = { h: string; links: { href: string; label: string }[] };

/** Website footer: columns on desktop, fold-out sections on mobile (brief §2.8 / §3.10). */
export function Footer() {
  const t = useTranslations("site.footer");
  const cols: Col[] = [
    { h: t("customers"), links: [{ href: "/search", label: t("findCleaner") }, { href: "/about#how-it-works", label: t("howItWorks") }, { href: "/emergency", label: t("emergency") }] },
    { h: t("professionals"), links: [{ href: "/cleaners/new", label: t("placeAd") }, { href: "/jobs", label: t("jobs") }, { href: "/signup", label: t("signup") }] },
    { h: t("businesses"), links: [{ href: "/business", label: t("forBusinesses") }, { href: "/business/signup", label: t("businessSignup") }] },
    { h: t("company"), links: [{ href: "/about", label: t("about") }, { href: "/contact", label: t("contact") }] },
    { h: t("legal"), links: [{ href: "/terms", label: t("terms") }, { href: "/privacy", label: t("privacy") }, { href: "/contact#report", label: t("report") }] },
  ];
  const socials = SOCIAL.filter((s) => s.url && /^https:\/\//.test(s.url));

  return (
    <footer className="bg-navy-deep text-white">
      <div className="mx-auto max-w-[1360px] px-5 pb-6 pt-12 sm:px-6 lg:grid lg:grid-cols-[1.4fr_repeat(5,1fr)] lg:gap-10 lg:px-10 lg:pb-12 lg:pt-16">
        <div>
          <AlieniLogo height={34} tone="white" />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/75">{t("intro")}</p>
          {socials.length ? (
            <ul className="mt-5 flex gap-1">
              {socials.map((s) => (
                <li key={s.key}>
                  <a href={s.url} aria-label={s.key} rel="noopener noreferrer" target="_blank" className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 hover:bg-white/20">
                    <Icon name={s.key} className="h-5 w-5" />
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {/* Desktop columns */}
        {cols.map((col) => (
          <nav key={col.h} aria-label={col.h} className="hidden lg:block">
            <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-bright">{col.h}</h2>
            <ul className="mt-4 space-y-2.5 text-[15px] text-white/80">
              {col.links.map((l) => (
                <li key={l.href}><Link href={l.href} className="hover:text-white hover:underline">{l.label}</Link></li>
              ))}
            </ul>
          </nav>
        ))}

        {/* Mobile fold-out sections */}
        <div className="mt-8 divide-y divide-white/10 border-y border-white/10 lg:hidden">
          {cols.map((col) => (
            <details key={col.h} className="group">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between font-bold [&::-webkit-details-marker]:hidden">
                {col.h}
                <Icon name="chevron" className="h-5 w-5 transition-transform group-open:rotate-180" />
              </summary>
              <ul className="pb-3 text-[15px] text-white/80">
                {col.links.map((l) => (
                  <li key={l.href}><Link href={l.href} className="flex min-h-11 items-center">{l.label}</Link></li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-[1360px] flex-wrap items-center justify-between gap-4 px-5 py-5 text-sm text-white/65 sm:px-6 lg:px-10">
          <div className="space-y-1">
            <p>© {new Date().getFullYear()} {COMPANY.name}. {t("rights")}{COMPANY.kvk ? ` · ${t("kvk")} ${COMPANY.kvk}` : ""}</p>
            <p className="text-xs text-white/55">{t("pricing")} · {t("photos")} · v. {BUILD}</p>
          </div>
          <LocaleSwitcher tone="dark" />
        </div>
      </div>
    </footer>
  );
}
