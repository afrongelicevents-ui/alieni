/*
 * Copy for the redesign preview pages (NL default, EN secondary). Moves into
 * messages/*.json when the design is approved and implemented for real.
 * Wording follows brief §8: no claims we cannot back up.
 */
export type PreviewCopy = typeof en;

export const en = {
  utility: { independent: "Independent professionals", reviews: "Real reviews", book: "Book with confidence", join: "Join our community" },
  nav: {
    customers: "For Customers",
    professionals: "For Professionals",
    businesses: "For Businesses",
    about: "About",
    contact: "Contact",
    login: "Login",
    getStarted: "Get Started",
    search: "Search",
    menu: "Menu",
    close: "Close menu",
  },
  mega: {
    customers: [
      { t: "Find a cleaner", d: "Independent cleaners near you" },
      { t: "How it works", d: "From search to first visit" },
      { t: "Emergency cover", d: "Someone needed today" },
    ],
    professionals: [
      { t: "Place your ad", d: "Your ad, your rate, always free" },
      { t: "Jobs & opportunities", d: "Work posted by households and businesses" },
      { t: "Cleaning companies", d: "Present your company" },
    ],
    businesses: [
      { t: "Offices", d: "Regular office cleaning" },
      { t: "Hotels & Airbnb", d: "Turnovers and linen" },
      { t: "Property managers", d: "Multiple locations, one overview" },
    ],
    about: [
      { t: "About Alieni", d: "Our story and mission" },
      { t: "Contact", d: "Questions? Get in touch" },
      { t: "Report an ad", d: "Help keep Alieni safe" },
    ],
  },
  hero: {
    eyebrow: "Cleaner spaces. A stronger community.",
    pre: "Your Complete",
    accent: "Cleaning",
    post: "Solution",
    text: "Find independent cleaners near you, see their rate and reviews, and meet them before you agree on anything.",
    find: "Find a Cleaner",
    explore: "Explore Alieni",
    video: "Watch Video",
  },
  trust: [
    { icon: "person", t: "Free for cleaners" },
    { icon: "scale", t: "From €15 an hour" },
    { icon: "chat", t: "Meet first, then decide" },
    { icon: "star", t: "Real reviews" },
  ],
  searchBar: { placeholder: "Search for cleaners, services or businesses…", button: "Search", label: "Search Alieni" },
  iconRow: [
    { icon: "home", t: "Find Cleaners", soon: false },
    { icon: "building", t: "Businesses", soon: false },
    { icon: "box", t: "Suppliers", soon: true },
    { icon: "gear", t: "Equipment", soon: true },
    { icon: "briefcase", t: "Careers", soon: true },
    { icon: "grid", t: "More", soon: false },
  ],
  soon: "Coming soon",
  explore: {
    title: "Explore Alieni",
    subtitle: "Everything around cleaning, in one place. Some parts are still being built.",
    mobileEyebrow: "Explore Alieni",
    mobileTitle: "A complete ecosystem for the cleaning industry",
    cards: [
      { img: "catFindCleaners", t: "Find Cleaners", s: "Households", soon: false },
      { img: "catCompanies", t: "Cleaning Companies", s: "Businesses", soon: false },
      { img: "catSuppliers", t: "Suppliers & Equipment", s: "Products", soon: true },
      { img: "catLinen", t: "Linen & Laundry", s: "Services", soon: true },
      { img: "catJobs", t: "Jobs & Opportunities", s: "Careers", soon: true },
      { img: "catCommercial", t: "Cleaning Services", s: "Commercial", soon: false },
    ],
  },
  about: {
    eyebrow: "About Alieni",
    title: "More than just a cleaning platform",
    text: "Alieni is a Dutch marketplace for cleaning. Households and businesses find independent cleaners directly. Cleaners set their own rate and keep all of it — we never take a cut of anyone's wage.",
    cta: "Learn More",
  },
  why: {
    eyebrow: "Why choose Alieni?",
    pre: "Simple. Convenient.",
    accent: "Fair.",
    text: "No agency in between, no small print. This is how it works.",
    cta: "Get Started Today",
    items: [
      { icon: "person", t: "Cleaners pay nothing", d: "Placing an ad is free. Cleaners keep 100% of their rate." },
      { icon: "chat", t: "Meet before you agree", d: "Phone numbers stay hidden in the chat until you both confirm." },
      { icon: "calendar", t: "€14.95 a month — only after a deal", d: "Households pay once both sides confirm. Cancel any month." },
      { icon: "shield", t: "We don't store addresses", d: "No home addresses, no bank details. Postcode searches aren't saved." },
    ],
  },
  biz: {
    eyebrow: "For businesses",
    title: "Clean workplaces without the hassle",
    text: "Offices, hotels, Airbnb hosts and property managers find independent cleaners and cleaning companies directly.",
    points: ["Fixed monthly fee — no commission", "Cleaners keep 100% of their rate", "Emergency and replacement cover"],
    cta: "For Businesses",
    mobileText: "For offices, hotels, Airbnb hosts and property managers. Fixed monthly fee, no commission.",
  },
  community: {
    eyebrow: "For cleaners",
    title: "Your ad, your rate, always free",
    text: "Place your ad, choose your area and hours, and get in touch with households and businesses near you.",
    points: ["Free for cleaners, always", "You keep 100% of what you earn", "You decide who you work for"],
    cta: "Place your ad",
  },
  banner: { pre: "Cleaning sorted,", accent: "no middleman.", text: "Join households, businesses and professionals across the Netherlands.", cta: "Get Started Today" },
  footer: {
    about: "Alieni connects households and businesses with independent cleaners in the Netherlands.",
    cols: [
      { h: "Customers", l: ["Find a cleaner", "How it works", "Emergency cover"] },
      { h: "Professionals", l: ["Place your ad", "Jobs", "Cleaning companies"] },
      { h: "Businesses", l: ["For businesses", "Pricing", "Sign up"] },
      { h: "Company", l: ["About", "Contact"] },
      { h: "Legal", l: ["Terms", "Privacy", "Report an ad"] },
    ],
    kvk: "KvK",
    rights: "All rights reserved.",
  },
};

