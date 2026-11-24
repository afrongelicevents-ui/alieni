"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { errorCode, requireUser } from "@/lib/auth";
import { first, nowIso, rateLimit, run, uuid } from "@/lib/server/db";
import { reviewableConnection } from "@/lib/reviews-data";
import { findBannedWord, getBannedWords } from "@/lib/site-settings";

export type ReviewActionState = { ok: boolean; error?: string };

const reviewSchema = z.object({
  cleanerProfileId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().max(1000),
});

/**
 * A household or business reviews a cleaner after a confirmed deal (both sides confirmed). One review per
 * connection (also a UNIQUE rule in D1). The review shows the date and rating, never the author's name.
 */
export async function submitReview(input: z.input<typeof reviewSchema>): Promise<ReviewActionState> {
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { cleanerProfileId, rating, body } = parsed.data;
  if (body && findBannedWord(body, await getBannedWords())) return { ok: false, error: "banned_word" };
  try {
    const { userId } = await requireUser();
    if (!(await rateLimit(`review:${userId}`, 10, 60 * 60))) return { ok: false, error: "rate_limit" };
    const exists = await first("SELECT 1 AS x FROM cleaner_profiles WHERE id = ?", cleanerProfileId);
    if (!exists) return { ok: false, error: "not_available" };
    const conn = await reviewableConnection(userId, cleanerProfileId);
    if (!conn) return { ok: false, error: "no_connection" };
    const done = await first("SELECT 1 AS x FROM reviews WHERE connection_id = ? AND author_id = ?", conn.connectionId, userId);
    if (done) return { ok: false, error: "already" };
    try {
      await run("INSERT INTO reviews (id, connection_id, author_id, subject_id, rating, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        uuid(), conn.connectionId, userId, conn.cleanerUserId, rating, body || null, nowIso());
    } catch (e) {
      return { ok: false, error: /UNIQUE/i.test(String(e)) ? "already" : "save_failed" };
    }
    revalidatePath(`/cleaners/${cleanerProfileId}`);
    revalidatePath("/search");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}
