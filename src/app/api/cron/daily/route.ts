import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { GET as checkins } from "../checkins/route";
import { GET as icalSync } from "../ical-sync/route";
import { GET as emergency } from "../emergency/route";
import { GET as jobs } from "../jobs/route";

/**
 * Daily maintenance bundle. Vercel's Hobby plan allows only two cron jobs
 * per project, each at most once a day, so the three housekeeping tasks
 * run together here (together with the job housekeeping). On Vercel Pro, schedule the individual routes
 * directly at their intended frequencies (see README).
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const results: Record<string, unknown> = {};
  for (const [name, handler] of [
    ["checkins", checkins],
    ["icalSync", icalSync],
    ["emergency", emergency],
    ["jobs", jobs],
  ] as const) {
    try {
      const res = await handler(request);
      results[name] = { status: res.status, body: await res.json().catch(() => null) };
    } catch (err) {
      results[name] = { status: 500, error: err instanceof Error ? err.message : "failed" };
    }
  }
  return NextResponse.json({ ok: true, results });
}
