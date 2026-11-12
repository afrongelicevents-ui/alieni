import "server-only";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { pick, sendEmail, type Lang } from "./email";

export type { Lang };

type Notice = { subject: string; text: string };

const sign = (lang: Lang) => pick(lang, "Groetjes, Alieni · Connect · Clean · Thrive", "Cheers, Alieni · Connect · Clean · Thrive");
const hi = (lang: Lang) => pick(lang, "Hoi!", "Hi!");

/** Service-role client, or null while the server is not configured (callers then skip quietly). */
function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createSupabaseAdmin(url, key, { auth: { persistSession: false } });
}

/** Language of a user's e-mails: profiles.locale ("nl" | "en"), "nl" on any failure. Service role. */
async function localeOf(admin: NonNullable<ReturnType<typeof serviceClient>>, userId: string): Promise<Lang> {
  try {
    const { data } = await admin.from("profiles").select("locale").eq("id", userId).maybeSingle();
    return data?.locale === "en" ? "en" : "nl";
  } catch {
    return "nl";
  }
}

/** Language a user wants e-mails in (profiles.locale). Falls back to "nl" when unknown or unconfigured. */
export async function userLocale(userId: string): Promise<Lang> {
  try {
    const admin = serviceClient();
    if (!admin) return "nl";
    return await localeOf(admin, userId);
  } catch {
    return "nl";
  }
}

/**
 * Best-effort e-mail notification to a user id. Needs the service role key
 * (to look up the e-mail address) and RESEND_API_KEY; skips (with a short
 * warning, no personal data) otherwise and never throws. Never includes raw
 * chat text (contact masking, brief §7). Callers should await it: serverless
 * functions may freeze right after the response.
 *
 * Two forms: `notifyUser(userId, (lang) => ({ subject, text }))` builds the
 * mail in the recipient's own language (profiles.locale); the older
 * `notifyUser(userId, subject, text)` sends exactly what it is given.
 */
export async function notifyUser(userId: string, build: (lang: Lang) => Notice): Promise<boolean>;
export async function notifyUser(userId: string, subject: string, text: string): Promise<boolean>;
export async function notifyUser(userId: string, subjectOrBuild: string | ((lang: Lang) => Notice), text?: string): Promise<boolean> {
  try {
    const admin = serviceClient();
    if (!admin) {
      console.warn("notifyUser: service role key is not configured; e-mail skipped");
      return false;
    }
    if (!process.env.RESEND_API_KEY) {
      console.warn("notifyUser: RESEND_API_KEY is not configured; e-mail skipped");
      return false;
    }
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error) console.warn("notifyUser: e-mail address lookup failed");
    const to = data?.user?.email;
    if (!to) return false;
    if (typeof subjectOrBuild === "function") {
      const mail = subjectOrBuild(await localeOf(admin, userId));
      return await sendEmail(to, mail.subject, mail.text);
    }
    return await sendEmail(to, subjectOrBuild, text ?? "");
  } catch {
    console.warn("notifyUser: unexpected failure; e-mail skipped");
    return false;
  }
}

/** Owner (user id) of a business profile. Service role: a cleaner cannot read it under RLS. Null when unknown or unconfigured. */
export async function businessOwnerUserId(businessId: string): Promise<string | null> {
  try {
    const admin = serviceClient();
    if (!admin) return null;
    const { data } = await admin.from("business_profiles").select("user_id").eq("id", businessId).maybeSingle();
    return (data?.user_id as string | undefined) ?? null;
  } catch {
    return null;
  }
}

/** Owner (user id) of a cleaner profile (ad). Service role; null when unknown or unconfigured. */
export async function cleanerOwnerUserId(cleanerProfileId: string): Promise<string | null> {
  try {
    const admin = serviceClient();
    if (!admin) return null;
    const { data } = await admin.from("cleaner_profiles").select("user_id").eq("id", cleanerProfileId).maybeSingle();
    return (data?.user_id as string | undefined) ?? null;
  } catch {
    return null;
  }
}

export function newMessageNotice(appUrl: string, lang: Lang = "nl"): Notice {
  return {
    subject: pick(lang, "Nieuw bericht op Alieni", "New message on Alieni"),
    text: [hi(lang), "", pick(lang, "Je hebt een nieuw bericht op Alieni. Log in om het te lezen en te beantwoorden:", "You have a new message on Alieni. Log in to read and reply:"), `${appUrl}/messages`, "", sign(lang)].join("\n"),
  };
}

