import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Admin area (brief §8) — Agatha only.
 * With Supabase configured, access requires an authenticated profile with
 * role 'admin' (2FA is enforced on this account via Supabase Auth MFA at
 * launch). Without Supabase it runs in clearly-labelled demo mode.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("admin");
  const supabase = await createClient();
  let demoMode = true;

  if (supabase) {
    const { data } = await supabase.auth.getUser();
    if (!data.user) notFound();
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .single();
    if (profile?.role !== "admin") notFound();
    demoMode = false;
  }

  const tabs = [
    { href: "/admin", key: "tabDashboard" },
    { href: "/admin/reports", key: "tabReports" },
    { href: "/admin/vog", key: "tabVog" },
    { href: "/admin/business", key: "tabBusiness" },
    { href: "/admin/services", key: "tabServices" },
    { href: "/admin/pricing", key: "tabPricing" },
    { href: "/admin/fees", key: "tabFees" },
    { href: "/admin/work", key: "tabWork" },
    { href: "/admin/emergency", key: "tabEmergency" },
    { href: "/admin/users", key: "tabUsers" },
    { href: "/admin/ads", key: "tabAds" },
    { href: "/admin/media", key: "tabMedia" },
    { href: "/admin/testimonials", key: "tabTestimonials" },
    { href: "/admin/payments", key: "tabPayments" },
    { href: "/admin/settings", key: "tabSettings" },
  ] as const;

  return (
    <section className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="headline text-3xl text-ink">{t("title")}</h1>
        {demoMode ? (
          <span className="rounded-full bg-sun/30 px-3 py-1 text-xs font-semibold text-ink/70">
            {t("demoBadge")}
          </span>
        ) : null}
      </div>

      <nav aria-label={t("title")} className="mt-4 flex flex-wrap gap-2 border-b border-line pb-3">
        {tabs.map(({ href, key }) => (
          <Link
            key={href}
            href={href}
            className="rounded-full border border-line bg-white px-4 py-2 text-sm font-bold text-forest transition-colors hover:bg-mint"
          >
            {t(key)}
          </Link>
        ))}
      </nav>

      <div className="mt-6">{children}</div>
    </section>
  );
}
