import { addBtw } from "./money";

/**
 * Business side. Since Phase 1 (service catalogue + pricing rules) nothing is
 * priced unless an ACTIVE rule exists in Admin → Pricing. The
 * `defaultUnitPriceCents` values below are the old placeholders: they are no
 * longer shown or charged anywhere and only remain for the unit tests of the
 * pro-rata maths.
 */

export type BusinessType = "airbnb" | "hotel" | "restaurant" | "office" | "school";

export type BusinessTypeConfig = {
  defaultUnitPriceCents: number;
  unit: { nl: string; en: string }; // singular unit noun
  unitPlural: { nl: string; en: string };
  label: { nl: string; en: string };
  audience: { nl: string; en: string };
};

export const BUSINESS_TYPES: Record<BusinessType, BusinessTypeConfig> = {
  airbnb: {
    defaultUnitPriceCents: 1500,
    unit: { nl: "listing", en: "listing" },
    unitPlural: { nl: "listings", en: "listings" },
    label: { nl: "Airbnb & short-stay", en: "Airbnb & short-let" },
    audience: { nl: "Airbnb-hosts, short-stay verhuurders, property managers, serviced apartments", en: "Airbnb hosts, short-let operators, property managers, serviced apartments" },
  },
  hotel: {
    defaultUnitPriceCents: 300,
    unit: { nl: "kamer", en: "guest room" },
    unitPlural: { nl: "kamers", en: "guest rooms" },
    label: { nl: "Hotels & guesthouses", en: "Hotels & guesthouses" },
    audience: { nl: "Onafhankelijke en boutique hotels, B&B's, guesthouses", en: "Independent and boutique hotels, B&Bs, guesthouses" },
  },
  restaurant: {
    defaultUnitPriceCents: 4900,
    unit: { nl: "locatie", en: "location" },
    unitPlural: { nl: "locaties", en: "locations" },
    label: { nl: "Restaurants & cafés", en: "Restaurants & cafés" },
    audience: { nl: "Restaurants, cafés, bars, bakkerijen", en: "Restaurants, cafés, bars, bakeries" },
  },
  office: {
    defaultUnitPriceCents: 4900,
    unit: { nl: "locatie", en: "location" },
    unitPlural: { nl: "locaties", en: "locations" },
    label: { nl: "Kantoren & commercieel", en: "Offices & commercial" },
    audience: { nl: "Kantoren, winkels, salons, klinieken, sportscholen", en: "Offices, shops, salons, clinics, gyms" },
  },
  school: {
    defaultUnitPriceCents: 9900,
    unit: { nl: "vestiging", en: "site" },
    unitPlural: { nl: "vestigingen", en: "sites" },
    label: { nl: "Scholen & kinderopvang", en: "Schools & childcare" },
    audience: { nl: "Basis- en middelbare scholen, kinderopvang, opleidingscentra", en: "Primary/secondary schools, childcare centres, training centres" },
  },
};

export const BUSINESS_TYPE_KEYS = Object.keys(BUSINESS_TYPES) as BusinessType[];

export type UnitPrices = Record<BusinessType, number>;

export const DEFAULT_UNIT_PRICES: UnitPrices = Object.fromEntries(
  BUSINESS_TYPE_KEYS.map((k) => [k, BUSINESS_TYPES[k].defaultUnitPriceCents]),
) as UnitPrices;

export type Fee = { netCents: number; btwCents: number; grossCents: number };

/** Monthly fee = units × unit price, excl. BTW; BTW (21%) shown underneath. */
export function monthlyFee(type: BusinessType, unitCount: number, prices: UnitPrices = DEFAULT_UNIT_PRICES): Fee {
  if (!Number.isInteger(unitCount) || unitCount < 1) throw new Error("unit_count_invalid");
  const netCents = unitCount * prices[type];
  const grossCents = addBtw(netCents);
  return { netCents, btwCents: grossCents - netCents, grossCents };
}

/** Days in the calendar month containing `date` (UTC). */
export function daysInMonth(date: Date): number {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
}

/** Last day of the calendar month containing `date` (UTC date). */
export function monthEnd(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), daysInMonth(date)));
}

/** First day of the calendar month containing `date` (UTC date). */
export function monthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export type BillingPeriod = {
  periodStart: string; // YYYY-MM-DD
  periodEnd: string;
  unitCount: number;
  unitPriceCents: number;
  billableDays: number;
  netCents: number;
  btwCents: number;
  grossCents: number;
};

/**
 * Billing period for the month that contains `now`, pro-rated from
 * `billingStartedAt` when that falls inside the month (first deal day).
 * Unit-count changes apply from the next period (brief §4), so callers
 * pass the count that was in force at the start of the period.
 */
export function computeBillingPeriod(params: {
  billingStartedAt: Date;
  now: Date;
  unitCount: number;
  unitPriceCents: number;
}): BillingPeriod | null {
  const { billingStartedAt, now, unitCount, unitPriceCents } = params;
  const start = monthStart(now);
  const end = monthEnd(now);
  if (billingStartedAt > end) return null; // not billable yet

  const totalDays = daysInMonth(now);
  const effectiveStart = billingStartedAt > start ? billingStartedAt : start;
  const effectiveStartDay = new Date(Date.UTC(effectiveStart.getUTCFullYear(), effectiveStart.getUTCMonth(), effectiveStart.getUTCDate()));
  const billableDays = totalDays - effectiveStartDay.getUTCDate() + 1;

  const fullNet = unitCount * unitPriceCents;
  const netCents = Math.round((fullNet * billableDays) / totalDays);
  const grossCents = addBtw(netCents);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  return {
    periodStart: iso(effectiveStartDay),
    periodEnd: iso(end),
    unitCount,
    unitPriceCents,
    billableDays,
    netCents,
    btwCents: grossCents - netCents,
    grossCents,
  };
}
