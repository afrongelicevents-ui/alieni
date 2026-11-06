import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { enabledFor, getCatalog } from "@/lib/services";
import type { BusinessType } from "@/lib/business";
import { BusinessSubnavLinks } from "./BusinessSubnavLinks";

/** Second-level navigation inside the business area (same on phone and desktop). Calendar only where turnovers are enabled for the business type. */
export async function BusinessSubnav() {
  let showCalendar = false;
  const [user, supabase] = await Promise.all([getSessionUser(), createClient()]);
  if (user && supabase) {
    const { data } = await supabase.from("business_profiles").select("business_type").eq("user_id", user.id).maybeSingle();
    const type = (data?.business_type as BusinessType | undefined) ?? null;
    if (type) showCalendar = enabledFor(await getCatalog(), "turnover", type);
  }
  return <BusinessSubnavLinks showCalendar={showCalendar} />;
}
