/**
 * SAMPLE admin data — placeholder numbers while Supabase is not connected.
 * Every admin view is clearly labelled as sample data.
 */

export type AdminPayment = {
  id: string;
  invoiceNumber: string | null;
  household: string;
  cleaner: string;
  amountCents: number;
  status: "paid" | "pending" | "failed" | "refunded";
  paidAt: string | null;
};

export type AdminConnection = {
  id: string;
  household: string;
  cleaner: string;
  status: "active" | "ended" | "pending";
  startedAt: string | null;
  endedAt: string | null;
};

export type AdminReport = {
  id: string;
  subject: string;
  subjectType: "cleaner_profile" | "review" | "message";
  reason: string;
  details: string;
  reporter: string;
  createdAt: string;
  status: "open" | "hidden" | "removed" | "dismissed";
};

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: "household" | "cleaner" | "business";
  city: string;
  createdAt: string;
};

// November 2026 is "this month" for the sample KPIs.
export const SAMPLE_PAYMENTS: AdminPayment[] = [
  { id: "p1", invoiceNumber: "ALI-2026-0007", household: "Familie Jansen", cleaner: "Sandra M.", amountCents: 1495, status: "paid", paidAt: "2026-11-01T08:00:00Z" },
  { id: "p2", invoiceNumber: "ALI-2026-0008", household: "P. de Vries", cleaner: "Kofi A.", amountCents: 1495, status: "paid", paidAt: "2026-11-01T09:30:00Z" },
  { id: "p3", invoiceNumber: "ALI-2026-0009", household: "A. Bakker", cleaner: "Fernanda S.", amountCents: 1495, status: "paid", paidAt: "2026-11-01T11:15:00Z" },
  { id: "p4", invoiceNumber: null, household: "M. Visser", cleaner: "Hassan E.", amountCents: 1495, status: "pending", paidAt: null },
  { id: "p5", invoiceNumber: "ALI-2026-0005", household: "T. Smit", cleaner: "Maria V.", amountCents: 1495, status: "paid", paidAt: "2026-10-12T10:00:00Z" },
  { id: "p6", invoiceNumber: "ALI-2026-0006", household: "Familie Jansen", cleaner: "Sandra M.", amountCents: 1495, status: "paid", paidAt: "2026-10-01T08:00:00Z" },
  { id: "p7", invoiceNumber: null, household: "R. Mulder", cleaner: "Ewa K.", amountCents: 1, status: "refunded", paidAt: "2026-10-28T14:00:00Z" },
];

export const SAMPLE_CONNECTIONS: AdminConnection[] = [
  { id: "c1", household: "Familie Jansen", cleaner: "Sandra M.", status: "active", startedAt: "2026-09-14T00:00:00Z", endedAt: null },
  { id: "c2", household: "P. de Vries", cleaner: "Kofi A.", status: "active", startedAt: "2026-10-02T00:00:00Z", endedAt: null },
  { id: "c3", household: "A. Bakker", cleaner: "Fernanda S.", status: "active", startedAt: "2026-10-20T00:00:00Z", endedAt: null },
  { id: "c4", household: "T. Smit", cleaner: "Maria V.", status: "ended", startedAt: "2026-08-05T00:00:00Z", endedAt: "2026-11-01T00:00:00Z" },
  { id: "c5", household: "M. Visser", cleaner: "Hassan E.", status: "pending", startedAt: null, endedAt: null },
];

export const SAMPLE_REPORTS: AdminReport[] = [
  {
    id: "r1",
    subject: "Advertentie 'Superschoon 24/7'",
    subjectType: "cleaner_profile",
    reason: "scam",
    details: "Vraagt om vooruitbetaling buiten het platform om.",
    reporter: "P. de Vries",
    createdAt: "2026-11-01T07:40:00Z",
    status: "open",
  },
  {
    id: "r2",
    subject: "Review op profiel Kofi A.",
    subjectType: "review",
    reason: "offensive",
    details: "Discriminerende opmerking in de review.",
    reporter: "Kofi A.",
    createdAt: "2026-10-31T18:05:00Z",
    status: "open",
  },
  {
    id: "r3",
    subject: "Advertentie 'CleanFast'",
    subjectType: "cleaner_profile",
    reason: "fake",
    details: "Foto komt van een stockfotosite, naam lijkt verzonnen.",
    reporter: "A. Bakker",
    createdAt: "2026-10-30T12:20:00Z",
    status: "open",
  },
];

