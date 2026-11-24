import "server-only";
import { first } from "./server/db";
import { headers } from "next/headers";
import { pick, sendEmail, type Lang } from "./email";

export type { Lang };

type Notice = { subject: string; text: string };

const sign = (lang: Lang) => pick(lang, "Groetjes, Alieni · Connect · Clean · Thrive", "Cheers, Alieni · Connect · Clean · Thrive");
const hi = (lang: Lang) => pick(lang, "Hoi!", "Hi!");

/** Language a user wants e-mails in (profiles.locale). Falls back to "nl" when unknown. */
export async function userLocale(userId: string): Promise<Lang> {
  try {
    const p = await first<{ locale: string }>("SELECT locale FROM profiles WHERE id = ?", userId);
    return p?.locale === "en" ? "en" : "nl";
  } catch {
    return "nl";
  }
}

/**
 * Best-effort e-mail notification to a user id (address from the D1 user table). Needs RESEND_API_KEY; skips (with
 * a short warning, no personal data) otherwise and never throws. Never includes raw chat text (contact masking,
 * brief §7). Callers should await it: a Worker may stop right after the response.
 *
 * Two forms: `notifyUser(userId, (lang) => ({ subject, text }))` builds the mail in the recipient's own language
 * (profiles.locale); `notifyUser(userId, subject, text)` sends exactly what it is given.
 */
export async function notifyUser(userId: string, build: (lang: Lang) => Notice): Promise<boolean>;
export async function notifyUser(userId: string, subject: string, text: string): Promise<boolean>;
export async function notifyUser(userId: string, subjectOrBuild: string | ((lang: Lang) => Notice), text?: string): Promise<boolean> {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.warn("notifyUser: RESEND_API_KEY is not configured; e-mail skipped");
      return false;
    }
    const u = await first<{ email: string; locale: string | null; suspended_at: string | null }>(
      'SELECT u.email, p.locale, p.suspended_at FROM "user" u LEFT JOIN profiles p ON p.id = u.id WHERE u.id = ?',
      userId,
    );
    if (!u?.email || u.suspended_at) return false;
    if (typeof subjectOrBuild === "function") {
      const mail = subjectOrBuild(u.locale === "en" ? "en" : "nl");
      return await sendEmail(u.email, mail.subject, mail.text);
    }
    return await sendEmail(u.email, subjectOrBuild, text ?? "");
  } catch {
    console.warn("notifyUser: unexpected failure; e-mail skipped");
    return false;
  }
}

/** Owner (user id) of a business profile. Server-side only; null when unknown. */
export async function businessOwnerUserId(businessId: string): Promise<string | null> {
  try {
    return (await first<{ user_id: string }>("SELECT user_id FROM business_profiles WHERE id = ?", businessId))?.user_id ?? null;
  } catch {
    return null;
  }
}

/** Owner (user id) of a cleaner profile (ad). Server-side only; null when unknown. */
export async function cleanerOwnerUserId(cleanerProfileId: string): Promise<string | null> {
  try {
    return (await first<{ user_id: string }>("SELECT user_id FROM cleaner_profiles WHERE id = ?", cleanerProfileId))?.user_id ?? null;
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

/** Public site URL: configured value first (NEXT_PUBLIC_APP_URL, then BETTER_AUTH_URL), then the request host. */
export async function appBaseUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL;
  if (configured) return configured.replace(/\/$/, "");
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

