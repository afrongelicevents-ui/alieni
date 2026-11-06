import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";

/**
 * Job housekeeping: close published jobs past their expiry date and build the next four weeks of visits
 * for every regular job that has been awarded. Safe to run any number of times.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 200 });
  const admin = createSupabaseAdmin(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const expired = await admin.rpc("expire_stale_jobs");
  const visits = await admin.rpc("generate_all_job_visits", { p_days_ahead: 28 });
  // retention: chats two years after the last message and handled reports two years after handling (Part 17; ignored until then)
  const purged = await admin.rpc("purge_old_records");
  // Part 15 not run yet: report it instead of failing the whole daily bundle
  if (expired.error || visits.error) return NextResponse.json({ ok: false, reason: "db_outdated_or_failed" }, { status: 200 });
  return NextResponse.json({ ok: true, expired: expired.data, visitsAdded: visits.data, purged: purged.error ? null : purged.data });
}
