import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { SessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { profilePhotoUrl } from "@/lib/cleaners-live";
import { SERVICE_LABELS } from "@/lib/sample-data";
import { ButtonLink } from "@/components/ui/Button";
import { HouseholdOnboarding } from "./HouseholdOnboarding";

/** Household dashboard: "your cleaner" state card, requests, favourites, emergency. */
export async function HouseholdHome({ user }: { user: SessionUser }) {
  const t = await getTranslations("householdHome");
  const lang = ((await getLocale()) === "en" ? "en" : "nl") as "nl" | "en";
  const supabase = (await createClient())!;

  const [{ data: hp }, { data: conns }, { data: requests }, { count: favCount }, { data: convs }] = await Promise.all([
    supabase.from("household_profiles").select("postcode_area, needs, home_type").eq("user_id", user.id).maybeSingle(),
    supabase.from("connections").select("id, cleaner_id, status, started_at, household_confirmed_at, cleaner_confirmed_at").eq("household_id", user.id).in("status", ["active", "paused", "pending"]).order("started_at", { ascending: false }),
    supabase.from("meeting_requests").select("id, cleaner_profile_id, status, created_at").eq("household_id", user.id).order("created_at", { ascending: false }).limit(5),
    supabase.from("favourites").select("cleaner_profile_id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("conversations").select("id, cleaner_id").eq("household_id", user.id),
  ]);
  const profile = hp as { postcode_area: string | null; needs: string[]; home_type: string | null } | null;
  const convOf = new Map(((convs ?? []) as { id: string; cleaner_id: string }[]).map((c) => [c.cleaner_id, c.id]));

  // Cleaner details for connections and requests.
  const cleanerUserIds = ((conns ?? []) as { cleaner_id: string }[]).map((c) => c.cleaner_id);
  const requestProfileIds = ((requests ?? []) as { cleaner_profile_id: string }[]).map((r) => r.cleaner_profile_id);
  const [{ data: cpByUser }, { data: cpById }] = await Promise.all([
    cleanerUserIds.length ? supabase.from("cleaner_profiles").select("id, user_id, photo_path, rate_cents, profiles ( display_name, city )").in("user_id", cleanerUserIds) : Promise.resolve({ data: [] }),
    requestProfileIds.length ? supabase.from("cleaner_profiles").select("id, user_id, photo_path, profiles ( display_name )").in("id", requestProfileIds) : Promise.resolve({ data: [] }),
  ]);
  type Cp = { id: string; user_id: string; photo_path: string | null; rate_cents?: number; profiles: { display_name: string; city?: string | null } | null };
  const byUser = new Map(((cpByUser ?? []) as unknown as Cp[]).map((c) => [c.user_id, c]));
  const byId = new Map(((cpById ?? []) as unknown as Cp[]).map((c) => [c.id, c]));

  const active = ((conns ?? []) as { id: string; cleaner_id: string; status: string; household_confirmed_at: string | null; cleaner_confirmed_at: string | null }[]);
  const searchHref = profile?.postcode_area ? `/search?q=${profile.postcode_area}` : "/search";

  return (
    <section className="mx-auto max-w-3xl px-4 py-8">
      <p className="text-xs font-bold uppercase tracking-wide text-forest">{t("eyebrow")}</p>
      <h1 className="headline mt-1 text-3xl text-ink">{t("hello", { name: user.displayName.split(" ")[0] })}</h1>

      {!profile ? <div className="mt-6"><HouseholdOnboarding /></div> : null}

      {/* Your cleaner */}
      <section className="mt-6 rounded-card-lg border border-line bg-white p-5">
        <h2 className="font-extrabold text-ink">{t("yourCleaner")}</h2>
        {active.length === 0 ? (
          <div className="mt-2">
            <p className="text-sm text-ink/70">{t("noCleanerYet")}</p>
            {profile?.needs?.length ? (
              <p className="mt-2 flex flex-wrap gap-1.5">{profile.needs.map((n) => <span key={n} className="rounded-full bg-mint px-2.5 py-0.5 text-xs font-bold text-forest">{SERVICE_LABELS[n]?.[lang] ?? n}</span>)}</p>
            ) : null}
            <div className="mt-4"><ButtonLink href={searchHref} withArrow>{profile?.postcode_area ? t("findNear", { area: profile.postcode_area }) : t("find")}</ButtonLink></div>
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {active.map((c) => {
              const cp = byUser.get(c.cleaner_id);
              const name = cp?.profiles?.display_name ?? "—";
              const waiting = c.status === "pending";
              return (
                <li key={c.id} className="flex items-center gap-3 py-3">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-mint">
                    {cp?.photo_path ? (
                      // eslint-disable-next-line @next/next/no-img-element -- storage URL, pre-sized
                      <img src={profilePhotoUrl(cp.photo_path) ?? ""} alt="" className="h-full w-full object-cover" />
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-ink">{name}</span>
                    <span className="block text-xs text-ink/70">
                      {waiting ? (c.household_confirmed_at ? t("waitingCleaner", { name }) : t("waitingYou")) : c.status === "paused" ? t("paused") : t("connected")}
                    </span>
                  </span>
                  <Link href={convOf.get(c.cleaner_id) ? `/messages/${convOf.get(c.cleaner_id)}` : "/messages"} className="rounded-full bg-forest px-4 py-2 text-xs font-bold text-white">{waiting ? t("openDeal") : t("openChat")}</Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Requests */}
      {(requests ?? []).length > 0 ? (
        <section className="mt-6">
          <div className="flex items-baseline justify-between"><h2 className="headline text-xl text-ink">{t("requestsTitle")}</h2><Link href="/messages" className="text-sm font-bold text-forest underline">{t("allMessages")}</Link></div>
          <ul className="mt-2 divide-y divide-line overflow-hidden rounded-card-lg border border-line bg-white">
            {(requests as { id: string; cleaner_profile_id: string; status: string }[]).map((r) => {
              const cp = byId.get(r.cleaner_profile_id);
              return (
                <li key={r.id}>
                  <Link href={cp && convOf.get(cp.user_id) ? `/messages/${convOf.get(cp.user_id)}` : "/messages"} className="flex items-center justify-between px-4 py-3 hover:bg-section">
                    <span className="font-bold text-ink">{cp?.profiles?.display_name ?? "—"}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${r.status === "accepted" ? "bg-mint text-forest" : r.status === "declined" ? "bg-section text-ink/60" : "bg-sun/40 text-ink"}`}>{t(`req_${r.status}` as "req_requested")}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* Shortcuts */}
      <ul className="mt-6 grid grid-cols-2 gap-3">
        <li><Link href="/favourites" className="flex min-h-20 flex-col items-center justify-center rounded-card-lg border border-line bg-white px-3 text-center hover:bg-mint"><span className="text-lg font-extrabold text-forest">{favCount ?? 0}</span><span className="text-xs font-semibold text-ink/70">{t("favourites")}</span></Link></li>
        <li><Link href="/emergency" className="flex min-h-20 flex-col items-center justify-center rounded-card-lg border border-sun bg-sun/15 px-3 text-center hover:bg-sun/25"><span className="text-sm font-extrabold text-ink">{t("emergency")}</span><span className="text-xs font-semibold text-ink/70">{t("emergencySub")}</span></Link></li>
      </ul>

      {profile ? (
        <p className="mt-6 text-xs text-ink/60">
          {t("prefs", { area: profile.postcode_area ?? "—" })} <Link href="/account" className="font-bold text-forest underline">{t("editPrefs")}</Link>
        </p>
      ) : null}
    </section>
  );
}
