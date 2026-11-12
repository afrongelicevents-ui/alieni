/* Part 16 features: reviews after a confirmed deal, business details and unit editing,
 * admin suspend, banned words. Needs the app with a service key on :3101. */
const { chromium } = require("playwright");
const fs = require("node:fs");
const APP = process.env.APP || "http://localhost:3101";
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
async function registerBusiness(browser, viewport, track, email, company) {
  const ctx = await browser.newContext({ viewport }); const p = await ctx.newPage(); track(p);
  await p.goto(`${APP}/en/business/signup?type=hotel`, { waitUntil: "networkidle" });
  await p.fill("input[autocomplete='given-name']", "Angeline"); await p.fill("input[autocomplete='family-name']", "de Vries");
  await p.fill("input[type=email]", email); await p.fill("input[type=password]", "Test-Password-123"); await p.fill("input[autocomplete='organization']", company);
  for (let i = 0; i < 3; i++) await p.getByRole("button", { name: "Next" }).click();
  await p.fill("input[autocomplete='street-address']", "3 Friswijkerweg"); await p.fill("input[placeholder='1012 AB']", "7433 RB"); await p.locator("fieldset input").nth(3).fill("Schalkhaar");
  await p.getByRole("button", { name: /Go to my dashboard/ }).click();
  await p.waitForURL(/\/en\/business\/dashboard$/, { timeout: 20000 }); await p.waitForLoadState("networkidle");
  return { ctx, p, sess: await session(ctx) };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const errors = [];
  const track = (page) => { page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`)); page.on("console", (m) => { if (m.type() === "error" && !/status of (400|401|404|422)|realtime\/v1\/websocket/.test(m.text())) errors.push(`console: ${m.text()}`); }); };

  for (const [label, viewport] of [["phone", { width: 390, height: 844 }], ["desktop", { width: 1280, height: 900 }]]) {
    await fetch(`${EMU}/__emu/reset`);
    const sfx = label === "phone" ? "m" : "d";

    // ---------- cast ----------
    const cctx = await browser.newContext({ viewport }); const c = await cctx.newPage(); track(c);
    await signUp(c, `cl-${sfx}@example.com`, "cleaner");
    const cs = await session(cctx);
    const cp = (await rest(cs.access_token, "POST", "cleaner_profiles", { user_id: cs.user.id, status: "published", rate_cents: 2200, min_hours: 2, services: ["regular"], languages: ["nl"], postcode: "7433 RB", radius_km: 15, job_types: ["household", "hotel"], work_scope: "both", work_types: ["household_regular", "commercial_contract"], location: "SRID=4326;POINT(6.2200 52.3000)" })).data[0];
    const hctx = await browser.newContext({ viewport }); const h = await hctx.newPage(); track(h);
    await signUp(h, `hh-${sfx}@example.com`, "household");
    const hs = await session(hctx);

    // ---------- reviews ----------
    await h.goto(`${APP}/en/cleaners/${cp.id}`, { waitUntil: "networkidle" });
    ok(`[${label}] No review form without a confirmed deal`, (await h.locator("[data-review-form]").count()) === 0 && /No reviews yet/.test(await h.textContent("main")));
    await rest(hs.access_token, "POST", "connections", { household_id: hs.user.id, cleaner_id: cs.user.id, status: "active", household_confirmed_at: new Date().toISOString(), cleaner_confirmed_at: new Date().toISOString() });
    await h.goto(`${APP}/en/cleaners/${cp.id}`, { waitUntil: "networkidle" });
    ok(`[${label}] After a confirmed deal the review form appears`, (await h.locator("[data-review-form]").count()) === 1);
    await h.getByRole("button", { name: "Post review" }).click();
    ok(`[${label}] Posting without stars is refused with a message`, (await h.getByText("Choose a number of stars.").count()) === 1 && (await tbl("reviews")).length === 0);
    await h.getByRole("radio", { name: "4 stars" }).click();
    await h.fill("#review-body", "Punctual and thorough.");
    await h.getByRole("button", { name: "Post review" }).click();
    await h.waitForFunction(() => !document.querySelector("[data-review-form]"), null, { timeout: 15000 });
    const rv = await tbl("reviews");
    ok(`[${label}] The review is saved for the cleaner, with no author name shown`, rv.length === 1 && rv[0].rating === 4 && rv[0].subject_id === cs.user.id);
    const body = await h.textContent("main");
    ok(`[${label}] The ad shows the rating, the review text and "Confirmed client"`, /4\.0/.test(body) && /1 reviews?/.test(body) && /Punctual and thorough/.test(body) && /Confirmed client/.test(body) && !new RegExp(`hh-${sfx}`).test(body));
    const again = await rest(hs.access_token, "POST", "connections", {}); void again;

    // ---------- business: edit details and units ----------
    const B = await registerBusiness(browser, viewport, track, `biz-${sfx}@example.com`, `Hotel Noord ${sfx.toUpperCase()}`);
    await B.p.goto(`${APP}/en/business/profile`, { waitUntil: "networkidle" });
    await B.p.locator("[data-edit-details]").click();
    await B.p.getByLabel("Business name").fill(`Hotel Zuid ${sfx.toUpperCase()}`);
    await B.p.getByLabel("VAT number").fill("NL123456789B01");
    await B.p.getByRole("button", { name: "Save" }).first().click();
    await B.p.waitForFunction((n) => document.body.textContent.includes(n), `Hotel Zuid ${sfx.toUpperCase()}`, { timeout: 15000 });
    const bp = (await tbl("business_profiles"))[0];
    ok(`[${label}] Business edits company name and VAT number`, bp.company_name === `Hotel Zuid ${sfx.toUpperCase()}` && bp.btw_number === "NL123456789B01");
    await B.p.locator("[data-unit]").first().getByRole("button", { name: "Edit" }).click();
    await B.p.locator("[data-unit] input[placeholder='City']").fill("Deventer");
    await B.p.locator("[data-unit]").first().getByRole("button", { name: "Save" }).click();
    await B.p.waitForFunction(() => document.body.textContent.includes("Deventer"), null, { timeout: 15000 });
    ok(`[${label}] Business edits a location`, (await tbl("business_units"))[0].city === "Deventer");
    await B.p.locator("[data-unit]").first().getByRole("button", { name: "Remove" }).click();
    await B.p.locator("[data-unit]").first().getByRole("button", { name: "Yes, remove" }).click();
    await B.p.waitForSelector("text=You cannot remove your last location.", { timeout: 15000 });
    ok(`[${label}] The last location cannot be removed`, (await tbl("business_units")).length === 1);

    // ---------- banned words and admin suspend ----------
    const actx = await browser.newContext({ viewport }); const a = await actx.newPage(); track(a);
    await signUp(a, "afrongelic.events@gmail.com", "household");
    const as = await session(actx);
    const seeded = (await tbl("settings")).some((s) => s.key === "banned_words");
    if (seeded) await rest(as.access_token, "PATCH", "settings?key=eq.banned_words", { value: ["forbiddenword"] }); else await rest(as.access_token, "POST", "settings", { key: "banned_words", value: ["forbiddenword"] });
    const conv = (await rest(hs.access_token, "POST", "conversations", { household_id: hs.user.id, cleaner_id: cs.user.id })).data?.[0];
    await h.goto(`${APP}/en/messages/${conv?.id}`, { waitUntil: "networkidle" });
    await h.locator("textarea, input[type=text]").last().fill("this has a forbiddenword inside");
    await h.getByRole("button", { name: /Send/ }).last().click();
    await h.waitForSelector("text=not allowed", { timeout: 15000 });
    ok(`[${label}] A message with a banned word is refused with a message`, (await tbl("messages")).filter((m) => /forbiddenword/.test(m.body)).length === 0);
    await a.goto(`${APP}/en/admin/users`, { waitUntil: "networkidle" });
    const row = a.locator("tr", { hasText: `cl-${sfx}` });
    await row.getByRole("button", { name: "Suspend account" }).click();
    await row.getByRole("button", { name: "Yes, suspend" }).click();
    await a.waitForTimeout(1500);
    ok(`[${label}] Admin suspends a user: the ad is hidden and the action is logged`, (await tbl("cleaner_profiles")).find((x) => x.id === cp.id).status === "hidden" && (await tbl("admin_audit_log")).some((x) => x.action === "user_suspended"));

    for (const x of [cctx, hctx, B.ctx, actx]) await x.close();
  }

  ok("No unexpected browser errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  fs.writeFileSync(`${OUT}/flow12-results.json`, JSON.stringify(results, null, 2));
  await browser.close();
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
