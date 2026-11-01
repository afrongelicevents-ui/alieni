import { describe, expect, it } from "vitest";
import { parseFilters, searchCleaners } from "../cleaners";
import { distanceKm, postcodeToLatLng } from "../geo";

describe("postcode geo", () => {
  it("resolves Dutch postcode regions", () => {
    expect(postcodeToLatLng("1012 AB")).toEqual({ lat: 52.37, lng: 4.9 });
    expect(postcodeToLatLng("9711LM")).toEqual({ lat: 53.22, lng: 6.57 });
    expect(postcodeToLatLng("x")).toBeNull();
  });

  it("computes plausible distances", () => {
    const ams = postcodeToLatLng("1012 AB")!;
    const rtm = postcodeToLatLng("3011 BR")!;
    const d = distanceKm(ams, rtm);
    expect(d).toBeGreaterThan(40);
    expect(d).toBeLessThan(80);
  });
});

describe("searchCleaners", () => {
  it("filters by service", () => {
    const results = searchCleaners({ service: "airbnb" });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((c) => c.services.includes("airbnb"))).toBe(true);
  });

  it("filters by max hourly rate", () => {
    const results = searchCleaners({ maxRateCents: 1700 });
    expect(results.every((c) => c.rateCents <= 1700)).toBe(true);
  });

  it("filters by weekday availability", () => {
    const results = searchCleaners({ day: 6 }); // Sunday
    expect(results.every((c) => (c.availability[6] ?? []).length > 0)).toBe(true);
  });

  it("filters by language", () => {
    const results = searchCleaners({ language: "pl" });
    expect(results.every((c) => c.languages.includes("pl"))).toBe(true);
  });

  it("matches towns by name", () => {
    const results = searchCleaners({ q: "rotterdam" });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((c) => c.city === "Rotterdam")).toBe(true);
  });

  it("sorts by distance from a postcode and computes distances", () => {
    const results = searchCleaners({ q: "1012 AB" });
    expect(results.length).toBeGreaterThan(0);
    const dists = results.map((c) => c.distanceKm ?? Infinity);
    expect([...dists].sort((a, b) => a - b)).toEqual(dists);
  });

  it("sorts by price", () => {
    const results = searchCleaners({ sort: "price" });
    const rates = results.map((c) => c.rateCents);
    expect([...rates].sort((a, b) => a - b)).toEqual(rates);
  });
});

describe("parseFilters", () => {
  it("parses and validates URL params", () => {
    expect(parseFilters({ q: " 1012 AB ", service: "deep", maxRate: "20", day: "3", sort: "price" }))
      .toEqual({ q: "1012 AB", service: "deep", maxRateCents: 2000, day: 3, sort: "price" });
  });

  it("drops invalid values", () => {
    expect(parseFilters({ day: "9", maxRate: "-5", sort: "bogus" })).toEqual({});
  });
});
