/* Demo fixes (phone 390 px + desktop):
 * 1. eight sample cleaner profiles in eight cities, €16–€25, marked "Sample profile" / "Voorbeeldprofiel" on the card
 *    and the profile page, which cannot be contacted, saved or reported;
 * 2. business page headline + subline (NL and EN);
 * 3. the browser tab title is English on English pages;
 * 4. "Place your ad" while logged out → log in → straight back to the ad form (/cleaners/new). App on :3100. */
const { chromium } = require("playwright");
const fs = require("node:fs");
const APP = process.env.APP || "http://localhost:3100";
const EMU = "http://localhost:4000";
const OUT = process.env.E2E_OUT || "e2e/out";
const results = [];
function ok(name, pass, detail = "") { results.push({ name, pass, detail }); console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); }
const text = async (p, sel = "main") => ((await p.textContent(sel)) || "").replace(/\s+/g, " ");

(async () => {
  await fetch(`${EMU}/__emu/reset`);
  const browser = await chromium.launch();
  const errors = [];
  const track = (p) => { p.on("pageerror", (e) => errors.push("pageerror: " + e.message)); p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push("console: " + m.text()); }); };

  for (const [label, viewport] of [["phone", { width: 390, height: 844 }], ["desktop", { width: 1280, height: 900 }]]) {
    const tag = (t) => `[${label}] ${t}`;
    const p = await (await browser.newContext({ viewport })).newPage(); track(p);

    // 1. sample profiles
    await p.goto(`${APP}/en/search`, { waitUntil: "networkidle" });
    const cards = p.locator("[data-sample-profile]");
    ok(tag("Search shows the 8 sample profiles, each marked 'Sample profile'"), (await cards.count()) === 8 && (await p.locator("[data-sample-profile]", { hasText: "Sample profile" }).count()) === 8);
    const cities = await p.$$eval("[data-sample-profile]", (els) => els.map((e) => e.textContent));
    const distinct = new Set(["Amsterdam", "Rotterdam", "Utrecht", "Den Haag", "Eindhoven", "Groningen", "Haarlem", "Arnhem"].filter((c) => cities.some((t) => t.includes(c))));
    ok(tag("…in eight different Dutch cities"), distinct.size === 8, [...distinct].join(","));
    const rates = cities.map((t) => Number((/€\s?(\d+)/.exec(t) || [])[1]));
    ok(tag("…with rates from €16 to €25"), rates.every((r) => r >= 16 && r <= 25), rates.join(","));
    ok(tag("No 'Abnxn' test ad in the sample set"), !(await text(p)).includes("Abnxn"));
    await p.goto(`${APP}/nl/search`, { waitUntil: "networkidle" });
    ok(tag("Dutch cards say 'Voorbeeldprofiel'"), (await p.locator("[data-sample-profile]", { hasText: "Voorbeeldprofiel" }).count()) === 8);
    await p.goto(`${APP}/nl/cleaners/sample-3`, { waitUntil: "networkidle" });
    const page = await text(p);
    ok(tag("Sample profile page: badge, Dutch about text, filled availability"), /Voorbeeldprofiel/.test(page) && /Rustig, grondig en betrouwbaar/.test(page) && (await p.locator("[data-sample-profile]").count()) === 1);
    ok(tag("Sample profile page: no meeting request, favourite or report button"), !/Kennismaking aanvragen|Request a meeting/.test(page) && (await p.getByRole("button", { name: /favoriet|favourite/i }).count()) === 0 && (await p.getByRole("button", { name: /Meld deze advertentie|Report this ad/ }).count()) === 0);
    ok(tag("Sample profile page shows only the 4-digit postcode area"), page.includes("3581") && !page.includes("3581 KD"));
    if (label === "phone") await p.screenshot({ path: `${OUT}/f17-sample-profile.png`, fullPage: true });

    // 2. business headline
    await p.goto(`${APP}/nl/business`, { waitUntil: "networkidle" });
    ok(tag("NL business headline + subline"), (await text(p)).includes("Vind je schoonmaker. Betaal hen rechtstreeks.") && (await text(p)).includes("Eén vast bedrag per locatie. Je schoonmaker houdt 100% van het tarief — Alieni neemt geen commissie.") && !(await text(p)).includes("Jij kiest de schoonmaker"));
    await p.goto(`${APP}/en/business`, { waitUntil: "networkidle" });
    ok(tag("EN business headline + subline"), (await text(p)).includes("Find your cleaner. Pay them directly.") && (await text(p)).includes("One fixed fee per location. Your cleaner keeps 100% of their rate — Alieni never takes a cut."));
    if (label === "desktop") await p.screenshot({ path: `${OUT}/f17-business-en.png` });

    // 3. tab title
    await p.goto(`${APP}/en`, { waitUntil: "networkidle" });
    const enTitle = await p.title();
    await p.goto(`${APP}/nl`, { waitUntil: "networkidle" });
    const nlTitle = await p.title();
    ok(tag("Tab title is English on /en and Dutch on /nl"), enTitle === "Alieni — cleaners near you" && nlTitle === "Alieni — schoonmakers bij jou in de buurt", `${enTitle} | ${nlTitle}`);

    // 4. place your ad while logged out
    const email = `adform-${label}-${Date.now()}@example.com`;
    const c = await (await browser.newContext({ viewport })).newPage(); track(c);
    await c.goto(`${APP}/en/signup?role=cleaner`, { waitUntil: "networkidle" });
    await c.fill("input[type=email]", email);
    await c.fill("input[autocomplete='given-name']", "Ad Form");
    await c.fill("input[type=password]", "Test-Password-123");
    await c.getByRole("button", { name: "Create account" }).click();
    await c.waitForURL(/\/en\/cleaners\/new$/, { timeout: 15000 }).catch(() => {});
    ok(tag("A new cleaner lands on the ad form"), /\/en\/cleaners\/new$/.test(c.url()), c.url());
    await c.context().clearCookies();
    await c.goto(`${APP}/en/cleaners/new`, { waitUntil: "networkidle" });
    ok(tag("Logged out: 'Place your ad' asks to log in and remembers the ad form"), /\/en\/login\?next=%2Fcleaners%2Fnew/.test(c.url()), c.url());
    await c.fill("input[type=email]", email);
    await c.fill("input[type=password]", "Test-Password-123");
    await c.getByRole("button", { name: "Log in", exact: true }).click();
    await c.waitForURL(/\/en\/cleaners\/new$/, { timeout: 15000 }).catch(() => {});
    await c.waitForLoadState("networkidle");
    ok(tag("After logging in: straight to the ad form, not /profile"), /\/en\/cleaners\/new$/.test(c.url()) && (await c.locator("input[maxlength='80']").count()) === 1, c.url());
    await c.context().close();
    await p.context().close();
  }

  ok("No unexpected browser errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(`${OUT}/flow17-results.json`, JSON.stringify(results, null, 2));
  await browser.close();
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