export const SAMPLE_USERS: AdminUser[] = [
  { id: "u1", name: "Familie Jansen", email: "jansen@example.com", role: "household", city: "Amsterdam", createdAt: "2026-09-01" },
  { id: "u2", name: "Sandra M.", email: "sandra@example.com", role: "cleaner", city: "Amsterdam", createdAt: "2026-08-15" },
  { id: "u3", name: "P. de Vries", email: "pdevries@example.com", role: "household", city: "Rotterdam", createdAt: "2026-09-20" },
  { id: "u4", name: "Kofi A.", email: "kofi@example.com", role: "cleaner", city: "Rotterdam", createdAt: "2026-08-22" },
  { id: "u5", name: "HostPro BV", email: "info@hostpro.example", role: "business", city: "Amsterdam", createdAt: "2026-10-05" },
  { id: "u6", name: "Ewa K.", email: "ewa@example.com", role: "cleaner", city: "Den Haag", createdAt: "2026-10-11" },
];

export const SAMPLE_COUNTS = {
  meetingsRequestedThisMonth: 9,
  newAdsThisMonth: 4,
};

export type AdminBusiness = {
  id: string;
  company: string;
  type: "airbnb" | "hotel" | "restaurant" | "office" | "school";
  units: number;
  unitPriceCents: number;
  billingStartedAt: string | null;
  status: "active" | "not_started" | "paused";
};

export const SAMPLE_BUSINESSES: AdminBusiness[] = [
  { id: "b1", company: "HostPro BV", type: "airbnb", units: 11, unitPriceCents: 1500, billingStartedAt: "2026-10-03", status: "active" },
  { id: "b2", company: "Hotel De Linde", type: "hotel", units: 24, unitPriceCents: 300, billingStartedAt: "2026-10-18", status: "active" },
  { id: "b3", company: "Kapsalon Glans", type: "office", units: 1, unitPriceCents: 4900, billingStartedAt: "2026-11-02", status: "active" },
  { id: "b4", company: "Brasserie Zuid", type: "restaurant", units: 2, unitPriceCents: 4900, billingStartedAt: null, status: "not_started" },
  { id: "b5", company: "Basisschool De Wissel", type: "school", units: 1, unitPriceCents: 9900, billingStartedAt: "2026-09-12", status: "paused" },
];

export type AdminEmergency = {
  id: string;
  requester: string;
  requesterType: "household" | "business";
  city: string;
  window: string;
  status: "searching" | "accepted" | "expired" | "cancelled";
  acceptedBy: string | null;
  feeCents: number | null;
};

export const SAMPLE_EMERGENCIES: AdminEmergency[] = [
  { id: "e1", requester: "Familie Jansen", requesterType: "household", city: "Amsterdam", window: "vandaag 14:00–18:00", status: "accepted", acceptedBy: "Kofi A.", feeCents: 995 },
  { id: "e2", requester: "HostPro BV", requesterType: "business", city: "Amsterdam", window: "vandaag 11:00–15:00", status: "searching", acceptedBy: null, feeCents: null },
  { id: "e3", requester: "P. de Vries", requesterType: "household", city: "Rotterdam", window: "gisteren 16:00–20:00", status: "expired", acceptedBy: null, feeCents: null },
];

export type LinenOrder = { id: string; company: string; unit: string; date: string; kits: number };
export const SAMPLE_LINEN_ORDERS: LinenOrder[] = [
  { id: "l1", company: "HostPro BV", unit: "Appartement Jordaan", date: "2026-11-23", kits: 2 },
  { id: "l2", company: "Hotel De Linde", unit: "Kamers 101–108", date: "2026-11-23", kits: 8 },
];
