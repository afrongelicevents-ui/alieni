import { getTranslations, setRequestLocale } from "next-intl/server";
import { EmergencyCleanerList, type MineRequest, type OpenRequest } from "@/components/emergency/EmergencyCleanerList";
import { LoginPrompt } from "@/components/auth/LoginPrompt";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function CleanerEmergencyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("emergency");
  const user = await getSessionUser();

  let open: OpenRequest[] = [];
  let mine: MineRequest[] = [];
  let optedIn = false;
  let myRateCents: number | null = null;
  if (user) {
    const supabase = (await createClient())!;
    const { data: cp } = await supabase.from("cleaner_profiles").select("id, emergency_opt_in, emergency_rate_cents, rate_cents").eq("user_id", user.id).maybeSingle();
    optedIn = Boolean(cp?.emergency_opt_in);
    myRateCents = cp?.emergency_rate_cents ?? cp?.rate_cents ?? null;
    if (cp) {
      const [{ data: openRows }, { data: mineRows }] = await Promise.all([
        optedIn ? supabase.from("emergency_requests_open").select("id, postcode, city, window_start, window_end, hours, tasks").order("window_start").limit(50) : Promise.resolve({ data: [] }),
        supabase.from("emergency_requests").select("id, postcode, city, address_line, window_start, window_end, hours, tasks, requester_id").eq("accepted_by", cp.id).eq("status", "accepted").order("window_start", { ascending: false }).limit(20),
      ]);
      open = ((openRows ?? []) as { id: string; postcode: string; city: string; window_start: string; window_end: string; hours: number; tasks: string }[]).map((r) => ({ id: r.id, postcode: r.postcode, city: r.city, windowStart: r.window_start, windowEnd: r.window_end, hours: Number(r.hours), tasks: r.tasks }));
      const requesterIds = [...new Set(((mineRows ?? []) as { requester_id: string }[]).map((r) => r.requester_id))];
      const nameOf = new Map<string, string>();
      if (requesterIds.length) {
        const { data: names } = await supabase.from("profiles").select("id, display_name").in("id", requesterIds);
        for (const n of (names ?? []) as { id: string; display_name: string }[]) nameOf.set(n.id, n.display_name);
      }
      mine = ((mineRows ?? []) as { id: string; postcode: string; city: string; address_line: string | null; window_start: string; window_end: string; hours: number; tasks: string; requester_id: string }[]).map((r) => ({
        id: r.id, postcode: r.postcode, city: r.city, addressLine: r.address_line, windowStart: r.window_start, windowEnd: r.window_end, hours: Number(r.hours), tasks: r.tasks, requesterName: nameOf.get(r.requester_id) ?? null,
      }));
    }
  }

  return (
    <section className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="headline text-3xl text-ink">{t("cleanerTitle")}</h1>
      <p className="mt-2 text-sm text-ink/70">{t("cleanerIntro")}</p>
      <div className="mt-6">
        {user ? <EmergencyCleanerList open={open} mine={mine} optedIn={optedIn} myRateCents={myRateCents} /> : <LoginPrompt next="/cleaners/emergency" />}
      </div>
    </section>
  );
}
