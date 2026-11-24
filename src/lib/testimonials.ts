import "server-only";
import { all } from "./server/db";
import type { Testimonial } from "@/components/site/home/HomeSections";

/**
 * Published, consented testimonials (Admin → Testimonials). Returns an empty list when there are none or the read
 * fails — the homepage then hides the section. Never returns sample data. Unpublished or unconsented rows are never read.
 */
export async function getPublishedTestimonials(): Promise<Testimonial[]> {
  try {
    return await all<Testimonial>(
      "SELECT id, name, role, city, quote FROM testimonials WHERE published = 1 AND consent = 1 ORDER BY created_at DESC LIMIT 6");
  } catch {
    return [];
  }
}
