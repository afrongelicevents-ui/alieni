/**
 * The operating company's public details, read from the environment so nothing is hard-coded or shown as a
 * placeholder: COMPANY_NAME, COMPANY_KVK, COMPANY_BTW and CONTACT_EMAIL. Lines that are not configured are left out.
 */
export const COMPANY = {
  name: process.env.COMPANY_NAME || "Alieni",
  kvk: process.env.COMPANY_KVK || "",
  btw: process.env.COMPANY_BTW || "",
  contactEmail: process.env.CONTACT_EMAIL || "",
};

/** "Alieni · KvK 12345678 · BTW NL…" with only the parts that are configured. */
export function companyLine(): string {
  return [COMPANY.name, COMPANY.kvk && `KvK ${COMPANY.kvk}`, COMPANY.btw && `BTW ${COMPANY.btw}`].filter(Boolean).join(" · ");
}

/** The sentence that tells people how to reach the controller (empty when no contact address is configured). */
export function contactSentence(lang: "nl" | "en"): string {
  if (!COMPANY.contactEmail) return "";
  return ` ${lang === "nl" ? "Contact" : "Contact"}: ${COMPANY.contactEmail}.`;
}
