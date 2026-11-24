import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { expireStaleJobs, generateAllJobVisits } from "@/lib/jobs-data";
import { run } from "@/lib/server/db";

/**
 * Job housekeeping: close published jobs past their expiry date, build the next four weeks of visits for every
 * awarded regular job, and the retention clean-up (chats two years after the last message unless the deal is still
 * active; handled reports two years after handling). Safe to run any number of times.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  try {
    const expired = await expireStaleJobs();
    const visitsAdded = await generateAllJobVisits(28);
    const cutoff = new Date(Date.now() - 2 * 365.25 * 864e5).toISOString();
    const conversations = await run(
      `DELETE FROM conversations WHERE COALESCE(last_message_at, created_at) < ?
         AND NOT EXISTS (SELECT 1 FROM connections cn WHERE cn.household_id = conversations.household_id AND cn.cleaner_id = conversations.cleaner_id AND cn.status = 'active')`,
      cutoff,
    );
    const reports = await run("DELETE FROM reports WHERE status <> 'open' AND COALESCE(resolved_at, created_at) < ?", cutoff);
    return NextResponse.json({ ok: true, expired, visitsAdded, purged: { conversations, reports } });
  } catch {
    return NextResponse.json({ ok: false, reason: "failed" }, { status: 200 });
  }
}
