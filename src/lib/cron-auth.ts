import { timingSafeEqual } from "node:crypto";

/** Constant-time check of the Vercel Cron bearer secret. */
export function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
