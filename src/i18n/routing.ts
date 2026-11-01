import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  // Dutch default for .nl (brief §9); English secondary.
  locales: ["nl", "en"],
  defaultLocale: "nl",
  localePrefix: "as-needed",
});

export type Locale = (typeof routing.locales)[number];
