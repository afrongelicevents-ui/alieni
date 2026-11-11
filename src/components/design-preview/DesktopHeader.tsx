"use client";

import { useEffect, useRef, useState } from "react";
import { AlieniLogo } from "@/components/brand/AlieniLogo";
import { Icon } from "./icons";
import type { PreviewCopy } from "./copy";

type MenuKey = "customers" | "professionals" | "businesses" | "about";
const MENUS: MenuKey[] = ["customers", "professionals", "businesses", "about"];

/** Desktop header: logo · mega-menu · search · Login · Get Started. Compact when scrolled. */
export function DesktopHeader({ c }: { c: PreviewCopy }) {
  const [open, setOpen] = useState<MenuKey | null>(null);
  const [compact, setCompact] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setCompact(window.scrollY > 40);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("keydown", onKey);
    window.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("click", onClick);
    };
  }, []);

  return (
    <header ref={ref} className="sticky top-0 z-40 border-b border-edge/70 bg-white/95 backdrop-blur">
      <div className={`mx-auto flex max-w-[1360px] items-center gap-6 px-6 transition-all lg:px-10 ${compact ? "py-2" : "py-3.5"}`}>
        <a href="#" aria-label="Alieni — home" className="shrink-0">
          <AlieniLogo height={compact ? 34 : 44} />
        </a>

        <nav aria-label="Main" className="ml-auto hidden lg:block">
          <ul className="flex items-center gap-1">
            {MENUS.map((key) => (
              <li key={key} className="relative">
                <button
                  type="button"
                  aria-expanded={open === key}
                  aria-haspopup="true"
                  onClick={() => setOpen(open === key ? null : key)}
                  className="flex min-h-11 items-center gap-1.5 rounded-full px-3.5 text-[15px] font-semibold text-navy hover:bg-tint"
                >
                  {c.nav[key]}
                  <Icon name="chevron" className={`h-4 w-4 transition-transform ${open === key ? "rotate-180" : ""}`} />
                </button>
                {open === key ? (
                  <div className="absolute left-1/2 top-full mt-3 w-80 -translate-x-1/2 rounded-2xl border border-edge bg-white p-2 shadow-[0_18px_40px_-12px_rgba(11,31,75,0.25)]">
                    <ul>
                      {c.mega[key].map((item) => (
                        <li key={item.t}>
                          <a href="#" className="flex items-start gap-3 rounded-xl p-3 hover:bg-tint">
                            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-tint text-royal">
                              <Icon name="arrow" className="h-4 w-4" />
                            </span>
                            <span>
                              <span className="block text-sm font-bold text-navy">{item.t}</span>
                              <span className="block text-sm text-body">{item.d}</span>
                            </span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-3 lg:ml-6">
          <button type="button" aria-label={c.nav.search} className="hidden h-11 w-11 items-center justify-center rounded-full text-navy hover:bg-tint lg:flex">
            <Icon name="search" className="h-6 w-6" />
          </button>
          <a href="#" className="hidden min-h-11 items-center rounded-full border-[1.5px] border-navy px-6 text-[15px] font-bold text-navy hover:bg-tint lg:inline-flex">
            {c.nav.login}
          </a>
          <a href="#" className="inline-flex min-h-11 items-center rounded-full bg-royal px-6 text-[15px] font-bold text-white hover:bg-royal-dark">
            {c.nav.getStarted}
          </a>
          <button type="button" aria-label={c.nav.menu} className="flex h-11 w-11 items-center justify-center rounded-full text-navy hover:bg-tint lg:hidden">
            <Icon name="menu" className="h-6 w-6" />
          </button>
        </div>
      </div>
    </header>
  );
}
