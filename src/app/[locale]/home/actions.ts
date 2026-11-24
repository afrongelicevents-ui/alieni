"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { errorCode, requireUser } from "@/lib/auth";
import { batch, nowIso } from "@/lib/server/db";
import { SERVICE_LABELS } from "@/lib/sample-data";

const schema = z.object({
  name: z.string().trim().max(80).default(""),
  postcodeArea: z.string().regex(/^$|^[1-9][0-9]{3}$/),
  needs: z.array(z.enum(Object.keys(SERVICE_LABELS) as [string, ...string[]])),
  homeType: z.enum(["", "apartment", "house", "other"]),
});

/** Household search preferences. Never an address (data minimisation). */
export async function saveHouseholdProfile(input: z.input<typeof schema>): Promise<{ ok: boolean; error?: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const v = parsed.data;
  try {
    const { userId, role } = await requireUser();
    // household preferences belong to household accounts only
    if (role !== "household") return { ok: false, error: "not_allowed" };
    const now = nowIso();
    const statements: [string, ...(string | number | null)[]][] = [];
    if (v.name) statements.push(["UPDATE profiles SET display_name = ? WHERE id = ?", v.name, userId]);
    statements.push([
      `INSERT INTO household_profiles (user_id, postcode_area, needs, home_type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET postcode_area = excluded.postcode_area, needs = excluded.needs, home_type = excluded.home_type, updated_at = excluded.updated_at`,
      userId, v.postcodeArea || null, JSON.stringify([...new Set(v.needs)]), v.homeType || null, now, now]);
    await batch(statements);
    revalidatePath("/home");
    revalidatePath("/account");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}
