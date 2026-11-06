"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { errorCode, requireUser } from "@/lib/auth";
import { dbErrorCode } from "@/lib/db-errors";

export type ReviewActionState = { ok: boolean; error?: string };

const reviewSchema = z.object({
  cleanerProfileId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().max(1000),
});

/**
 * A household or business reviews a cleaner after a confirmed deal (both sides confirmed). One review per
 * connection; the database rule enforces the same. The review shows the date and rating, never the author's name.
 */
export async function submitReview(input: z.input<typeof reviewSchema>): Promise<ReviewActionState> {
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { cleanerProfileId, rating, body } = parsed.data;
  try {
    const { supabase, userId } = await requireUser();
    const { data: cp } = await supabase.from("cleaner_profiles").select("user_id").eq("id", cleanerProfileId).maybeSingle();
    if (!cp) return { ok: false, error: "not_available" };
    const { data: conn } = await supabase
      .from("connections")
      .select("id")
      .eq("household_id", userId)
      .eq("cleaner_id", cp.user_id)
      .not("household_confirmed_at", "is", null)
      .not("cleaner_confirmed_at", "is", null)
      .maybeSingle();
    if (!conn) return { ok: false, error: "no_connection" };
    const { error } = await supabase.from("reviews").insert({ connection_id: conn.id, author_id: userId, subject_id: cp.user_id, rating, body: body || null });
    if (error) return { ok: false, error: error.code === "23505" ? "already" : dbErrorCode(error) };
    revalidatePath(`/cleaners/${cleanerProfileId}`);
    revalidatePath("/search");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}
