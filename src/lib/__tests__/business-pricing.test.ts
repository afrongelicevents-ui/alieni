import { describe, expect, it } from "vitest";
import {
  DEFAULT_BUSINESS_PRICING,
  fromBusinessPricingForm,
  parseBusinessPricing,
  quoteFor,
  serializeBusinessPricing,
  startingQuote,
  toBusinessPricingForm,
} from "../business-pricing";

const unitPrices: Partial<Record<string, number>> = { office: 4900, hotel: 300 };

describe("business pricing: reading the setting", () => {
  it("defaults to a fixed monthly fee per location", () => {
    expect(parseBusinessPricing(undefined)).toEqual(DEFAULT_BUSINESS_PRICING);
    expect(parseBusinessPricing("nonsense").model).toBe("per_location");
  });
  it("understands the older values already in the database", () => {
    expect(parseBusinessPricing({ model: "per_unit_monthly", billing: "month_end_direct_debit" }).model).toBe("per_location");
    expect(parseBusinessPricing({ model: "per_job", price_excl_btw_cents: 995 })).toMatchObject({ model: "per_job_post", jobPostCents: 995 });
  });
  it("round-trips through the stored shape, tiers sorted by size", () => {
    const p = { model: "tiers" as const, jobPostCents: null, tiers: [{ name: "Plus", maxLocations: 10, priceCents: 9900 }, { name: "Basic", maxLocations: 3, priceCents: 4900 }] };
    const back = parseBusinessPricing(serializeBusinessPricing(p));
    expect(back.tiers.map((t) => t.name)).toEqual(["Basic", "Plus"]);
  });
  it("drops broken tiers", () => {
    expect(parseBusinessPricing({ model: "tiers", tiers: [{ name: "", max_locations: 3, price_cents: 100 }, { name: "Ok", max_locations: 0, price_cents: 100 }] }).tiers).toEqual([]);
  });
});

describe("business pricing: what a business sees", () => {
  it("a) per location: units × the type's amount; no amount → price to be announced", () => {
    expect(quoteFor(DEFAULT_BUSINESS_PRICING, "office", 3, unitPrices)).toEqual({ kind: "per_location", unitCents: 4900, units: 3, monthlyCents: 14700 });
    expect(quoteFor(DEFAULT_BUSINESS_PRICING, "restaurant", 1, unitPrices).kind).toBe("tba");
  });
  it("b) per job post", () => {
    expect(quoteFor({ model: "per_job_post", jobPostCents: 995, tiers: [] }, "office", 3, unitPrices)).toEqual({ kind: "per_job_post", jobPostCents: 995 });
    expect(quoteFor({ model: "per_job_post", jobPostCents: null, tiers: [] }, "office", 3, unitPrices).kind).toBe("tba");
  });
  it("c) tiers: the smallest tier that fits; more than the largest → price on request", () => {
    const p = parseBusinessPricing({ model: "tiers", tiers: [{ name: "Basic", max_locations: 3, price_cents: 4900 }, { name: "Plus", max_locations: 10, price_cents: 9900 }] });
    expect(quoteFor(p, "office", 3, unitPrices)).toMatchObject({ kind: "tier", tier: { name: "Basic" }, monthlyCents: 4900 });
    expect(quoteFor(p, "office", 4, unitPrices)).toMatchObject({ kind: "tier", tier: { name: "Plus" } });
    expect(quoteFor(p, "office", 11, unitPrices)).toEqual({ kind: "tier_over", maxLocations: 10 });
    expect(startingQuote(p, "hotel", unitPrices)).toMatchObject({ kind: "tier", monthlyCents: 4900 });
  });
  it("d) free", () => {
    expect(quoteFor({ model: "free", jobPostCents: null, tiers: [] }, "hotel", 40, unitPrices)).toEqual({ kind: "free" });
  });
});

describe("business pricing: the admin form", () => {
  it("accepts Dutch amounts and converts to cents", () => {
    expect(fromBusinessPricingForm({ model: "per_job_post", jobPostEuro: "9,95", tiers: [] })).toMatchObject({ model: "per_job_post", jobPostCents: 995 });
    expect(fromBusinessPricingForm({ model: "tiers", jobPostEuro: "", tiers: [{ name: "Basic", max: "3", priceEuro: "49" }, { name: "Plus", max: "10", priceEuro: "99,00" }] })?.tiers).toEqual([
      { name: "Basic", maxLocations: 3, priceCents: 4900 },
      { name: "Plus", maxLocations: 10, priceCents: 9900 },
    ]);
  });
  it("refuses a model without its amounts, and broken rows", () => {
    expect(fromBusinessPricingForm({ model: "per_job_post", jobPostEuro: "", tiers: [] })).toBeNull();
    expect(fromBusinessPricingForm({ model: "tiers", jobPostEuro: "", tiers: [] })).toBeNull();
    expect(fromBusinessPricingForm({ model: "tiers", jobPostEuro: "", tiers: [{ name: "A", max: "3", priceEuro: "x" }] })).toBeNull();
    expect(fromBusinessPricingForm({ model: "tiers", jobPostEuro: "", tiers: [{ name: "A", max: "3", priceEuro: "1" }, { name: "B", max: "3", priceEuro: "2" }] })).toBeNull();
  });
  it("free and per location need no amounts; the form round-trips", () => {
    expect(fromBusinessPricingForm({ model: "free", jobPostEuro: "", tiers: [] })?.model).toBe("free");
    const p = { model: "tiers" as const, jobPostCents: 995, tiers: [{ name: "Basic", maxLocations: 3, priceCents: 4900 }] };
    expect(fromBusinessPricingForm(toBusinessPricingForm(p))).toEqual(p);
  });
});
