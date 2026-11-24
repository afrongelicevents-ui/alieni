import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getSessionUser } from "@/lib/auth";

/**
 * Admin area (brief §8). Signed out → log in; signed in but not admin → 404; admin without two-step login →
 * set it up first. Every admin data reader and action checks requireAdmin() again on its own.
 */
export default async function AdminLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations("admin");
  const user = await getSessionUser();
  if (!user) redirect(`/${locale}/login?next=${encodeURIComponent("/admin")}`);
  if (user.role !== "admin") notFound();
  if (!user.twoFactorEnabled) redirect(`/${locale}/account/two-factor?next=${encodeURIComponent("/admin")}`);

  const tabs = [
    { href: "/admin", key: "tabDashboard" },
    { href: "/admin/reports", key: "tabReports" },
    { href: "/admin/business", key: "tabBusiness" },
    { href: "/admin/services", key: "tabServices" },
    { href: "/admin/work", key: "tabWork" },
    { href: "/admin/users", key: "tabUsers" },
    { href: "/admin/ads", key: "tabAds" },
    { href: "/admin/media", key: "tabMedia" },
    { href: "/admin/testimonials", key: "tabTestimonials" },
    { href: "/admin/settings", key: "tabSettings" },
  ] as const;

  return (
    <section className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="headline text-3xl text-ink">{t("title")}</h1>
      </div>

      <nav aria-label={t("title")} className="mt-4 flex gap-2 overflow-x-auto border-b border-line pb-3 md:flex-wrap md:overflow-visible">
        {tabs.map(({ href, key }) => (
          <Link
            key={href}
            href={href}
            className="shrink-0 rounded-full border border-line bg-white px-4 py-2 text-sm font-bold text-forest transition-colors hover:bg-mint"
          >
            {t(key)}
          </Link>
        ))}
      </nav>

      <div className="mt-6">{children}</div>
    </section>
  );
}
