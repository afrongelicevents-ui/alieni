import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { all, first, json } from "@/lib/server/db";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;
const lists = (r: Row | null, keys: string[]) => {
  if (!r) return r;
  const out: Row = { ...r };
  for (const k of keys) if (k in out) out[k] = json(out[k], []);
  return out;
};

/**
 * "Download my data" (AVG right of access): everything about the signed-in person, as one JSON file.
 * Every query is filtered on the signed-in user's own id (or their own cleaner ad / company), so an admin
 * or anyone else never exports other people's rows. Secrets (password hashes, sessions, 2FA secrets, exact
 * home location) are never part of it. Payments are off, so there are no invoices.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  const uid = user.id;

  const account = await first<Row>('SELECT id, email, emailVerified AS email_verified, twoFactorEnabled AS two_factor_enabled, createdAt AS created_at FROM "user" WHERE id = ?', uid);
  const profile = await first<Row>("SELECT id, role, display_name, city, locale, created_at FROM profiles WHERE id = ?", uid);
  const household = lists(await first<Row>("SELECT postcode_area, needs, home_type, updated_at FROM household_profiles WHERE user_id = ?", uid), ["needs"]);
  const ad = lists(
    await first<Row>(
      "SELECT id, status, rate_cents, min_hours, services, languages, postcode, postcode_area, radius_km, about, job_types, work_scope, work_types, experience_years, works_as, verified_jobs_count, created_at, updated_at FROM cleaner_profiles WHERE user_id = ?",
      uid,
    ),
    ["services", "languages", "job_types", "work_types"],
  );
  const cleanerId = (ad?.id as string | undefined) ?? null;
  const availability = cleanerId ? await all<Row>("SELECT weekday, block FROM availability_slots WHERE cleaner_profile_id = ? ORDER BY weekday, block", cleanerId) : [];
  const business = await first<Row>(
    "SELECT id, company_name, kvk_number, btw_number, business_type, contact_first_name, contact_last_name, unit_count, created_at FROM business_profiles WHERE user_id = ?",
    uid,
  );
  const businessId = (business?.id as string | undefined) ?? null;
  const units = businessId ? await all<Row>("SELECT name, address_line, postcode, city, created_at FROM business_units WHERE business_id = ?", businessId) : [];
  const jobs = businessId
    ? (await all<Row>("SELECT id, status, space_type, frequency, postcode, city, description, budget_cents, weekdays, visit_start, visit_hours, start_date, end_date, created_at FROM jobs WHERE business_id = ? ORDER BY created_at DESC LIMIT 500", businessId)).map((j) => lists(j, ["weekdays"]))
    : [];

  const favourites = await all<Row>("SELECT cleaner_profile_id, created_at FROM favourites WHERE user_id = ?", uid);
  const conversations = await all<Row>("SELECT id, household_id, cleaner_id, created_at, last_message_at FROM conversations WHERE household_id = ? OR cleaner_id = ? ORDER BY created_at", uid, uid);
  // Messages of the person's own conversations only (the join keeps the filter on the person's id).
  const messages = await all<Row>(
    `SELECT m.conversation_id, m.sender_id, m.body, m.created_at FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
      WHERE c.household_id = ? OR c.cleaner_id = ? ORDER BY m.created_at LIMIT 10000`,
    uid,
    uid,
  );
  const connections = await all<Row>("SELECT id, household_id, cleaner_id, status, started_at, ended_at, created_at FROM connections WHERE household_id = ? OR cleaner_id = ?", uid, uid);
  const meetings = await all<Row>(
    "SELECT id, cleaner_profile_id, type, proposed_weekday, proposed_block, message, status, created_at FROM meeting_requests WHERE household_id = ? OR cleaner_profile_id = ? LIMIT 500",
    uid,
    cleanerId ?? "",
  );
  const work = await all<Row>(
    "SELECT id, service_key, scheduled_start, scheduled_end, completed_at, outcome, notes FROM work_records WHERE household_id = ? OR business_id = ? OR cleaner_profile_id = ? ORDER BY scheduled_start DESC LIMIT 2000",
    uid,
    businessId ?? "",
    cleanerId ?? "",
  );
  const reviews = await all<Row>("SELECT id, connection_id, subject_id, rating, body, created_at FROM reviews WHERE author_id = ? LIMIT 500", uid);
  const quotations = cleanerId ? await all<Row>("SELECT id, job_id, rate_cents, message, status, valid_until, created_at, decided_at FROM job_responses WHERE cleaner_profile_id = ? LIMIT 500", cleanerId) : [];
  const reports = await all<Row>("SELECT subject_type, reason, details, status, created_at FROM reports WHERE reporter_id = ? LIMIT 500", uid);

  const body = {
    exported_at: new Date().toISOString(),
    account,
    profile,
    household_preferences: household,
    cleaner_ad: ad ? { ...ad, availability } : null,
    business: business ? { ...business, units, jobs } : null,
    favourites,
    meeting_requests: meetings,
    conversations: conversations.map((c) => ({ ...c, messages: messages.filter((m) => m.conversation_id === c.id) })),
    connections,
    work_records: work,
    reviews_written: reviews,
    quotations,
    reports_made: reports,
  };
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="alieni-my-data-${new Date().toISOString().slice(0, 10)}.json"`,
      "cache-control": "no-store",
    },
  });
}