export const nl: PreviewCopy = {
  utility: { independent: "Zelfstandige professionals", reviews: "Echte reviews", book: "Met vertrouwen boeken", join: "Word lid van onze community" },
  nav: {
    customers: "Voor klanten",
    professionals: "Voor professionals",
    businesses: "Voor bedrijven",
    about: "Over ons",
    contact: "Contact",
    login: "Inloggen",
    getStarted: "Aan de slag",
    search: "Zoeken",
    menu: "Menu",
    close: "Menu sluiten",
  },
  mega: {
    customers: [
      { t: "Vind een schoonmaker", d: "Zelfstandige schoonmakers bij jou in de buurt" },
      { t: "Zo werkt het", d: "Van zoeken tot eerste bezoek" },
      { t: "Spoedvervanging", d: "Vandaag iemand nodig" },
    ],
    professionals: [
      { t: "Plaats je advertentie", d: "Jouw advertentie, jouw tarief, altijd gratis" },
      { t: "Werk & kansen", d: "Klussen van huishoudens en bedrijven" },
      { t: "Schoonmaakbedrijven", d: "Presenteer je bedrijf" },
    ],
    businesses: [
      { t: "Kantoren", d: "Vaste kantoorschoonmaak" },
      { t: "Hotels & Airbnb", d: "Wissels en linnengoed" },
      { t: "Vastgoedbeheerders", d: "Meerdere locaties, één overzicht" },
    ],
    about: [
      { t: "Over Alieni", d: "Ons verhaal en onze missie" },
      { t: "Contact", d: "Vragen? Neem contact op" },
      { t: "Advertentie melden", d: "Help Alieni veilig te houden" },
    ],
  },
  hero: {
    eyebrow: "Schonere ruimtes. Een sterkere community.",
    pre: "Jouw complete",
    accent: "schoonmaak",
    post: "oplossing",
    text: "Vind zelfstandige schoonmakers bij jou in de buurt, zie hun tarief en reviews, en maak eerst kennis voordat je iets afspreekt.",
    find: "Vind een schoonmaker",
    explore: "Ontdek Alieni",
    video: "Bekijk video",
  },
  trust: [
    { icon: "person", t: "Gratis voor schoonmakers" },
    { icon: "scale", t: "Vanaf €15 per uur" },
    { icon: "chat", t: "Eerst kennismaken" },
    { icon: "star", t: "Echte reviews" },
  ],
  searchBar: { placeholder: "Zoek schoonmakers, diensten of bedrijven…", button: "Zoeken", label: "Zoeken op Alieni" },
  iconRow: [
    { icon: "home", t: "Schoonmakers", soon: false },
    { icon: "building", t: "Bedrijven", soon: false },
    { icon: "box", t: "Leveranciers", soon: true },
    { icon: "gear", t: "Apparatuur", soon: true },
    { icon: "briefcase", t: "Vacatures", soon: true },
    { icon: "grid", t: "Meer", soon: false },
  ],
  soon: "Binnenkort",
  explore: {
    title: "Ontdek Alieni",
    subtitle: "Alles rond schoonmaak op één plek. Een deel bouwen we nog.",
    mobileEyebrow: "Ontdek Alieni",
    mobileTitle: "Een compleet ecosysteem voor de schoonmaakbranche",
    cards: [
      { img: "catFindCleaners", t: "Vind schoonmakers", s: "Huishoudens", soon: false },
      { img: "catCompanies", t: "Schoonmaakbedrijven", s: "Bedrijven", soon: false },
      { img: "catSuppliers", t: "Leveranciers & apparatuur", s: "Producten", soon: true },
      { img: "catLinen", t: "Linnen & wasserij", s: "Diensten", soon: true },
      { img: "catJobs", t: "Werk & kansen", s: "Vacatures", soon: true },
      { img: "catCommercial", t: "Schoonmaakdiensten", s: "Zakelijk", soon: false },
    ],
  },
  about: {
    eyebrow: "Over Alieni",
    title: "Meer dan een schoonmaakplatform",
    text: "Alieni is een Nederlandse marktplaats voor schoonmaak. Huishoudens en bedrijven vinden direct een zelfstandige schoonmaker. Schoonmakers bepalen zelf hun tarief en houden dat helemaal — wij houden niets in op iemands loon.",
    cta: "Meer weten",
  },
  why: {
    eyebrow: "Waarom Alieni?",
    pre: "Eenvoudig. Handig.",
    accent: "Eerlijk.",
    text: "Geen bureau ertussen, geen kleine lettertjes. Zo werkt het.",
    cta: "Begin vandaag",
    items: [
      { icon: "person", t: "Schoonmakers betalen niets", d: "Een advertentie plaatsen is gratis. Je houdt 100% van je tarief." },
      { icon: "chat", t: "Eerst kennismaken", d: "Telefoonnummers blijven verborgen in de chat tot jullie allebei bevestigen." },
      { icon: "calendar", t: "€14,95 per maand — pas na een afspraak", d: "Huishoudens betalen pas als beide kanten bevestigen. Maandelijks opzegbaar." },
      { icon: "shield", t: "Wij bewaren geen adressen", d: "Geen huisadressen, geen bankgegevens. Zoekopdrachten op postcode worden niet opgeslagen." },
    ],
  },
  biz: {
    eyebrow: "Voor bedrijven",
    title: "Schone werkplekken zonder gedoe",
    text: "Kantoren, hotels, Airbnb-hosts en vastgoedbeheerders vinden direct zelfstandige schoonmakers en schoonmaakbedrijven.",
    points: ["Vast bedrag per maand — geen commissie", "Schoonmakers houden 100% van hun tarief", "Spoed- en vervangingsdekking"],
    cta: "Voor bedrijven",
    mobileText: "Voor kantoren, hotels, Airbnb-hosts en vastgoedbeheerders. Vast bedrag per maand, geen commissie.",
  },
  community: {
    eyebrow: "Voor schoonmakers",
    title: "Jouw advertentie, jouw tarief, altijd gratis",
    text: "Plaats je advertentie, kies je gebied en uren, en kom in contact met huishoudens en bedrijven bij jou in de buurt.",
    points: ["Altijd gratis voor schoonmakers", "Je houdt 100% van wat je verdient", "Jij bepaalt voor wie je werkt"],
    cta: "Plaats je advertentie",
  },
  banner: { pre: "Schoonmaak geregeld,", accent: "zonder tussenpersoon.", text: "Sluit je aan bij huishoudens, bedrijven en professionals in heel Nederland.", cta: "Begin vandaag" },
  footer: {
    about: "Alieni verbindt huishoudens en bedrijven met zelfstandige schoonmakers in Nederland.",
    cols: [
      { h: "Klanten", l: ["Vind een schoonmaker", "Zo werkt het", "Spoedvervanging"] },
      { h: "Professionals", l: ["Plaats je advertentie", "Werk", "Schoonmaakbedrijven"] },
      { h: "Bedrijven", l: ["Voor bedrijven", "Prijzen", "Aanmelden"] },
      { h: "Bedrijf", l: ["Over ons", "Contact"] },
      { h: "Juridisch", l: ["Voorwaarden", "Privacy", "Advertentie melden"] },
    ],
    kvk: "KvK",
    rights: "Alle rechten voorbehouden.",
  },
};

export function previewCopy(locale: string): PreviewCopy {
  return locale === "en" ? en : nl;
}
