/* Core marketplace fixes (audit of 3 Nov): no KvK anywhere; the owner can view
 * a draft/hidden ad while others get 404; households find published ads by
 * postcode (precise distance) and by town; customer-type preferences respected
 * (household-only cleaners hidden from businesses and the other way round); phone + desktop. */
const { chromium } = require("playwright");
const fs = require("node:fs");
const APP = "http://localhost:3100";
const EMU = "http://localhost:4000";
const OUT = process.env.E2E_OUT || "e2e/out";
const results = [];
function ok(name, pass, detail = "") { results.push({ name, pass, detail }); console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); }
async function signUp(page, email, role) {
  await page.goto(`${APP}/en/signup?role=${role}`, { waitUntil: "networkidle" });
  await page.fill("input[type=email]", email);
  await page.fill("input[autocomplete='given-name']", email.split("@")[0]);
  await page.fill("input[type=password]", "Test-Password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/en\/(home|profile|admin|business\/dashboard)$/, { timeout: 15000 });
  await page.waitForLoadState("networkidle");
}
async function session(ctx) {
  const cookies = await ctx.cookies();
  const raw = cookies.filter((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name)).sort((a, b) => a.name.localeCompare(b.name)).map((c) => c.value).join("");
  return JSON.parse(raw.startsWith("base64-") ? Buffer.from(raw.slice(7), "base64").toString() : decodeURIComponent(raw));
}
async function rest(token, method, path, body) {
  const res = await fetch(`${EMU}/rest/v1/${path}`, { method, headers: { apikey: "emu-anon-key", Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "return=representation" }, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await res.json(); } catch {}
  return { status: res.status, data };
}
const tbl = async (name) => (await fetch(`${EMU}/__emu/table?name=${name}`)).json();
const AMS_C = "SRID=4326;POINT(4.8952 52.3702)", AMS_N = "SRID=4326;POINT(4.9150 52.4000)", UTR = "SRID=4326;POINT(5.1214 52.0907)";

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const errors = [];
  const track = (page) => { page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`)); page.on("console", (m) => { if (m.type() === "error" && !/status of (400|404|422)|realtime\/v1\/websocket/.test(m.text())) errors.push(`console: ${m.text()}`); }); };

  for (const [label, viewport] of [["phone", { width: 390, height: 844 }], ["desktop", { width: 1280, height: 900 }]]) {
    await fetch(`${EMU}/__emu/reset`);
    const sfx = label === "phone" ? "m" : "d";

    // ---------- Cleaner 1 through the wizard: business environment, no KvK asked, works-as declaration ----------
    const c1ctx = await browser.newContext({ viewport }); const c1 = await c1ctx.newPage(); track(c1);
    await signUp(c1, `c1-${sfx}@example.com`, "cleaner");
    await c1.fill("input[maxlength='80']", `Noor ${sfx.toUpperCase()}`);
    await c1.fill("input[maxlength='60']", "Amsterdam");
    await c1.getByRole("button", { name: "Next" }).click();
    await c1.getByRole("button", { name: /Regular cleaning/ }).first().click();
    await c1.getByText("Both", { exact: true }).click();
    await c1.getByRole("button", { name: /^Offices/ }).click();
    ok(`[${label}] Wizard never asks for a KvK number; offers the works-as declaration`, (await c1.locator("input[placeholder='12345678']").count()) === 0 && !/KvK/.test(await c1.textContent("main")) && (await c1.getByText("Independent (self-employed)").count()) === 1);
    await c1.getByText("Independent (self-employed)").click();
    await c1.getByRole("button", { name: "Next" }).click();
    await c1.fill("input[placeholder='1012 AB']", "1012 AB");
    await c1.locator("td button").nth(1).click();
    await c1.getByRole("button", { name: /Save ad|Publish/ }).click();
    await c1.waitForSelector("text=Your ad is live", { timeout: 15000 });
    const ad1 = (await tbl("cleaner_profiles"))[0];
    ok(`[${label}] Ad published with business environment and no KvK; works_as stored`, ad1?.status === "published" && ad1.job_types.includes("office") && ad1.kvk_number == null && ad1.works_as === "independent" && ad1.work_scope === "both");
    const c1tok = (await session(c1ctx)).access_token;
    await rest(c1tok, "PATCH", `cleaner_profiles?id=eq.${ad1.id}`, { location: AMS_C }); // precise location (the geocoder is offline here)

    // "View ad" → the ad page opens
    await c1.getByRole("link", { name: "View ad" }).click();
    await c1.waitForURL(new RegExp(`/en/cleaners/${ad1.id}$`), { timeout: 15000 });
    await c1.waitForLoadState("networkidle");
    ok(`[${label}] "View ad" opens the published ad (no 404)`, new RegExp(`Noor ${sfx.toUpperCase()}`).test(await c1.textContent("main")) && (await c1.locator("[data-not-public]").count()) === 0, (await c1.textContent("main")).slice(0, 160));
    // hide it → owner still sees it, with a banner
    await c1.goto(`${APP}/en/profile`, { waitUntil: "networkidle" });
    await c1.getByRole("button", { name: /offline|Take offline/i }).first().click();
    await c1.waitForTimeout(1500);
    ok(`[${label}] Ad taken offline`, (await tbl("cleaner_profiles"))[0].status === "hidden");
    await c1.goto(`${APP}/en/cleaners/${ad1.id}`, { waitUntil: "networkidle" });
    ok(`[${label}] Owner can open their hidden ad and sees the "offline" banner`, (await c1.locator("[data-not-public='hidden']").count()) === 1 && new RegExp(`Noor ${sfx.toUpperCase()}`).test(await c1.textContent("main")));
    await c1.screenshot({ path: `${OUT}/f8-${sfx}-own-hidden-ad.png`, fullPage: true });

    // ---------- Household: hidden ad is 404 for them; published ads found by postcode, town and no filter ----------
    const hctx = await browser.newContext({ viewport }); const h = await hctx.newPage(); track(h);
    await signUp(h, `hh-${sfx}@example.com`, "household");
    const r404 = await h.goto(`${APP}/en/cleaners/${ad1.id}`, { waitUntil: "networkidle" });
    ok(`[${label}] A hidden ad is 404 for a household`, r404.status() === 404);
    await rest(c1tok, "PATCH", `cleaner_profiles?id=eq.${ad1.id}`, { status: "published" });

    // two more cleaners via the API: household-only in Amsterdam-North (12 km radius), commercial-only in Utrecht
    async function apiCleaner(email, extra) {
      const ctx = await browser.newContext({ viewport }); const p = await ctx.newPage(); track(p);
      await signUp(p, email, "cleaner");
      const sess = await session(ctx);
      const r = await rest(sess.access_token, "POST", "cleaner_profiles", { user_id: sess.user.id, status: "published", rate_cents: 2000, min_hours: 2, services: ["regular"], languages: ["nl"], postcode: "1031 AA", radius_km: 12, job_types: ["household"], work_scope: "household", work_types: ["household_regular"], ...extra });
      await rest(sess.access_token, "PATCH", `profiles?id=eq.${sess.user.id}`, { display_name: email.split("@")[0], city: extra.city ?? "Amsterdam" });
      return { ctx, p, cp: r.data?.[0], userId: sess.user.id };
    }
    const c2 = await apiCleaner(`household-only-${sfx}@example.com`, { location: AMS_N });
    const c3 = await apiCleaner(`commercial-only-${sfx}@example.com`, { location: UTR, postcode: "3511 AA", city: "Utrecht", work_scope: "commercial", job_types: ["office"], work_types: ["commercial_contract"] });

    const names = async (page) => (await page.locator("main h3, main h2").allTextContents()).join(" | ");
    await h.goto(`${APP}/en/search`, { waitUntil: "networkidle" });
    let txt = await names(h);
    ok(`[${label}] Household, no filters: sees "both" + household-only cleaners, not the commercial-only one`, /Noor/.test(txt) && /household-only/.test(txt) && !/commercial-only/.test(txt), txt);
    await h.goto(`${APP}/en/search?q=1012`, { waitUntil: "networkidle" });
    txt = await names(h);
    ok(`[${label}] Household, postcode 1012: both Amsterdam cleaners found with a precise distance`, /Noor/.test(txt) && /household-only/.test(txt) && /km/.test(await h.textContent("main")), txt);
    await h.goto(`${APP}/en/search?q=Amsterdam`, { waitUntil: "networkidle" });
    txt = await names(h);
    ok(`[${label}] Household, town "Amsterdam": both Amsterdam cleaners found`, /Noor/.test(txt) && /household-only/.test(txt) && !/commercial-only/.test(txt), txt);
    await h.screenshot({ path: `${OUT}/f8-${sfx}-household-search.png`, fullPage: true });
    await h.goto(`${APP}/en/cleaners/${c2.cp.id}`, { waitUntil: "networkidle" });
    ok(`[${label}] Household opens a found ad and can request a meeting`, (await h.getByRole("button", { name: /Request a meeting|meeting/i }).count()) >= 1);

    // ---------- Business: sees "both" + commercial-only, never household-only ----------
    const bctx = await browser.newContext({ viewport }); const b = await bctx.newPage(); track(b);
    await b.goto(`${APP}/en/business/signup?type=office`, { waitUntil: "networkidle" });
    ok(`[${label}] Business sign-up has no KvK field`, (await b.locator("input[placeholder='12345678']").count()) === 0 && !/KvK/.test(await b.textContent("main")));
    await b.fill("input[autocomplete='given-name']", "Bo");
    await b.fill("input[autocomplete='family-name']", "Bakker");
    await b.fill("input[type=email]", `biz-${sfx}@example.com`);
    await b.fill("input[type=password]", "Test-Password-123");
    await b.fill("input[autocomplete='organization']", `Kantoor ${sfx.toUpperCase()}`);
    await b.getByRole("button", { name: "Next" }).click();
    await b.getByRole("button", { name: "Next" }).click();
    await b.getByRole("button", { name: "Next" }).click();
    await b.fill("input[autocomplete='street-address']", "Straat 1");
    await b.fill("input[placeholder='1012 AB']", "1017 AB");
    await b.locator("fieldset input").nth(3).fill("Amsterdam");
    await b.getByRole("button", { name: /Go to my dashboard/ }).click();
    await b.waitForURL(/\/en\/business\/dashboard$/, { timeout: 20000 });
    ok(`[${label}] Business account created without KvK`, (await tbl("business_profiles"))[0]?.kvk_number == null && !/KvK/.test(await b.textContent("main")));
    await b.goto(`${APP}/en/search`, { waitUntil: "networkidle" });
    txt = await names(b);
    ok(`[${label}] Business, no filters: sees "both" + commercial-only, not the household-only cleaner`, /Noor/.test(txt) && /commercial-only/.test(txt) && !/household-only/.test(txt), txt);
    await b.goto(`${APP}/en/search?q=3511`, { waitUntil: "networkidle" });
    txt = await names(b);
    ok(`[${label}] Business, postcode 3511 (Utrecht): commercial-only cleaner within radius; Amsterdam "both" cleaner (10 km radius) not`, /commercial-only/.test(txt) && !/Noor/.test(txt), txt);
    await b.screenshot({ path: `${OUT}/f8-${sfx}-business-search.png`, fullPage: true });

    await c1ctx.close(); await hctx.close(); await bctx.close(); await c2.ctx.close(); await c3.ctx.close();
  }

  ok("No unexpected browser errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  fs.writeFileSync(`${OUT}/flow8-results.json`, JSON.stringify(results, null, 2));
  await browser.close();
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
