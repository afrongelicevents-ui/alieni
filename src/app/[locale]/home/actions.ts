"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { errorCode, requireUser } from "@/lib/auth";
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
    const { supabase, userId } = await requireUser();
    // household preferences belong to household accounts only
    const { data: me } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
    if (me?.role !== "household") return { ok: false, error: "not_allowed" };
    if (v.name) await supabase.from("profiles").update({ display_name: v.name }).eq("id", userId);
    const { error } = await supabase.from("household_profiles").upsert(
      { user_id: userId, postcode_area: v.postcodeArea || null, needs: v.needs, home_type: v.homeType || null, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
    if (error) return { ok: false, error: "save_failed" };
    revalidatePath("/home");
    revalidatePath("/account");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}
