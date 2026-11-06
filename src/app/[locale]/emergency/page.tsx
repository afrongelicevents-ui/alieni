import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { EmergencyRequestForm, type ActiveRequest } from "@/components/emergency/EmergencyRequestForm";
import { requireRole } from "@/lib/guard";
import { createClient } from "@/lib/supabase/server";
import { BusinessCoverPanel, type CoverUnit } from "@/components/emergency/BusinessCoverPanel";
import { getCoverRequests, getCoverRules } from "@/lib/cover-data";
import { getActiveRules, ruleFor } from "@/lib/services";

export const dynamic = "force-dynamic";

export default async function EmergencyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("emergency");
  const user = await requireRole(locale, ["household", "business"], "/emergency", { adminAllowed: false });

  // Businesses get the full cover experience (Phase 2); households keep their same-day form unchanged.
  if (user.role === "business") {
    const supabase = (await createClient())!;
    const { data: bp } = await supabase.from("business_profiles").select("id, business_type").eq("user_id", user.id).maybeSingle();
    if (!bp) redirect(`/${locale}/business/signup`); // a business without a company profile cannot use the household form
    const [{ data: units }, requests, rules, pricing] = await Promise.all([
      supabase.from("business_units").select("id, name, address_line, postcode, city").eq("business_id", bp.id).order("created_at"),
      getCoverRequests(user.id),
      getCoverRules(),
      getActiveRules(),
    ]);
    const rule = ruleFor(pricing, "cover", bp.business_type);
    return (
      <section className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="headline text-3xl text-ink">{t("bizTitle")}</h1>
        <p className="mt-2 text-ink/70">{t("bizIntro")}</p>
        <div className="mt-6">
          <BusinessCoverPanel units={(units ?? []) as CoverUnit[]} requests={requests} rules={rules} ruleAmountCents={rule && (rule.model === "per_event" || rule.model === "per_booking") ? rule.amount_cents : null} serverNow={new Date().toISOString()} />
        </div>
      </section>
    );
  }

  let active: ActiveRequest | null = null;
  let requesterType: "household" | "business" = "household";
  const since = new Date();
  since.setHours(since.getHours() - 12);
  {
    const supabase = (await createClient())!;
    const [{ data: bp }, { data: reqs }] = await Promise.all([
      supabase.from("business_profiles").select("id").eq("user_id", user.id).maybeSingle(),
      supabase
        .from("emergency_requests")
        .select("id, status, window_start, window_end, fee_cents, accepted_by")
        .eq("requester_id", user.id)
        .in("status", ["searching", "accepted", "expired", "cancelled"])
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
        <EmergencyRequestForm active={active} requesterType={requesterType} />
      </div>
    </section>
  );
}
