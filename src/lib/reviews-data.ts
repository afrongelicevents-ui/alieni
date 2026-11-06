import "server-only";
import { createClient } from "./supabase/server";

/** True when this person has a confirmed deal with the cleaner and has not reviewed it yet. */
export async function canReview(userId: string, cleanerProfileId: string): Promise<boolean> {
  const supabase = await createClient();
  if (!supabase) return false;
  const { data: cp } = await supabase.from("cleaner_profiles").select("user_id").eq("id", cleanerProfileId).maybeSingle();
  if (!cp || cp.user_id === userId) return false;
  const { data: conn } = await supabase
    .from("connections")
    .select("id")
    .eq("household_id", userId)
    .eq("cleaner_id", cp.user_id)
    .not("household_confirmed_at", "is", null)
    .not("cleaner_confirmed_at", "is", null)
    .maybeSingle();
  if (!conn) return false;
  const { count } = await supabase.from("reviews").select("id", { count: "exact", head: true }).eq("connection_id", conn.id).eq("author_id", userId);
  return (count ?? 0) === 0;
}