export function dealConfirmedNotice(name: string, appUrl: string, lang: Lang = "nl"): Notice {
  return {
    subject: pick(lang, `${name} heeft de deal bevestigd — Alieni`, `${name} confirmed the deal — Alieni`),
    text: [hi(lang), "", pick(lang, `${name} heeft zojuist "Wij hebben een deal" bevestigd. Bevestig jij ook? Dan worden jullie contactgegevens zichtbaar.`, `${name} just confirmed "We have a deal". Will you confirm too? Then your contact details become visible.`), `${appUrl}/messages`, "", sign(lang)].join("\n"),
  };
}

/** Public site URL: configured value first, then Vercel's production host, then the request host (dev only). */
export async function appBaseUrl(): Promise<string> {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  return `${host.startsWith("localhost") ? "http" : "https"}://${host}`;
}

export function quoteReceivedNotice(appUrl: string, lang: Lang = "nl"): Notice {
  return {
    subject: pick(lang, "Nieuwe offerte voor je klus — Alieni", "New quote for your job — Alieni"),
    text: [hi(lang), "", pick(lang, "Een schoonmaker heeft een offerte gestuurd voor je klus. Bekijk, accepteer of wijs af:", "A cleaner has sent a quote for your job. View, accept or decline it:"), `${appUrl}/business/requests`, "", sign(lang)].join("\n"),
  };
}

export function quoteAcceptedNotice(appUrl: string, lang: Lang = "nl"): Notice {
  return {
    subject: pick(lang, "Je offerte is geaccepteerd — Alieni", "Your quote was accepted — Alieni"),
    text: [hi(lang), "", pick(lang, "Goed nieuws: je offerte is geaccepteerd. Het werk staat nu in je planning:", "Good news: your quote was accepted. The job is now in your schedule:"), `${appUrl}/work?tab=mine`, "", sign(lang)].join("\n"),
  };
}

export function quoteDeclinedNotice(appUrl: string, lang: Lang = "nl"): Notice {
  return {
    subject: pick(lang, "Je offerte is niet gekozen — Alieni", "Your quote was not chosen — Alieni"),
    text: [hi(lang), "", pick(lang, "Het bedrijf heeft voor je offerte niet gekozen. Er staan meer klussen voor je klaar:", "The company did not choose your quote. There are more jobs waiting for you:"), `${appUrl}/work?tab=jobs`, "", sign(lang)].join("\n"),
  };
}

export function jobCancelledNotice(appUrl: string, byBusiness: boolean, lang: Lang = "nl"): Notice {
  const body = byBusiness
    ? pick(lang, "Het bedrijf heeft de klus geannuleerd. Toekomstige afspraken zijn uit je planning gehaald.", "The company cancelled the job. Future appointments have been removed from your schedule.")
    : pick(lang, "De schoonmaker heeft de klus geannuleerd. Toekomstige afspraken zijn uit je planning gehaald.", "The cleaner cancelled the job. Future appointments have been removed from your schedule.");
  return {
    subject: pick(lang, "Een klus is geannuleerd — Alieni", "A job was cancelled — Alieni"),
    text: [hi(lang), "", body, `${appUrl}${byBusiness ? "/work?tab=mine" : "/business/requests"}`, "", sign(lang)].join("\n"),
  };
}

/** Both parties confirmed: the connection is active and contact details are visible. */
export function dealActiveNotice(name: string, appUrl: string, lang: Lang = "nl"): Notice {
  const who = name ? pick(lang, `${name} heeft`, `${name} has`) : pick(lang, "De andere partij heeft", "The other party has");
  return {
    subject: pick(lang, "Jullie deal is bevestigd — Alieni", "Your deal is confirmed — Alieni"),
    text: [hi(lang), "", pick(lang, `${who} de deal ook bevestigd. Jullie verbinding is nu actief en de contactgegevens zijn zichtbaar in de chat:`, `${who} confirmed the deal too. Your connection is now active and the contact details are visible in the chat:`), `${appUrl}/messages`, "", sign(lang)].join("\n"),
  };
}

