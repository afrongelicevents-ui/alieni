import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { GET as checkins } from "../checkins/route";
import { GET as jobs } from "../jobs/route";

/**
 * Daily maintenance bundle, called once a day by the Worker's free cron trigger (worker.ts) with
 * `Authorization: Bearer <CRON_SECRET>`: chat check-ins and job housekeeping.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const results: Record<string, unknown> = {};
  for (const [name, handler] of [
    ["checkins", checkins],
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
