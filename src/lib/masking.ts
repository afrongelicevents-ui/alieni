/**
 * Chat contact-masking filter (brief §3.6).
 *
 * Phone numbers, email addresses, WhatsApp links and URLs are masked in
 * chat messages until BOTH parties confirm a deal — this prevents taking
 * the arrangement outside the platform before the connection starts.
 * The same filter must run server-side (edge function / RLS trigger) at
 * launch; never trust only the client.
 */

export const MASK_PLACEHOLDER = "•⁠•⁠•⁠•⁠•";

// Order matters: URLs can contain digits and @, so they go first.
const URL_RE =
  /\b(?:https?:\/\/|www\.)[^\s<>"']+|\b(?:wa\.me|t\.me)\/[^\s<>"']+|\b[a-z0-9][a-z0-9-]*\.(?:com|net|org|nl|be|de|io|me|app|eu|info)\b(?:\/[^\s<>"']*)?/gi;

const EMAIL_RE = /[a-z0-9._%+-]+\s?(?:@|\(at\)|\[at\])\s?[a-z0-9.-]+\.[a-z]{2,}/gi;

// Dutch and international phone numbers: optional +31/0031 or leading 0,
// then at least 8 more digits allowing spaces, dots, dashes and parens.
const PHONE_RE = /(?:\+|00)?\d(?:[\s\-.()/]{0,2}\d){7,13}/g;

export type MaskResult = {
  text: string;
  masked: boolean;
};

export function maskContacts(input: string, placeholder: string = MASK_PLACEHOLDER): MaskResult {
  let masked = false;
  const replace = (text: string, re: RegExp) =>
    text.replace(re, () => {
      masked = true;
      return placeholder;
    });

  let text = input;
  text = replace(text, EMAIL_RE);
  text = replace(text, URL_RE);
  text = replace(text, PHONE_RE);

  return { text, masked };
}
