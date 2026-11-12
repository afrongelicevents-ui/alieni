import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { SessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { profilePhotoUrl } from "@/lib/cleaners-live";
import { getWorkForCleaner } from "@/lib/business-data";
import { ButtonLink } from "@/components/ui/Button";

/** Cleaner dashboard: profile state, requests, clients, today's work. */
export async function CleanerHome({ user }: { user: SessionUser }) {
  const t = await getTranslations("cleanerHome");
  const supabase = (await createClient())!;

  const { data: ad } = await supabase
    .from("cleaner_profiles")
    .select("id, status, photo_path, about, services, job_types, work_scope, rate_cents, availability_slots ( id )")
    .eq("user_id", user.id)
    .maybeSingle();
  const adRow = ad as { id: string; status: string; photo_path: string | null; about: string | null; services: string[]; job_types: string[]; work_scope: string; rate_cents: number; availability_slots: { id: string }[] | null } | null;

  // Completeness: what still blocks a strong profile.
  const checks = adRow
    ? [
        { key: "photo", done: Boolean(adRow.photo_path), href: "/profile" },
        { key: "about", done: Boolean(adRow.about && adRow.about.length >= 40), href: "/profile?step=1&edit=1" },
        { key: "availability", done: (adRow.availability_slots?.length ?? 0) > 0, href: "/profile?step=3&edit=1" },
      ]
    : [];
  const completeness = adRow ? Math.round((checks.filter((c) => c.done).length / checks.length) * 100) : 0;

  const [requests, conns, work] = await Promise.all([
    adRow ? supabase.from("meeting_requests").select("id, type, proposed_weekday, proposed_block, household_id, created_at").eq("cleaner_profile_id", adRow.id).eq("status", "requested").order("created_at", { ascending: false }).limit(5) : Promise.resolve({ data: [] }),
    supabase.from("connections").select("id, household_id, status, started_at").eq("cleaner_id", user.id).in("status", ["active", "paused", "pending"]).order("started_at", { ascending: false }),
    adRow ? getWorkForCleaner(adRow.id) : Promise.resolve([]),
  ]);
  const households = [...new Set([...(requests.data ?? []).map((r: { household_id: string }) => r.household_id), ...(conns.data ?? []).map((c: { household_id: string }) => c.household_id)])];
  const { data: names } = households.length ? await supabase.from("profiles").select("id, display_name").in("id", households) : { data: [] };
  const nameOf = new Map(((names ?? []) as { id: string; display_name: string }[]).map((n) => [n.id, n.display_name]));
  const { data: convs } = await supabase.from("conversations").select("id, household_id").eq("cleaner_id", user.id);
  const convOf = new Map(((convs ?? []) as { id: string; household_id: string }[]).map((c) => [c.household_id, c.id]));
  // upcoming visits of awarded jobs (one-off and regular schedules)
  const upcoming = work.filter((w) => w.outcome === "scheduled" && w.scheduled_start && w.scheduled_start >= new Date().toISOString()).sort((a, b) => (a.scheduled_start ?? "").localeCompare(b.scheduled_start ?? "")).slice(0, 3);
  const fmt = (iso: string) => new Date(iso).toLocaleString("nl-NL", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <section className="mx-auto max-w-3xl px-4 py-8">
      <p className="text-xs font-bold uppercase tracking-wide text-forest">{t("eyebrow")}</p>
      <h1 className="headline mt-1 text-3xl text-ink">{t("hello", { name: user.displayName.split(" ")[0] })}</h1>

      {/* Profile card */}
      <section className="mt-6 rounded-card-lg border border-line bg-white p-5">
        <div className="flex items-center gap-4">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-mint text-forest/40">
            {adRow?.photo_path ? (
              // eslint-disable-next-line @next/next/no-img-element -- storage URL, pre-sized
              <img src={profilePhotoUrl(adRow.photo_path) ?? ""} alt="" className="h-full w-full object-cover" />
            ) : (
              <svg viewBox="0 0 24 24" className="h-9 w-9" fill="currentColor" aria-hidden="true"><circle cx="12" cy="9" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
            )}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-extrabold text-ink">{t("profileTitle")}</h2>
            {adRow ? (
              <p className="text-sm text-ink/70">
                <span className={`mr-2 rounded-full px-2 py-0.5 text-xs font-bold ${adRow.status === "published" ? "bg-forest text-white" : "bg-sun/40 text-ink"}`}>{t(`status_${adRow.status}` as "status_published")}</span>
                {t("completeness", { pct: completeness })}
              </p>
            ) : (
              <p className="text-sm text-ink/70">{t("noProfile")}</p>
            )}
          </div>
        </div>
        {adRow ? (
          <>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-section"><div className="h-full bg-forest" style={{ width: `${completeness}%` }} /></div>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {checks.map((c) => (
                <li key={c.key}>
                  <Link href={c.href} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${c.done ? "bg-mint text-forest" : "bg-sun/20 text-ink"}`}>
                    <span aria-hidden="true">{c.done ? "✓" : "○"}</span>{t(`check_${c.key}` as "check_photo")}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="mt-4"><ButtonLink href="/profile" withArrow>{t("createProfile")}</ButtonLink></div>
        )}
      </section>

      {/* Requests */}
      <section className="mt-6">
        <div className="flex items-baseline justify-between"><h2 className="headline text-xl text-ink">{t("requestsTitle")}</h2><Link href="/messages" className="text-sm font-bold text-forest underline">{t("allMessages")}</Link></div>
        {(requests.data ?? []).length === 0 ? (
          <p className="mt-2 rounded-card-lg border border-line bg-white p-4 text-sm text-ink/70">{adRow?.status === "published" ? t("noRequests") : t("noRequestsOffline")}</p>
        ) : (
          <ul className="mt-2 divide-y divide-line overflow-hidden rounded-card-lg border border-line bg-white">
            {(requests.data as { id: string; household_id: string; type: string; created_at: string }[]).map((r) => (
              <li key={r.id}>
                <Link href={convOf.get(r.household_id) ? `/messages/${convOf.get(r.household_id)}` : "/messages"} className="flex items-center justify-between px-4 py-3 hover:bg-section">
                  <span><span className="font-bold text-ink">{nameOf.get(r.household_id) ?? "—"}</span><span className="ml-2 text-sm text-ink/70">{t(`type_${r.type}` as "type_in_person")}</span></span>
                  <span className="rounded-full bg-sun px-3 py-1 text-xs font-bold text-white">{t("respond")}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Clients */}
      <section className="mt-6">
        <h2 className="headline text-xl text-ink">{t("clientsTitle")}</h2>
        {(conns.data ?? []).length === 0 ? (
          <p className="mt-2 rounded-card-lg border border-line bg-white p-4 text-sm text-ink/70">{t("noClients")}</p>
        ) : (
          <ul className="mt-2 divide-y divide-line overflow-hidden rounded-card-lg border border-line bg-white">
            {(conns.data as { id: string; household_id: string; status: string }[]).map((c) => (
              <li key={c.id}>
                <Link href={convOf.get(c.household_id) ? `/messages/${convOf.get(c.household_id)}` : "/messages"} className="flex items-center justify-between px-4 py-3 hover:bg-section">
                  <span className="font-bold text-ink">{nameOf.get(c.household_id) ?? "—"}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${c.status === "active" ? "bg-mint text-forest" : c.status === "paused" ? "bg-red-100 text-red-800" : "bg-sun/40 text-ink"}`}>{t(`conn_${c.status}` as "conn_active")}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Today / upcoming work */}
      <section className="mt-6">
        <div className="flex items-baseline justify-between"><h2 className="headline text-xl text-ink">{t("workTitle")}</h2><Link href="/work" className="text-sm font-bold text-forest underline">{t("allWork")}</Link></div>
        {upcoming.length === 0 ? (
          <p className="mt-2 rounded-card-lg border border-line bg-white p-4 text-sm text-ink/70">{t("noWork")}</p>
        ) : (
          <ul className="mt-2 divide-y divide-line overflow-hidden rounded-card-lg border border-line bg-white">
            {upcoming.map((w) => (
              <li key={w.id} className="flex items-center justify-between gap-3 px-4 py-3"><span className="min-w-0 truncate font-bold text-ink">{[w.company, w.location].filter(Boolean).join(" · ") || "—"}</span><span className="shrink-0 text-sm text-ink/70">{fmt(w.scheduled_start as string)}</span></li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
