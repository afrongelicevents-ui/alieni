import "server-only";
import { first } from "./server/db";

/** The connection a customer may review a cleaner on: both sides confirmed the deal (as on alieni-nl). */
export async function reviewableConnection(userId: string, cleanerProfileId: string): Promise<{ connectionId: string; cleanerUserId: string } | null> {
  const cp = await first<{ user_id: string }>("SELECT user_id FROM cleaner_profiles WHERE id = ?", cleanerProfileId);
  if (!cp || cp.user_id === userId) return null;
  const conn = await first<{ id: string }>(
    `SELECT id FROM connections WHERE household_id = ? AND cleaner_id = ?
        AND household_confirmed_at IS NOT NULL AND cleaner_confirmed_at IS NOT NULL`, userId, cp.user_id);
  return conn ? { connectionId: conn.id, cleanerUserId: cp.user_id } : null;
}

/** True when this person has a confirmed deal with the cleaner and has not reviewed it yet. */
export async function canReview(userId: string, cleanerProfileId: string): Promise<boolean> {
  const c = await reviewableConnection(userId, cleanerProfileId);
  if (!c) return false;
  const done = await first("SELECT 1 AS x FROM reviews WHERE connection_id = ? AND author_id = ?", c.connectionId, userId);
  return !done;
}
