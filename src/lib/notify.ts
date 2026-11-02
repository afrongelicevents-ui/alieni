import "server-only";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { sendEmail } from "./email";

/**
 * Best-effort e-mail notification to a user id. Needs the service role key
 * (to look up the e-mail address) and RESEND_API_KEY; silently skips
 * otherwise. Never includes raw chat text (contact masking, brief §7).
 */
export async function notifyUser(userId: string, subject: string, text: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !process.env.RESEND_API_KEY) return false;
  try {
    const admin = createSupabaseAdmin(url, key, { auth: { persistSession: false } });
    const { data } = await admin.auth.admin.getUserById(userId);
    const to = data?.user?.email;
    if (!to) return false;
    return await sendEmail(to, subject, text);
  } catch {
    return false;
  }
}

export function newMessageNotice(appUrl: string): { subject: string; text: string } {
  return {
    subject: "Nieuw bericht op Alieni",
    text: ["Hoi!", "", "Je hebt een nieuw bericht op Alieni. Log in om het te lezen en te beantwoorden:", `${appUrl}/messages`, "", "Groetjes, Alieni · Connect · Clean · Thrive"].join("\n"),
  };
}

export function dealConfirmedNotice(name: string, appUrl: string): { subject: string; text: string } {
  return {
    subject: `${name} heeft de deal bevestigd — Alieni`,
    text: ["Hoi!", "", `${name} heeft zojuist "Wij hebben een deal" bevestigd. Bevestig jij ook? Dan worden jullie contactgegevens zichtbaar.`, `${appUrl}/messages`, "", "Groetjes, Alieni · Connect · Clean · Thrive"].join("\n"),
  };
}
