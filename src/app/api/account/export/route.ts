import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * "Download my data" (AVG right of access): everything the signed-in person can read about themselves, as one JSON
 * file. Runs with the person's own session, so the database rules decide what is included. Secrets (payment
 * provider ids, exact home location) are never part of it.
 */
export async function GET() {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  const uid = user.id;

  const rows = async (q: PromiseLike<{ data: unknown; error: unknown }>) => {
    const { data, error } = await q;
    return error ? null : data;
  };

  const rpcResult = await supabase.rpc("my_cleaner_postcode");
  const ownPostcode = rpcResult.error ? (await supabase.from("cleaner_profiles").select("postcode").eq("user_id", uid).maybeSingle()).data?.postcode : rpcResult.data;
  const [profile, household, ad, favourites, conversations, connections, business] = await Promise.all([
    rows(supabase.from("profiles").select("id, role, display_name, city, locale, created_at").eq("id", uid).maybeSingle()),
    rows(supabase.from("household_profiles").select("postcode_area, needs, home_type, updated_at").eq("user_id", uid).maybeSingle()),
    rows(supabase.from("cleaner_profiles").select("id, status, rate_cents, min_hours, services, languages, radius_km, about, photo_path, job_types, work_scope, work_types, experience_years, works_as, emergency_opt_in, emergency_rate_cents, verified_jobs_count, created_at, availability_slots ( weekday, block ), vog_documents ( status, issued_at )").eq("user_id", uid).maybeSingle()),
    rows(supabase.from("favourites").select("cleaner_profile_id, created_at").eq("user_id", uid)),
    rows(supabase.from("conversations").select("id, household_id, cleaner_id, created_at, messages ( sender_id, body, created_at )").or(`household_id.eq.${uid},cleaner_id.eq.${uid}`)),
    rows(supabase.from("connections").select("id, household_id, cleaner_id, status, started_at, created_at").or(`household_id.eq.${uid},cleaner_id.eq.${uid}`)),
    rows(supabase.from("business_profiles").select("id, company_name, kvk_number, btw_number, business_type, contact_first_name, contact_last_name, unit_count, created_at, business_units ( name, address_line, postcode, city ), jobs ( id, status, space_type, frequency, postcode, city, description, created_at )").eq("user_id", uid).maybeSingle()),
  ]);

  // Explicit filters: an admin (who can read everything) or a cleaner must never export other people's rows.
  const cleanerId = (ad as { id?: string } | null)?.id ?? null;
  const businessId = (business as { id?: string } | null)?.id ?? null;
  const mine = (...parts: (string | null)[]) => parts.filter(Boolean).join(",");
  const [meetings, work, invoices, reviews, quotations, feeEvents] = await Promise.all([
    rows(supabase.from("meeting_requests").select("id, cleaner_profile_id, type, proposed_weekday, proposed_block, message, status, created_at").or(mine(`household_id.eq.${uid}`, cleanerId && `cleaner_profile_id.eq.${cleanerId}`)).limit(500)),
    rows(supabase.from("work_records").select("id, service_key, scheduled_start, scheduled_end, completed_at, outcome, notes").or(mine(`household_id.eq.${uid}`, businessId && `business_id.eq.${businessId}`, cleanerId && `cleaner_profile_id.eq.${cleanerId}`)).limit(2000)),
    rows(supabase.from("invoices").select("number, gross_cents, net_cents, btw_cents, issued_at").or(mine(`household_id.eq.${uid}`, businessId && `business_id.eq.${businessId}`)).limit(500)),
    rows(supabase.from("reviews").select("id, connection_id, subject_id, rating, body, created_at").eq("author_id", uid).limit(500)),
    cleanerId ? rows(supabase.from("job_responses").select("id, job_id, rate_cents, message, status, valid_until, created_at, decided_at").eq("cleaner_profile_id", cleanerId).limit(500)) : Promise.resolve(null),
    businessId ? rows(supabase.from("fee_events").select("id, service_key, event_type, reference_table, reference_id, occurred_at, model, amount_cents, btw_cents, status, created_at").eq("business_id", businessId).limit(2000)) : Promise.resolve(null),
  ]);

  const body = {
    exported_at: new Date().toISOString(),
    account: { id: uid, email: user.email, created_at: user.created_at },
    profile,
    household_preferences: household,
    cleaner_ad: ad ? { ...(ad as object), postcode: typeof ownPostcode === "string" ? ownPostcode : null } : null,
    favourites,
    meeting_requests: meetings,
    conversations,
    connections,
    business,
    work_records: work,
    invoices,
    reviews_written: reviews,
    quotations,
    fee_events: feeEvents,
  };
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="alieni-my-data-${new Date().toISOString().slice(0, 10)}.json"`,
      "cache-control": "no-store",
    },
  });
}
