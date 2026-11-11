"use client";

import type { ReactNode } from "react";
import { usePathname } from "@/i18n/navigation";

/** Hides the site header/footer/bottom nav on the dev-only design previews. */
export function ChromeGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return pathname.startsWith("/design-preview") ? null : <>{children}</>;
}