export function meetingResponseNotice(appUrl: string, accepted: boolean, lang: Lang = "nl"): Notice {
  return {
    subject: accepted
      ? pick(lang, "Je kennismakingsaanvraag is geaccepteerd — Alieni", "Your introduction request was accepted — Alieni")
      : pick(lang, "Je kennismakingsaanvraag is afgewezen — Alieni", "Your introduction request was declined — Alieni"),
    text: [
      hi(lang),
      "",
      accepted
        ? pick(lang, "De schoonmaker heeft je kennismakingsaanvraag geaccepteerd. Bekijk de afspraak en stuur gerust een bericht:", "The cleaner accepted your introduction request. Check the appointment and feel free to send a message:")
        : pick(lang, "De schoonmaker kan helaas niet op je kennismakingsaanvraag ingaan. Er staan meer schoonmakers voor je klaar:", "Unfortunately the cleaner cannot take up your introduction request. There are more cleaners waiting for you:"),
      `${appUrl}/messages`,
      "",
      sign(lang),
    ].join("\n"),
  };
}

export function adModeratedNotice(appUrl: string, status: "hidden" | "removed", lang: Lang = "nl"): Notice {
  return {
    subject:
      status === "hidden"
        ? pick(lang, "Je advertentie is verborgen — Alieni", "Your ad was hidden — Alieni")
        : pick(lang, "Je advertentie is verwijderd — Alieni", "Your ad was removed — Alieni"),
    text: [
      hi(lang),
      "",
      status === "hidden"
        ? pick(lang, "Een beheerder heeft je advertentie verborgen na een controle op onze voorwaarden.", "An administrator hid your ad after a check against our terms.")
        : pick(lang, "Een beheerder heeft je advertentie verwijderd na een controle op onze voorwaarden.", "An administrator removed your ad after a check against our terms."),
      pick(lang, "Ben je het er niet mee eens? Reageer dan op deze e-mail; dan kijken we er opnieuw naar.", "Do you disagree? Reply to this e-mail and we will take another look."),
      `${appUrl}/account`,
      "",
      sign(lang),
    ].join("\n"),
  };
}

export function connectionEndedNotice(name: string, appUrl: string, wasActive: boolean, lang: Lang = "nl"): Notice {
  const who = name || pick(lang, "De andere partij", "The other party");
  return {
    subject: wasActive ? pick(lang, "Een verbinding is beëindigd — Alieni", "A connection has ended — Alieni") : pick(lang, "Geen match — Alieni", "No match — Alieni"),
    text: [
      hi(lang),
      "",
      wasActive
        ? pick(lang, `${who} heeft de verbinding op Alieni beëindigd. Contactgegevens zijn weer verborgen.`, `${who} has ended the connection on Alieni. Contact details are hidden again.`)
        : pick(lang, `${who} heeft aangegeven dat het (nog) geen match is. Er staan genoeg andere profielen voor je klaar.`, `${who} has indicated that it is not (yet) a match. There are plenty of other profiles waiting for you.`),
      `${appUrl}/messages`,
      "",
      sign(lang),
    ].join("\n"),
  };
}

export function meetingProposalNotice(appUrl: string, lang: Lang = "nl"): Notice {
  return {
    subject: pick(lang, "De schoonmaker stelt een ander moment voor — Alieni", "The cleaner proposes another time — Alieni"),
    text: [hi(lang), "", pick(lang, "De schoonmaker kan niet op het gevraagde moment en stelt een ander moment voor. Bekijk het voorstel en reageer:", "The cleaner cannot make the requested time and proposes another time. View the proposal and respond:"), `${appUrl}/messages`, "", sign(lang)].join("\n"),
  };
}

export function meetingProposalAnsweredNotice(appUrl: string, accepted: boolean, lang: Lang = "nl"): Notice {
  return {
    subject: accepted
      ? pick(lang, "Je voorgestelde moment is geaccepteerd — Alieni", "Your proposed time was accepted — Alieni")
      : pick(lang, "Je voorgestelde moment is afgewezen — Alieni", "Your proposed time was declined — Alieni"),
    text: [
      hi(lang),
      "",
      accepted
        ? pick(lang, "De klant heeft het door jou voorgestelde moment geaccepteerd.", "The customer accepted the time you proposed.")
        : pick(lang, "De klant heeft het door jou voorgestelde moment afgewezen.", "The customer declined the time you proposed."),
      `${appUrl}/messages`,
      "",
      sign(lang),
    ].join("\n"),
  };
}

export function meetingWithdrawnNotice(appUrl: string, lang: Lang = "nl"): Notice {
  return {
    subject: pick(lang, "Een kennismaking is ingetrokken — Alieni", "An introduction was withdrawn — Alieni"),
    text: [hi(lang), "", pick(lang, "De klant heeft de aanvraag voor een kennismaking ingetrokken.", "The customer withdrew the introduction request."), `${appUrl}/messages`, "", sign(lang)].join("\n"),
  };
}

