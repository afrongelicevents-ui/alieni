/* Part 17: price-neutral copy while no price is active, the meeting lifecycle (propose another time, answer, withdraw),
 * report buttons for jobs, and no per-location cleaner list. App on :3100 or :3101. */
const { chromium } = require("playwright");
const fs = require("node:fs");
const APP = process.env.APP || "http://localhost:3100";
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

    // ---------- price-neutral copy ----------
    const g = await (await browser.newContext({ viewport })).newPage(); track(g);
    const pricePat = /€\s?\d|\d[.,]\d{2}\s?(per|\/)|per month|per maand/i;
    const pages = [["home", "/"], ["household sign-up", "/signup?role=household"], ["cleaner sign-up", "/signup?role=cleaner"], ["business landing", "/business"], ["airbnb page", "/business/airbnb"], ["log-in page", "/login"]];
    for (const [name, path] of pages) {
      await g.goto(`${APP}/en${path}`, { waitUntil: "networkidle" });
      const text = await g.textContent("main");
      ok(`[${label}] ${name}: no fixed price or subscription is stated`, !/€\s?\d{2}|14[.,]95|9[.,]95/.test(text.replace(/€\s?\d+([.,]\d+)?\s?\/\s?(hr|u)\b/g, "")) && !/subscription/i.test(text), (text.match(/.{20}(€\s?\d|14[.,]95|subscription).{20}/i) || [""])[0]);
    }
    void pricePat;

    // ---------- cast ----------
    const cctx = await browser.newContext({ viewport }); const c = await cctx.newPage(); track(c);
    await signUp(c, `cl-${sfx}@example.com`, "cleaner");
    const cs = await session(cctx);
    const cp = (await rest(cs.access_token, "POST", "cleaner_profiles", { user_id: cs.user.id, status: "published", rate_cents: 2200, min_hours: 2, services: ["regular"], languages: ["nl"], postcode: "7433 RB", radius_km: 15, job_types: ["household", "office"], work_scope: "both", work_types: ["household_regular", "commercial_contract"], location: "SRID=4326;POINT(6.2200 52.3000)" })).data[0];
    const hctx = await browser.newContext({ viewport }); const h = await hctx.newPage(); track(h);
    await signUp(h, `hh-${sfx}@example.com`, "household");
    const hs = await session(hctx);

    await h.goto(`${APP}/en/cleaners/${cp.id}`, { waitUntil: "networkidle" });
    await h.getByRole("button", { name: /Request a meeting/ }).click();
    ok(`[${label}] The meeting request shows a price-neutral payment note`, /No payment details are needed now/.test(await h.textContent("main")) && !/No payment details are needed now[^.]*\.[^.]*€/.test(await h.textContent("main")));

    // ---------- meeting lifecycle ----------
    const meeting = (await rest(hs.access_token, "POST", "meeting_requests", { household_id: hs.user.id, cleaner_profile_id: cp.id, type: "in_person", proposed_weekday: 2, proposed_block: "morning", message: "Hello" })).data[0];
    const conv = (await rest(hs.access_token, "POST", "conversations", { household_id: hs.user.id, cleaner_id: cs.user.id, meeting_request_id: meeting.id })).data[0];
    await c.goto(`${APP}/en/messages/${conv.id}`, { waitUntil: "networkidle" });
    ok(`[${label}] Cleaner sees accept, decline and "Propose another time"`, (await c.getByRole("button", { name: "Propose another time" }).count()) === 1 && (await c.getByRole("button", { name: "Accept" }).count()) >= 1);
    await c.locator("[data-propose-time]").click();
    await c.getByLabel("Day", { exact: true }).selectOption("4");
    await c.getByLabel("Part of day").selectOption("evening");
    await c.locator("[data-send-proposal]").click();
    await c.waitForFunction(() => /Rescheduled|rescheduled|another time|Other time/i.test(document.querySelector("main")?.textContent || ""), null, { timeout: 15000 }).catch(() => {});
    await c.waitForTimeout(800);
    const m1 = (await tbl("meeting_requests"))[0];
    ok(`[${label}] The proposal is stored (new day and part of day, status rescheduled)`, m1.status === "rescheduled" && m1.proposed_weekday === 4 && m1.proposed_block === "evening");
    await h.goto(`${APP}/en/messages/${conv.id}`, { waitUntil: "networkidle" });
    ok(`[${label}] Household sees the proposal with Agree / Does not suit / Withdraw`, /The cleaner proposes this time/.test(await h.textContent("main")) && (await h.getByRole("button", { name: "Agree" }).count()) === 1 && (await h.getByRole("button", { name: "Withdraw request" }).count()) === 1);
    await h.getByRole("button", { name: "Agree" }).click();
    await h.waitForFunction(() => !/The cleaner proposes this time/.test(document.querySelector("main")?.textContent || ""), null, { timeout: 15000 });
    ok(`[${label}] Agreeing accepts the meeting`, (await tbl("meeting_requests"))[0].status === "accepted");
    const panel = await h.textContent("main");
    await h.getByRole("button", { name: "Withdraw request" }).click();
    await h.waitForTimeout(1200);
    ok(`[${label}] Withdrawing ends the request`, (await tbl("meeting_requests"))[0].status === "declined");

    // ---------- price-neutral deal panel ----------
    ok(`[${label}] The deal panel states no price while none is active`, /Nothing is charged at the moment|nothing is charged/i.test(panel) && !/€\s?\d|subscription/i.test(panel.replace(/Payments are not activated/g, "").replace(/€\s?\d+([.,]\d+)?\s?\/\s?hr/g, "")));

    // ---------- report a message ----------
    const mconv = conv;
    await rest(cs.access_token, "POST", "messages", { conversation_id: mconv.id, sender_id: cs.user.id, body: "Pay me outside the platform please" });
    await rest(hs.access_token, "POST", "messages", { conversation_id: mconv.id, sender_id: hs.user.id, body: "Hello from the household" });
    await h.goto(`${APP}/en/messages/${mconv.id}`, { waitUntil: "networkidle" });
    ok(`[${label}] Only the other person's messages have a report button`, (await h.getByRole("button", { name: "Report message" }).count()) === 1);
    await h.getByRole("button", { name: "Report message" }).click();
    await h.getByRole("button", { name: "Send report" }).or(h.getByRole("button", { name: /^(Send|Submit)/ })).first().click();
    await h.waitForSelector("text=Thanks for your report", { timeout: 15000 });
    const mrep = (await tbl("reports")).find((r) => r.subject_type === "message");
    ok(`[${label}] A reported message is stored with a snapshot of that message only`, Boolean(mrep) && /Pay me outside/.test(mrep.details || "") && !/Hello from the household/.test(mrep.details || ""));

    // ---------- report a job ----------
    const B = await registerBusiness(browser, viewport, track, `biz-${sfx}@example.com`, `Kantoor ${sfx.toUpperCase()}`);
    const bp = (await tbl("business_profiles"))[0]; const unit = (await tbl("business_units"))[0];
    await rest(B.sess.access_token, "POST", "jobs", { business_id: bp.id, status: "published", space_type: "office", postcode: "7433 RB", city: "Schalkhaar", unit_id: unit.id, frequency: "once", start_date: new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10), visit_start: "09:00", visit_hours: 3, description: "One-off deep clean before the opening.", budget_cents: 2000, published_at: new Date().toISOString(), expires_at: new Date(Date.now() + 5e9).toISOString() });
    await c.goto(`${APP}/en/work?tab=jobs`, { waitUntil: "networkidle" });
    await c.getByRole("button", { name: "Report this job" }).first().click();
    await c.getByRole("button", { name: /Send|Submit|Report/ }).last().click();
    await c.waitForSelector("text=Thanks for your report", { timeout: 15000 });
    ok(`[${label}] A cleaner can report a job; it lands in the report queue`, (await tbl("reports")).some((r) => r.subject_type === "job"));

    // ---------- business profile: no per-location cleaner list ----------
    await B.p.goto(`${APP}/en/business/profile`, { waitUntil: "networkidle" });
    ok(`[${label}] Locations no longer list the same cleaners on every row`, (await B.p.locator("[data-unit] [data-connected-note]").count()) === 0 && (await B.p.locator("[data-connected-note]").count()) === 1);

    for (const x of [cctx, hctx, B.ctx]) await x.close();
  }

  ok("No unexpected browser errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  fs.writeFileSync(`${OUT}/flow13-results.json`, JSON.stringify(results, null, 2));
  await browser.close();
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
