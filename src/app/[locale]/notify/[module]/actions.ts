"use server";

import { headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { MODULE_KEYS } from "@/lib/site-modules";
import { rateLimit } from "@/lib/rate-limit";

export type NotifyState = { status: "idle" | "done" | "error" | "unavailable" };

const schema = z.object({
  module: z.enum(MODULE_KEYS),
  email: z.string().trim().toLowerCase().email().max(254),
  consent: z.literal("on"),
  // honeypot: real people leave this empty
  website: z.string().max(0).optional().default(""),
});

/** "Notify me" sign-up for a module that isn't live yet. Email + explicit consent only. */
export async function notifyMe(_prev: NotifyState, form: FormData): Promise<NotifyState> {
  const parsed = schema.safeParse({
    module: form.get("module"),
    email: form.get("email"),
    consent: form.get("consent"),
    website: form.get("website") ?? "",
  });
  if (!parsed.success) return { status: "error" };

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`notify:${ip}`, 5, 10 * 60_000)) return { status: "error" };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return { status: "unavailable" };
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await supabase
    .from("module_interest")
    .insert({ module: parsed.data.module, email: parsed.data.email, consent_at: new Date().toISOString() });
  // 23505 = already signed up for this module: same answer, nothing leaked.
  if (error && error.code !== "23505") return { status: error.code === "42P01" ? "unavailable" : "error" };
  return { status: "done" };
}
