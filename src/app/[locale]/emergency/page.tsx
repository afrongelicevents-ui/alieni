import { getTranslations, setRequestLocale } from "next-intl/server";
import { EmergencyRequestForm, type ActiveRequest } from "@/components/emergency/EmergencyRequestForm";
import { LoginPrompt } from "@/components/auth/LoginPrompt";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function EmergencyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("emergency");
  const user = await getSessionUser();

  let active: ActiveRequest | null = null;
  let requesterType: "household" | "business" = "household";
  const since = new Date();
  since.setHours(since.getHours() - 12);
  if (user) {
    const supabase = (await createClient())!;
    const [{ data: bp }, { data: reqs }] = await Promise.all([
      supabase.from("business_profiles").select("id").eq("user_id", user.id).maybeSingle(),
      supabase
        .from("emergency_requests")
        .select("id, status, window_start, window_end, fee_cents, accepted_by")
        .eq("requester_id", user.id)
        .in("status", ["searching", "accepted"])
        .gte("window_end", since.toISOString())
        .order("created_at", { ascending: false })
        .limit(1),
    ]);
    requesterType = bp ? "business" : "household";
    const r = reqs?.[0];
    if (r) {
      let cleanerName: string | null = null;
      let cleanerRateCents: number | null = null;
      if (r.accepted_by) {
        const { data: cp } = await supabase.from("cleaner_profiles").select("emergency_rate_cents, rate_cents, profiles ( display_name )").eq("id", r.accepted_by).maybeSingle();
        const row = cp as unknown as { emergency_rate_cents: number | null; rate_cents: number; profiles: { display_name: string } | null } | null;
        cleanerName = row?.profiles?.display_name ?? null;
        cleanerRateCents = row?.emergency_rate_cents ?? row?.rate_cents ?? null;
      }
      active = { id: r.id, status: r.status, windowStart: r.window_start, windowEnd: r.window_end, feeCents: r.fee_cents, cleanerName, cleanerRateCents };
    }
  }

  return (
    <section className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="headline text-3xl text-ink">{t("title")}</h1>
      <p className="mt-2 text-ink/70">{t("intro")}</p>
      <div className="mt-6">
        {user ? <EmergencyRequestForm active={active} requesterType={requesterType} /> : <LoginPrompt next="/emergency" text={t("loginText")} />}
      </div>
    </section>
  );
}
