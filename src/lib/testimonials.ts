import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Testimonial } from "@/components/site/home/HomeSections";

/**
 * Published, consented testimonials (Admin → Testimonials). Returns an empty
 * list without Supabase or before migration 0024 has run — the homepage then
 * hides the section. Never returns sample data.
 */
export async function getPublishedTestimonials(): Promise<Testimonial[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];
  try {
    const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await supabase
      .from("testimonials")
      .select("id, name, role, city, quote")
      .eq("published", true)
      .eq("consent", true)
      .order("created_at", { ascending: false })
      .limit(6);
    if (error || !data) return [];
    return data as Testimonial[];
  } catch {
    return [];
  }
}
