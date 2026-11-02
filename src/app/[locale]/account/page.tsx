import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/auth/LogoutButton";

export const dynamic = "force-dynamic";

const items = [
  { href: "/messages", key: "messages" },
  { href: "/favourites", key: "favourites" },
  { href: "/cleaners/new", key: "myAd" },
  { href: "/cleaners/slots", key: "mySlots" },
  { href: "/cleaners/emergency", key: "myEmergency" },
] as const;

export default async function AccountPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("account");

  // Who is signed in (null while Supabase is not configured or logged out).
  let user: { email: string; role: string } | null = null;
  const supabase = await createClient();
  if (supabase) {
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
      user = { email: data.user.email ?? "", role: profile?.role ?? "household" };
    }
  }

  const links: { href: string; label: string; strong?: boolean }[] = [
    ...(user?.role === "admin" ? [{ href: "/admin", label: t("admin"), strong: true }] : []),
    ...items.map(({ href, key }) => ({ href, label: t(key) })),
    ...(user ? [] : [{ href: "/login", label: t("loginSignup") }]),
  ];

  return (
    <section className="mx-auto max-w-md px-4 py-10">
      <h1 className="headline text-3xl text-ink">{t("title")}</h1>
      {user ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-card-lg bg-mint p-4">
          <div>
            <p className="text-sm font-bold text-forest">{t("signedInAs")}</p>
            <p className="text-sm text-ink">{user.email}</p>
            <p className="text-xs text-ink/70">{t(`role_${user.role}`)}</p>
          </div>
          <LogoutButton />
        </div>
      ) : (
        <p className="mt-2 text-sm text-ink/70">{t("intro")}</p>
      )}
      <ul className="mt-6 divide-y divide-line overflow-hidden rounded-card-lg border border-line bg-white">
        {links.map(({ href, label, strong }) => (
          <li key={href}>
            <Link href={href} className={`flex min-h-14 items-center justify-between px-5 font-bold transition-colors hover:bg-section ${strong ? "bg-sun/20 text-forest" : "text-ink"}`}>
              {label}
              <svg viewBox="0 0 16 16" className="h-4 w-4 text-ink/40" fill="none" stroke="currentColor" aria-hidden="true">
                <path d="m6 3 5 5-5 5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
