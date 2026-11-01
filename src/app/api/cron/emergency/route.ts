import { NextResponse } from "next/server";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";

/**
 * Emergency housekeeping (brief v2 §8): expire unanswered requests once
 * their window starts (nothing charged), and delete household addresses
 * 7 days after the job. Runs every 10 minutes on Vercel Pro.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 200 });
  const admin = createSupabaseAdmin(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await admin.rpc("expire_emergency_requests");
  if (error) return NextResponse.json({ ok: false }, { status: 500 });
  return NextResponse.json({ ok: true, expired: data });
}
