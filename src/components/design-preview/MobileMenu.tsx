"use client";

import { useEffect, useState } from "react";
import { AlieniLogo } from "@/components/brand/AlieniLogo";
import { Icon } from "./icons";
import type { PreviewCopy } from "./copy";

/** Mobile website header: logo, small Get Started pill, hamburger → full-screen menu. */
export function MobileHeader({ c }: { c: PreviewCopy }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const links = [c.nav.customers, c.nav.professionals, c.nav.businesses, c.nav.about, c.nav.contact];

  return (
    <>
      <header className="absolute inset-x-0 top-0 z-30">
        <div className="flex items-center justify-between px-5 pt-4">
          <a href="#" aria-label="Alieni — home"><AlieniLogo height={34} tone="white" /></a>
          <div className="flex items-center gap-2">
            <a href="#" className="inline-flex min-h-11 items-center rounded-full border-[1.5px] border-white/80 px-4 text-sm font-bold text-white">
              {c.nav.getStarted}
            </a>
            <button type="button" aria-label={c.nav.menu} aria-expanded={open} onClick={() => setOpen(true)} className="flex h-11 w-11 items-center justify-center rounded-full text-white hover:bg-white/10">
              <Icon name="menu" className="h-7 w-7" />
            </button>
          </div>
        </div>
      </header>

      {open ? (
        <div role="dialog" aria-modal="true" aria-label={c.nav.menu} className="fixed inset-0 z-50 flex flex-col bg-navy text-white">
          <div className="flex items-center justify-between px-5 pt-4">
            <AlieniLogo height={34} tone="white" />
            <button type="button" aria-label={c.nav.close} onClick={() => setOpen(false)} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10" autoFocus>
              <Icon name="close" className="h-7 w-7" />
            </button>
          </div>
          <nav className="mt-6 flex-1 overflow-y-auto px-5">
            <ul className="divide-y divide-white/10">
              {links.map((l) => (
                <li key={l}>
                  <a href="#" className="flex min-h-14 items-center justify-between text-xl font-bold" onClick={() => setOpen(false)}>
                    {l}
                    <Icon name="arrow" className="h-5 w-5 text-bright" />
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="space-y-3 px-5 pb-8">
            <a href="#" className="flex min-h-12 items-center justify-center rounded-full bg-royal font-bold">{c.nav.getStarted}</a>
            <a href="#" className="flex min-h-12 items-center justify-center rounded-full border-[1.5px] border-white font-bold">{c.nav.login}</a>
            <div className="flex justify-center gap-1 pt-2">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white font-bold text-navy">NL</span>
              <span className="flex h-11 w-11 items-center justify-center rounded-full font-bold">EN</span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
