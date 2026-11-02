import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth";
import { LogoutButton } from "@/components/auth/LogoutButton";

export const dynamic = "force-dynamic";

type Stat = { label: string; value: string | number; href: string };
type Row = { href: string; label: string; strong?: boolean; badge?: string };

export default async function AccountPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
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
          {[
            { href: "/login", label: t("loginSignup") },
            { href: "/cleaners/new", label: t("myAd") },
            { href: "/favourites", label: t("favourites") },
          ].map((r) => (
            <li key={r.href}>
              <RowLink {...r} />
            </li>
          ))}
        </ul>
      </section>
    );
  }

  const supabase = (await createClient())!;
  const stats: Stat[] = [];
  const rows: Row[] = [];

  if (user.role === "admin") rows.push({ href: "/admin", label: t("admin"), strong: true });

  // Shared: conversations + active connections.
  const [{ count: conversationCount }, { data: connections }] = await Promise.all([
    supabase.from("conversations").select("id", { count: "exact", head: true }).or(`household_id.eq.${user.id},cleaner_id.eq.${user.id}`),
    supabase.from("connections").select("status, household_id, cleaner_id").or(`household_id.eq.${user.id},cleaner_id.eq.${user.id}`),
  ]);
  const activeConnections = (connections ?? []).filter((c: { status: string }) => c.status === "active").length;
  const pendingDeals = (connections ?? []).filter((c: { status: string }) => c.status === "pending").length;

  if (user.role === "cleaner" || user.role === "admin") {
    const { data: ad } = await supabase.from("cleaner_profiles").select("id, status").eq("user_id", user.id).maybeSingle();
    let openRequests = 0;
    if (ad) {
      const { count } = await supabase.from("meeting_requests").select("id", { count: "exact", head: true }).eq("cleaner_profile_id", ad.id).eq("status", "requested");
      openRequests = count ?? 0;
    }
    stats.push({ label: t("statAd"), value: ad ? t(`adStatus_${ad.status}` as "adStatus_published") : t("adStatus_none"), href: "/cleaners/new" });
    stats.push({ label: t("statRequests"), value: openRequests, href: "/messages" });
    stats.push({ label: t("statConnections"), value: activeConnections, href: "/messages" });
    rows.push({ href: "/cleaners/new", label: ad ? t("myAd") : t("createAd"), badge: ad ? t(`adStatus_${ad.status}` as "adStatus_published") : undefined });
    rows.push({ href: "/messages", label: t("messages"), badge: openRequests ? t("newRequests", { count: openRequests }) : undefined });
    rows.push({ href: "/jobs", label: t("jobsBoard") });
    rows.push({ href: "/cleaners/slots", label: t("mySlots") });
    rows.push({ href: "/cleaners/emergency", label: t("myEmergency") });
  }

  if (user.role === "household" || user.role === "admin") {
    const { count: favCount } = await supabase.from("favourites").select("cleaner_profile_id", { count: "exact", head: true }).eq("user_id", user.id);
    stats.push({ label: t("statConversations"), value: conversationCount ?? 0, href: "/messages" });
    stats.push({ label: t("statConnections"), value: activeConnections, href: "/messages" });
    stats.push({ label: t("statFavourites"), value: favCount ?? 0, href: "/favourites" });
    rows.push({ href: "/messages", label: t("messages"), badge: pendingDeals ? t("pendingDeals", { count: pendingDeals }) : undefined });
    rows.push({ href: "/favourites", label: t("favourites") });
    rows.push({ href: "/search", label: t("findCleaner") });
    rows.push({ href: "/emergency", label: t("emergencyRequest") });
  }

  if (user.role === "business") {
    stats.push({ label: t("statConversations"), value: conversationCount ?? 0, href: "/messages" });
    rows.push({ href: "/business/dashboard", label: t("businessDashboard"), strong: true });
    rows.push({ href: "/jobs/new", label: t("postJob") });
    rows.push({ href: "/messages", label: t("messages") });
    rows.push({ href: "/search", label: t("findCleaner") });
  }

  return (
    <section className="mx-auto max-w-md px-4 py-10">
      <h1 className="headline text-3xl text-ink">{t("title")}</h1>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-card-lg bg-mint p-4">
        <div>
          <p className="text-sm font-bold text-forest">{t("signedInAs")}</p>
          <p className="text-sm text-ink">{user.email}</p>
          <p className="text-xs text-ink/70">{t(`role_${user.role}` as "role_household")}</p>
        </div>
        <LogoutButton />
      </div>

      {stats.length ? (
        <ul className="mt-4 grid grid-cols-3 gap-2">
          {stats.map((s) => (
            <li key={s.label}>
              <Link href={s.href} className="block rounded-card border border-line bg-white p-3 text-center hover:bg-section">
                <span className="block text-lg font-extrabold text-forest">{s.value}</span>
                <span className="block text-[11px] font-semibold text-ink/70">{s.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      <ul className="mt-4 divide-y divide-line overflow-hidden rounded-card-lg border border-line bg-white">
        {rows.map((r) => (
          <li key={r.href + r.label}>
            <RowLink {...r} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function RowLink({ href, label, strong, badge }: Row) {
  return (
    <Link href={href} className={`flex min-h-14 items-center justify-between gap-3 px-5 font-bold transition-colors hover:bg-section ${strong ? "bg-sun/20 text-forest" : "text-ink"}`}>
      <span>{label}</span>
      <span className="flex items-center gap-2">
        {badge ? <span className="rounded-full bg-mint px-2 py-0.5 text-[11px] font-bold text-forest">{badge}</span> : null}
        <svg viewBox="0 0 16 16" className="h-4 w-4 text-ink/40" fill="none" stroke="currentColor" aria-hidden="true">
          <path d="m6 3 5 5-5 5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </Link>
  );
}
