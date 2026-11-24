"use server";

import { getSessionUser } from "@/lib/auth";
import { all, batch, first, nowIso, rateLimit, run } from "@/lib/server/db";

/**
 * Favourites of the signed-in household or business: own rows only (WHERE user_id = the session user).
 * Signed out (null) the browser keeps hearts on the device.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function customer() {
  const user = await getSessionUser();
  return user && (user.role === "household" || user.role === "business") ? user : null;
}

/** The signed-in user's favourite ad ids; null when signed out or not a customer account. */
export async function listMyFavourites(): Promise<string[] | null> {
  const user = await customer();
  if (!user) return null;
  const rows = await all<{ cleaner_profile_id: string }>("SELECT cleaner_profile_id FROM favourites WHERE user_id = ? ORDER BY created_at", user.id);
  return rows.map((r) => r.cleaner_profile_id);
}

/** Add or remove one favourite. Only published ads can be added. */
export async function setFavourite(cleanerProfileId: string, on: boolean): Promise<{ ok: boolean }> {
  if (!UUID.test(cleanerProfileId)) return { ok: false };
  const user = await customer();
  if (!user) return { ok: false };
  if (!(await rateLimit(`fav:${user.id}`, 60, 60))) return { ok: false };
  if (!on) {
    await run("DELETE FROM favourites WHERE user_id = ? AND cleaner_profile_id = ?", user.id, cleanerProfileId);
    return { ok: true };
  }
  const ad = await first("SELECT 1 AS x FROM cleaner_profiles WHERE id = ? AND status = 'published' AND user_id <> ?", cleanerProfileId, user.id);
  if (!ad) return { ok: false };
  await run("INSERT OR IGNORE INTO favourites (user_id, cleaner_profile_id, created_at) VALUES (?, ?, ?)", user.id, cleanerProfileId, nowIso());
  return { ok: true };
}

/** Hearts given while signed out move into the account on sign-in (unknown / unpublished ids are skipped). */
export async function mergeFavourites(ids: string[]): Promise<string[] | null> {
  const user = await customer();
  if (!user) return null;
  const wanted = [...new Set(ids.filter((id) => typeof id === "string" && UUID.test(id)))].slice(0, 50);
  if (wanted.length) {
    const published = await all<{ id: string }>(
      `SELECT id FROM cleaner_profiles WHERE status = 'published' AND user_id <> ? AND id IN (${wanted.map(() => "?").join(",")})`, user.id, ...wanted);
    if (published.length) {
      const now = nowIso();
      await batch(published.map((p) => ["INSERT OR IGNORE INTO favourites (user_id, cleaner_profile_id, created_at) VALUES (?, ?, ?)", user.id, p.id, now]));
    }
  }
  return listMyFavourites();
}
