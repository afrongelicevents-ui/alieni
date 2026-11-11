"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { AlieniLogo } from "@/components/brand/AlieniLogo";
import { Icon, type IconName } from "@/components/site/Icon";
import { NAV } from "@/lib/nav";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { useNavRole } from "./useNavRole";

type MenuKey = "customers" | "professionals" | "businesses" | "about";
const MENUS: MenuKey[] = ["customers", "professionals", "businesses", "about"];
type MegaItem = { t: string; d: string; href: string };

/**
 * Website header (brief §2/§3/§6).
 * Desktop: navy utility bar + white bar with mega-menu, search, Log in, Get started.
 * Mobile: navy bar with logo, one pill and a hamburger that opens a full-screen menu.
 * Signed-in users get their role's links instead of the marketing menus.
 * There is deliberately no bottom navigation bar on the website.
 */
export function Header() {
  const t = useTranslations("site");
  const tn = useTranslations("nav");
  const pathname = usePathname();
  const role = useNavRole();
  const signedIn = role !== null && role !== "guest";
  const roleItems = signedIn ? NAV[role] : [];
  const [open, setOpen] = useState<MenuKey | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setCompact(window.scrollY > 40);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(null);
        setMobileOpen(false);
      }
    };
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("keydown", onKey);
    window.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("click", onClick);
    };
  }, []);

  // Close menus on navigation (state adjusted during render, no effect needed).
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(null);
    setMobileOpen(false);
  }

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const homeHref = signedIn ? NAV[role][0].href : "/";
  const utility: { icon: IconName; t: string }[] = [
    { icon: "person", t: t("utility.independent") },
    { icon: "star", t: t("utility.reviews") },
    { icon: "chat", t: t("utility.meet") },
  ];

  return (
    <header ref={ref} className="sticky top-0 z-40">
      {/* Desktop utility bar */}
      <div className={`bg-navy text-white ${compact ? "hidden" : "hidden lg:block"}`}>
        <div className="mx-auto flex h-10 max-w-[1360px] items-center justify-between px-10 text-[13px] font-medium">
          <ul className="flex items-center divide-x divide-white/25">
            {utility.map((i) => (
              <li key={i.t} className="flex items-center gap-2 px-4 first:pl-0">
                <Icon name={i.icon} className="h-4 w-4" />
                {i.t}
              </li>
            ))}
          </ul>
          <LocaleSwitcher tone="dark" compact />
        </div>
      </div>

      {/* Main bar: navy on mobile, white on desktop */}
      <div className="border-b border-navy bg-navy lg:border-edge lg:bg-white/95 lg:backdrop-blur">
        <div className={`mx-auto flex max-w-[1360px] items-center gap-4 px-4 transition-[padding] sm:px-6 lg:px-10 ${compact ? "py-2" : "py-2.5 lg:py-3.5"}`}>
          <Link href={homeHref} aria-label="Alieni — home" className="shrink-0">
            <span className="lg:hidden"><AlieniLogo height={32} tone="white" /></span>
            <span className="hidden lg:inline"><AlieniLogo height={compact ? 34 : 42} /></span>
          </Link>

          {/* Desktop navigation */}
          <nav aria-label={t("nav.main")} className="ml-auto hidden lg:block">
            {role === null ? null : signedIn ? (
              <ul className="flex items-center gap-1">
                {roleItems.map(({ href, key }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={pathname === href ? "page" : undefined}
                      className={`flex min-h-11 items-center rounded-full px-4 text-[15px] font-semibold text-navy hover:bg-tint ${key === "account" ? "ml-2 border-[1.5px] border-navy px-5 font-bold" : ""} ${pathname === href ? "bg-tint" : ""}`}
                    >
                      {tn(key)}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="flex items-center gap-1">
                {MENUS.map((key) => (
                  <li key={key} className="relative">
                    <button
                      type="button"
                      aria-expanded={open === key}
                      aria-controls={`mega-${key}`}
                      onClick={() => setOpen(open === key ? null : key)}
                      className="flex min-h-11 items-center gap-1.5 rounded-full px-3.5 text-[15px] font-semibold text-navy hover:bg-tint"
                    >
                      {t(`nav.${key}`)}
                      <Icon name="chevron" className={`h-4 w-4 transition-transform ${open === key ? "rotate-180" : ""}`} />
                    </button>
                    {open === key ? (
                      <div id={`mega-${key}`} className="absolute left-1/2 top-full mt-3 w-80 -translate-x-1/2 rounded-2xl border border-edge bg-white p-2 shadow-[0_18px_40px_-16px_rgba(11,31,75,0.3)]">
                        <ul>
                          {(t.raw(`mega.${key}`) as MegaItem[]).map((item) => (
                            <li key={item.href}>
                              <Link href={item.href} className="block rounded-xl p-3 hover:bg-tint">
                                <span className="block text-sm font-bold text-navy">{item.t}</span>
                                <span className="block text-sm text-body">{item.d}</span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-2 lg:ml-4 lg:gap-3">
            <Link href="/search" aria-label={t("nav.search")} className="hidden h-11 w-11 items-center justify-center rounded-full text-navy hover:bg-tint lg:flex">
              <Icon name="search" className="h-6 w-6" />
            </Link>
            {role === null ? null : signedIn ? (
              <Link href="/account" className="inline-flex min-h-11 items-center rounded-full border-[1.5px] border-white/80 px-5 text-sm font-bold text-white lg:hidden">
                {tn("account")}
              </Link>
            ) : (
              <>
                <Link href="/login" className="hidden min-h-11 items-center rounded-full border-[1.5px] border-navy px-6 text-[15px] font-bold text-navy hover:bg-tint lg:inline-flex">
                  {tn("login")}
                </Link>
                <Link href="/signup" className="inline-flex min-h-11 items-center rounded-full border-[1.5px] border-white/80 px-4 text-sm font-bold text-white lg:border-royal lg:bg-royal lg:px-6 lg:text-[15px] lg:hover:bg-royal-dark">
                  {t("nav.getStarted")}
                </Link>
              </>
            )}
            <button
              type="button"
              aria-label={t("nav.menu")}
              aria-expanded={mobileOpen}
              aria-controls="mobile-menu"
              onClick={() => setMobileOpen(true)}
              className="flex h-11 w-11 items-center justify-center rounded-full text-white hover:bg-white/10 lg:hidden"
            >
              <Icon name="menu" className="h-7 w-7" />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile full-screen menu */}
      {mobileOpen ? (
        <div id="mobile-menu" role="dialog" aria-modal="true" aria-label={t("nav.main")} className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-navy text-white lg:hidden">
          <div className="flex items-center justify-between px-4 py-2.5 sm:px-6">
            <AlieniLogo height={32} tone="white" />
            <button type="button" aria-label={t("nav.close")} onClick={() => setMobileOpen(false)} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10" autoFocus>
              <Icon name="close" className="h-7 w-7" />
            </button>
          </div>
          <nav aria-label={t("nav.main")} className="mt-4 flex-1 px-5 sm:px-8">
            {signedIn ? (
              <ul className="divide-y divide-white/10">
                {roleItems.map(({ href, key }) => (
                  <li key={href}>
                    <Link href={href} className="flex min-h-14 items-center justify-between text-xl font-bold">
                      {tn(key)}
                      <Icon name="arrow" className="h-5 w-5 text-bright" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="space-y-6">
                {MENUS.map((key) => (
                  <section key={key}>
                    <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-bright">{t(`nav.${key}`)}</h2>
                    <ul className="mt-1 divide-y divide-white/10">
                      {(t.raw(`mega.${key}`) as MegaItem[]).map((item) => (
                        <li key={item.href}>
                          <Link href={item.href} className="flex min-h-12 items-center justify-between text-lg font-semibold">
                            {item.t}
                            <Icon name="arrow" className="h-5 w-5 text-bright" />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </nav>
          <div className="space-y-3 px-5 pb-8 pt-6 sm:px-8">
            {signedIn ? null : (
              <>
                <Link href="/signup" className="flex min-h-12 items-center justify-center rounded-full bg-royal font-bold">{t("nav.getStarted")}</Link>
                <Link href="/login" className="flex min-h-12 items-center justify-center rounded-full border-[1.5px] border-white font-bold">{tn("login")}</Link>
              </>
            )}
            <div className="flex justify-center pt-2">
              <LocaleSwitcher tone="dark" />
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
