import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth";
import { homeFor } from "@/lib/guard";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { HouseholdOnboarding } from "@/components/home-role/HouseholdOnboarding";

export const dynamic = "force-dynamic";

/** Account settings: who you are, your preferences, log out. The role's own home holds the work. */
export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("account");
  const user = await getSessionUser();

  if (!user) {
    return (
      <section className="mx-auto max-w-md px-4 py-10">
        <h1 className="headline text-3xl text-ink">{t("title")}</h1>
        <p className="mt-2 text-sm text-ink/70">{t("intro")}</p>
        <ul className="mt-6 divide-y divide-line overflow-hidden rounded-card-lg border border-line bg-white">
          <li><Row href="/login" label={t("loginSignup")} /></li>
          <li><Row href="/signup" label={t("createAccount")} /></li>
        </ul>
      </section>
    );
  }

  const supabase = (await createClient())!;
  const { data: hp } = user.role === "household" ? await supabase.from("household_profiles").select("postcode_area, needs, home_type").eq("user_id", user.id).maybeSingle() : { data: null };
  const prefs = hp as { postcode_area: string | null; needs: string[]; home_type: string | null } | null;

  const rows: { href: string; label: string; strong?: boolean }[] = [
    { href: homeFor(user.role), label: t(`goHome_${user.role}` as "goHome_household"), strong: true },
    ...(user.role === "cleaner" ? [{ href: "/profile", label: t("myProfile") }, { href: "/work", label: t("work") }] : []),
    ...(user.role === "business" ? [{ href: "/business/dashboard", label: t("businessDashboard") }, { href: "/jobs/new", label: t("postJob") }] : []),
    ...(user.role === "household" ? [{ href: "/favourites", label: t("favourites") }, { href: "/search", label: t("findCleaner") }] : []),
    { href: "/messages", label: t("messages") },
    { href: "/reset-password", label: t("changePassword") },
    ...(user.role === "admin" ? [{ href: "/admin", label: t("admin"), strong: true }] : []),
  ];

  return (
    <section className="mx-auto max-w-md px-4 py-10">
      <h1 className="headline text-3xl text-ink">{t("settingsTitle")}</h1>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-card-lg bg-mint p-4">
        <div>
          <p className="text-sm font-bold text-forest">{t("signedInAs")}</p>
          <p className="text-sm text-ink">{user.email}</p>
          <p className="text-xs text-ink/70">{t(`role_${user.role}` as "role_household")} · {t("roleFixed")}</p>
        </div>
        <LogoutButton />
      </div>

      {user.role === "household" ? (
        <section className="mt-6">
          <h2 className="font-extrabold text-ink">{t("prefsTitle")}</h2>
          <div className="mt-2">
            <HouseholdOnboarding compact name={user.displayName} initial={{ postcodeArea: prefs?.postcode_area ?? "", needs: prefs?.needs ?? [], homeType: prefs?.home_type ?? "" }} />
          </div>
        </section>
      ) : null}

      <ul className="mt-6 divide-y divide-line overflow-hidden rounded-card-lg border border-line bg-white">
        {rows.map((r) => (
          <li key={r.href + r.label}><Row {...r} /></li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-ink/60">{t("privacyNote")} <Link href="/privacy" className="font-bold text-forest underline">{t("privacyLink")}</Link></p>
    </section>
  );
}

function Row({ href, label, strong }: { href: string; label: string; strong?: boolean }) {
  return (
    <Link href={href} className={`flex min-h-14 items-center justify-between gap-3 px-5 font-bold transition-colors hover:bg-section ${strong ? "bg-sun/20 text-forest" : "text-ink"}`}>
      <span>{label}</span>
      <svg viewBox="0 0 16 16" className="h-4 w-4 text-ink/40" fill="none" stroke="currentColor" aria-hidden="true"><path d="m6 3 5 5-5 5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </Link>
  );
}
