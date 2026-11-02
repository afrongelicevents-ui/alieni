import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

const ROLES = ["household", "cleaner", "business"] as const;

/** First sign-up screen: who are you? One sentence each, then the matching flow. */
export async function RoleChooser({ next }: { next?: string }) {
  const t = await getTranslations("auth");
  const q = next ? `&next=${encodeURIComponent(next)}` : "";
  return (
    <ul className="grid gap-3">
      {ROLES.map((role) => (
        <li key={role}>
          <Link
            href={role === "business" ? "/business/signup" : `/signup?role=${role}${q}`}
            className="flex items-center gap-4 rounded-card-lg border-2 border-line bg-white p-5 transition-colors hover:border-forest hover:bg-mint"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-mint text-forest">
              <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {role === "household" ? <path d="M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10" /> : role === "cleaner" ? <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" /></> : <><path d="M3 21V5h8v4h10v12z" /><path d="M7 9h1M7 13h1M7 17h1M15 13h2M15 17h2" /></>}
              </svg>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-extrabold text-ink">{t(`choose_${role}_title` as "choose_household_title")}</span>
              <span className="block text-sm text-ink/70">{t(`choose_${role}_text` as "choose_household_text")}</span>
            </span>
            <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-ink/40" fill="none" stroke="currentColor" aria-hidden="true"><path d="m6 3 5 5-5 5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </Link>
        </li>
      ))}
    </ul>
  );
}
