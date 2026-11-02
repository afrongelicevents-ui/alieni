/* Phase 2 — emergency & replacement cover, on phone and desktop width:
 * business request from a unit with report-to for a chosen day; matching by
 * scope and radius; two cleaners race (one wins); chat; cancel outside the
 * window (fee waived) and inside (fee stays); attendance: came → work done,
 * no-show → fee waived + strike, second no-show → opt-in removed; admin
 * settings + table; database refusals; household form untouched. */
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
  await page.fill("input[type=password]", "Test-Password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/en\/(home|profile|admin|business\/dashboard)$/, { timeout: 15000 });
  await page.waitForLoadState("networkidle");
}
async function accessToken(ctx) {
  const cookies = await ctx.cookies();
  const raw = cookies.filter((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name)).sort((a, b) => a.name.localeCompare(b.name)).map((c) => c.value).join("");
  const json = raw.startsWith("base64-") ? Buffer.from(raw.slice(7), "base64").toString() : decodeURIComponent(raw);
  return JSON.parse(json);
}
const hdr = (token) => ({ apikey: "emu-anon-key", Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "return=representation" });
async function rest(token, method, path, body) {
  const res = await fetch(`${EMU}/rest/v1/${path}`, { method, headers: hdr(token), body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await res.json(); } catch {}
  return { status: res.status, data };
}
const tbl = async (name) => (await fetch(`${EMU}/__emu/table?name=${name}`)).json();
const inMs = (ms) => new Date(Date.now() + ms).toISOString();
const AMS = "SRID=4326;POINT(4.8952 52.3702)", GRQ = "SRID=4326;POINT(6.5665 53.2194)";

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const errors = [];
  const track = (page) => { page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`)); page.on("console", (m) => { if (m.type() === "error" && !/status of (400|404|422)/.test(m.text())) errors.push(`console: ${m.text()}`); }); };

  for (const [label, viewport] of [["phone", { width: 390, height: 844 }], ["desktop", { width: 1280, height: 900 }]]) {
    await fetch(`${EMU}/__emu/reset`);
    const sfx = label === "phone" ? "m" : "d";

    // ---------- cleaners (profiles via the API, as the cleaner) ----------
    async function cleaner(email, extra) {
      const ctx = await browser.newContext({ viewport }); const page = await ctx.newPage(); track(page);
      await signUp(page, email, "cleaner");
      const session = await accessToken(ctx);
      const base = { user_id: session.user.id, status: "published", rate_cents: 2000, min_hours: 2, services: ["regular"], languages: ["nl"], postcode: "1012 AB", radius_km: 10, location: AMS, job_types: ["household"], work_scope: "household", work_types: ["household_regular"], emergency_opt_in: true, emergency_rate_cents: 3000 };
      const r = await rest(session.access_token, "POST", "cleaner_profiles", { ...base, ...extra });
      return { ctx, page, token: session.access_token, userId: session.user.id, cp: r.data?.[0] };
    }
    const A = await cleaner(`a-${sfx}@example.com`, { work_scope: "both", job_types: ["household", "hotel", "emergency"], work_types: ["household_regular", "turnover", "emergency_cover"] });
    const B = await cleaner(`b-${sfx}@example.com`, { work_scope: "commercial", job_types: ["hotel", "emergency"], work_types: ["turnover", "emergency_cover"] });
    const C = await cleaner(`c-${sfx}@example.com`, {}); // household scope only
    const D = await cleaner(`d-${sfx}@example.com`, { work_scope: "both", job_types: ["household", "hotel", "emergency"], work_types: ["turnover", "emergency_cover"], location: GRQ, postcode: "9711 AA" }); // far away
    ok(`[${label}] Four cleaners created (A, B commercial Amsterdam; C household-only; D far away)`, [A, B, C, D].every((x) => x.cp?.id));

    // ---------- business (hotel) ----------
    const bctx = await browser.newContext({ viewport }); const b = await bctx.newPage(); track(b);
    await b.goto(`${APP}/en/business/signup?type=hotel`, { waitUntil: "networkidle" });
    await b.fill("input[autocomplete='given-name']", "Hugo");
    await b.fill("input[autocomplete='family-name']", "Hotel");
    await b.fill("input[type=email]", `hotel-${sfx}@example.com`);
    await b.fill("input[type=password]", "Test-Password-123");
    await b.fill("input[autocomplete='organization']", `Hotel Damrak ${sfx.toUpperCase()}`);
    await b.fill("input[placeholder='12345678']", "12345678");
    await b.getByRole("button", { name: "Next" }).click();
    await b.getByRole("button", { name: "Next" }).click();
    await b.fill("input[type=number]", "24");
    await b.getByRole("button", { name: "Next" }).click();
    await b.fill("input[autocomplete='street-address']", "Damrak 1");
    await b.fill("input[placeholder='1012 AB']", "1012 LG");
    await b.locator("fieldset input").nth(3).fill("Amsterdam");
    await b.getByRole("button", { name: /Go to my dashboard/ }).click();
    await b.waitForURL(/\/en\/business\/dashboard$/, { timeout: 20000 });
    const bsession = await accessToken(bctx); const btok = bsession.access_token; const bizUser = bsession.user.id;
    const unit = (await tbl("business_units"))[0];

    // ---------- request from the unit, for tomorrow, with report-to ----------
    await b.goto(`${APP}/en/emergency`, { waitUntil: "networkidle" });
    ok(`[${label}] Business emergency page: cover form with unit picker, day, report-to`, (await b.locator("[data-cover-form]").count()) === 1 && (await b.locator("[data-cover-unit] option").count()) === 2 && /Damrak 1/.test(await b.locator("[data-cover-unit]").textContent()));
    const tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
    await b.fill("[data-cover-date]", tomorrow);
    await b.fill("[data-cover-tasks]", "Cover for the morning shift: 12 rooms, bathrooms and beds.");
    await b.fill("[data-cover-report-to]", "Reception, ask for Sara");
    await b.locator("[data-cover-form] button[type=submit]").click();
    await b.waitForSelector("[data-cover-request]", { timeout: 15000 });
    const req1 = (await tbl("emergency_requests"))[0];
    ok(`[${label}] DB: request has the unit's address, unit_id, report-to, business type, tomorrow`, req1 && req1.unit_id === unit.id && req1.address_line === "Damrak 1" && req1.postcode === "1012 LG" && req1.report_to === "Reception, ask for Sara" && req1.requester_type === "business" && req1.window_start.startsWith(tomorrow));
    ok(`[${label}] Business sees it as "looking for a cleaner" with a free-cancel deadline`, /looking for a cleaner/.test(await b.textContent("[data-cover-request]")) && /Cancel \(free until/.test(await b.textContent("[data-cover-request]")));
    await b.screenshot({ path: `${OUT}/f7-${sfx}-business-searching.png`, fullPage: true });

    // a second request with a real location (the app's geocoder is offline here) to test the radius
    const req2 = (await rest(btok, "POST", "emergency_requests", { requester_id: bizUser, requester_type: "business", address_line: "Damrak 1", postcode: "1012 LG", city: "Amsterdam", location: AMS, window_start: inMs(26 * 3600e3), window_end: inMs(30 * 3600e3), hours: 4, tasks: "Evening shift cover, 8 rooms." })).data?.[0];

    // ---------- matching ----------
    await A.page.goto(`${APP}/en/work?tab=emergency`, { waitUntil: "networkidle" });
    const aText = await A.page.textContent("main");
    ok(`[${label}] Cleaner A (commercial, Amsterdam) sees both requests, with the day and no street`, (await A.page.getByRole("button", { name: "Accept this job" }).count()) === 2 && !/Damrak/.test(aText) && /Reception/.test(aText) === false);
    await C.page.goto(`${APP}/en/work?tab=emergency`, { waitUntil: "networkidle" });
    ok(`[${label}] Cleaner C (household only) sees no business requests`, (await C.page.getByRole("button", { name: "Accept this job" }).count()) === 0);
    await D.page.goto(`${APP}/en/work?tab=emergency`, { waitUntil: "networkidle" });
    ok(`[${label}] Cleaner D (outside the radius) sees neither Amsterdam request`, (await D.page.getByRole("button", { name: "Accept this job" }).count()) === 0);
    ok(`[${label}] DB: D cannot accept the located request even by calling the function`, (await rest(D.token, "POST", "rpc/accept_emergency_request", { p_request_id: req2.id })).data === false);

    // ---------- race: A and B accept at the same time ----------
    const [ra, rb] = await Promise.all([rest(A.token, "POST", "rpc/accept_emergency_request", { p_request_id: req1.id }), rest(B.token, "POST", "rpc/accept_emergency_request", { p_request_id: req1.id })]);
    ok(`[${label}] Two cleaners race: exactly one wins`, [ra.data, rb.data].filter((x) => x === true).length === 1, JSON.stringify([ra.data, rb.data]));
    const winner = ra.data ? A : B;
    const fee1 = (await tbl("fee_events")).find((e) => e.reference_id === req1.id);
    ok(`[${label}] DB: acceptance → work record + fee event (€ 0, no business fixed fee)`, (await tbl("work_records")).some((w) => w.reference_id === req1.id && w.outcome === "scheduled") && fee1?.amount_cents === 0 && (await tbl("emergency_requests"))[0].fee_cents == null);

    // ---------- business: accepted, chat, cancel outside the window ----------
    await b.goto(`${APP}/en/emergency`, { waitUntil: "networkidle" });
    const card1 = b.locator(`[data-cover-request='${req1.id}']`);
    ok(`[${label}] Business sees "accepted" with the cleaner's name and rate, and a message button`, /accepted/.test(await card1.textContent()) && /is coming/.test(await card1.textContent()) && (await card1.getByRole("button", { name: "Send a message" }).count()) === 1);
    await card1.getByRole("button", { name: "Send a message" }).click();
    await b.waitForURL(/\/en\/messages\/[0-9a-f-]{36}$/, { timeout: 15000 });
    ok(`[${label}] Message button opens the chat with the cleaner`, (await tbl("conversations")).some((c) => c.household_id === bizUser && c.cleaner_id === winner.userId));
    await b.goto(`${APP}/en/emergency`, { waitUntil: "networkidle" });
    await card1.locator("[data-cover-cancel]").click();
    await card1.locator("[data-cover-cancel-confirm]").click();
    await b.waitForSelector("[role=status]", { timeout: 15000 });
    ok(`[${label}] Cancel outside the window: "Nothing was recorded", fee event waived, work record cancelled`, /Nothing was recorded/.test(await b.textContent("[role=status]")) && (await tbl("fee_events")).find((e) => e.reference_id === req1.id)?.status === "waived" && (await tbl("work_records")).find((w) => w.reference_id === req1.id)?.outcome === "cancelled");

    // ---------- cancel inside the window ----------
    const req3 = (await rest(btok, "POST", "emergency_requests", { requester_id: bizUser, requester_type: "business", address_line: "Damrak 1", postcode: "1012 LG", city: "Amsterdam", window_start: inMs(3600e3), window_end: inMs(4 * 3600e3), hours: 3, tasks: "Late cover, within the window." })).data?.[0];
    await rest(A.token, "POST", "rpc/accept_emergency_request", { p_request_id: req3.id });
    await b.goto(`${APP}/en/emergency`, { waitUntil: "networkidle" });
    const card3 = b.locator(`[data-cover-request='${req3.id}']`);
    ok(`[${label}] Inside the window the button says "Cancel (inside the window)"`, /inside the window/.test(await card3.locator("[data-cover-cancel]").textContent()));
    await card3.locator("[data-cover-cancel]").click();
    await card3.locator("[data-cover-cancel-confirm]").click();
    await b.waitForSelector("[role=status]", { timeout: 15000 });
    ok(`[${label}] Late cancel: the booking event stays (pending)`, /inside the window/.test(await b.textContent("[role=status]")) && (await tbl("fee_events")).find((e) => e.reference_id === req3.id)?.status === "pending");

    // ---------- attendance: came ----------
    const req4 = (await rest(btok, "POST", "emergency_requests", { requester_id: bizUser, requester_type: "business", address_line: "Damrak 1", postcode: "1012 LG", city: "Amsterdam", window_start: inMs(2500), window_end: inMs(3 * 3600e3), hours: 3, tasks: "Shift that starts in a moment (A)." })).data?.[0];
    ok(`[${label}] A accepts a shift that starts in a moment`, (await rest(A.token, "POST", "rpc/accept_emergency_request", { p_request_id: req4.id })).data === true);
    ok(`[${label}] DB: attendance cannot be reported before the shift starts`, (await rest(btok, "POST", "rpc/report_emergency_attendance", { p_request_id: req4.id, p_came: true, p_note: "" })).data === false);
    await new Promise((r) => setTimeout(r, 3000));
    await b.goto(`${APP}/en/emergency`, { waitUntil: "networkidle" });
    const card4 = b.locator(`[data-cover-request='${req4.id}']`);
    ok(`[${label}] After the start: "Did … come?" prompt`, (await card4.locator("[data-cover-attendance]").count()) === 1);
    await card4.getByRole("button", { name: "Yes, came" }).click();
    await b.waitForTimeout(2000);
    const w4 = (await tbl("work_records")).find((w) => w.reference_id === req4.id);
    ok(`[${label}] Came → work record done + confirmed by business, fee event stays`, w4?.outcome === "done" && Boolean(w4.business_confirmed_at) && (await tbl("fee_events")).find((e) => e.reference_id === req4.id)?.status === "pending");
    await b.screenshot({ path: `${OUT}/f7-${sfx}-business-after.png`, fullPage: true });

    // ---------- attendance: no-show twice for B → strike, then opt-in removed ----------
    for (const n of [1, 2]) {
      const rq = (await rest(btok, "POST", "emergency_requests", { requester_id: bizUser, requester_type: "business", address_line: "Damrak 1", postcode: "1012 LG", city: "Amsterdam", window_start: inMs(2500), window_end: inMs(3 * 3600e3), hours: 2, tasks: `No-show test ${n} (B).` })).data?.[0];
      ok(`[${label}] B accepts no-show test ${n}`, (await rest(B.token, "POST", "rpc/accept_emergency_request", { p_request_id: rq.id })).data === true);
      await new Promise((r) => setTimeout(r, 3000));
      await b.goto(`${APP}/en/emergency`, { waitUntil: "networkidle" });
      await b.locator(`[data-cover-request='${rq.id}']`).getByRole("button", { name: "No, did not show up" }).click();
      await b.waitForTimeout(2000);
      const fe = (await tbl("fee_events")).find((e) => e.reference_id === rq.id);
      const wr = (await tbl("work_records")).find((w) => w.reference_id === rq.id);
      const strikes = (await tbl("cleaner_strikes")).filter((s) => s.cleaner_profile_id === B.cp.id).length;
      ok(`[${label}] No-show ${n}: fee waived, work record no_show, ${n} strike(s) for B`, fe?.status === "waived" && fe.waived_reason === "no-show" && wr?.outcome === "no_show" && strikes === n);
    }
    const bRow = (await tbl("cleaner_profiles")).find((c) => c.id === B.cp.id);
    ok(`[${label}] Two strikes → B's emergency opt-in switched off`, bRow.emergency_opt_in === false);
    await B.page.goto(`${APP}/en/work?tab=emergency`, { waitUntil: "networkidle" });
    ok(`[${label}] B's Emergency tab explains the opt-in was removed`, (await B.page.locator("[data-opt-in-removed]").count()) === 1 && /switched off for you/.test(await B.page.textContent("main")));
    await B.page.screenshot({ path: `${OUT}/f7-${sfx}-cleaner-removed.png`, fullPage: true });
    await A.page.goto(`${APP}/en/work?tab=emergency`, { waitUntil: "networkidle" });
    ok(`[${label}] A (no strikes) still sees the Emergency tab normally`, (await A.page.locator("[data-opt-in-removed]").count()) === 0 && !/strike/.test(await A.page.textContent("main")));

    // ---------- database refusals ----------
    ok(`[${label}] DB: a cleaner cannot cancel or report attendance on a request that is not theirs`, (await rest(A.token, "POST", "rpc/cancel_emergency_request", { p_request_id: req2.id, p_reason: "x" })).data === "not_allowed" && (await rest(A.token, "POST", "rpc/report_emergency_attendance", { p_request_id: req4.id, p_came: false, p_note: "" })).data === false);
    ok(`[${label}] DB: nobody can write strikes directly; a request cannot use another company's unit`, (await rest(btok, "POST", "cleaner_strikes", { cleaner_profile_id: A.cp.id, reason: "x" })).status >= 400 && (await rest(A.token, "POST", "emergency_requests", { requester_id: A.userId, requester_type: "household", unit_id: unit.id, address_line: "x", postcode: "1012 AB", city: "A", window_start: inMs(3600e3), window_end: inMs(7200e3), hours: 2, tasks: "unit theft attempt" })).status >= 400);

    // ---------- admin: settings fields + emergency table ----------
    const actx = await browser.newContext({ viewport }); const a = await actx.newPage(); track(a);
    await signUp(a, "afrongelic.events@gmail.com", "household");
    await a.goto(`${APP}/en/admin/settings`, { waitUntil: "networkidle" });
    ok(`[${label}] Admin → Settings has the cover rules (cancel hours, strikes, days ahead)`, /Free cancellation until/.test(await a.textContent("main")) && /Strikes before/.test(await a.textContent("main")));
    await a.goto(`${APP}/en/admin/emergency`, { waitUntil: "networkidle" });
    ok(`[${label}] Admin → Emergency shows attendance and strikes`, /no-show/.test(await a.textContent("main")) && /Came\?/.test(await a.textContent("main")));

    // ---------- household form untouched ----------
    const hctx = await browser.newContext({ viewport }); const h = await hctx.newPage(); track(h);
    await signUp(h, `hh-${sfx}@example.com`, "household");
    await h.goto(`${APP}/en/emergency`, { waitUntil: "networkidle" });
    ok(`[${label}] Household emergency page is the same same-day form (no unit picker, no day)`, (await h.locator("[data-cover-form]").count()) === 0 && (await h.locator("input[autocomplete='street-address']").count()) === 1 && (await h.locator("input[type=date]").count()) === 0);

    for (const x of [A, B, C, D]) await x.ctx.close();
    await bctx.close(); await actx.close(); await hctx.close();
  }

  ok("No unexpected browser errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  fs.writeFileSync(`${OUT}/flow7-results.json`, JSON.stringify(results, null, 2));
  await browser.close();
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
