/* Phase 1 — business foundations, on phone and desktop width:
 * service catalogue tiles (on / coming soon / off for sector, refused server-side),
 * "price to be announced" without an active rule, fee events at € 0, work records
 * from an accepted one-off quotation (cleaner completes → business confirms),
 * admin pricing rule → next event carries the amount, cleaner work types filter,
 * and database refusals for the new tables. */
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
async function navLabels(page, mobile) {
  // Website navigation (redesign): no bottom bar. Phones use the hamburger
  // menu; desktop uses the header's main menu (role links, or mega-menu buttons for guests).
  if (mobile) {
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.waitForSelector("#mobile-menu");
    const labels = await page.locator("#mobile-menu a").allTextContents();
    await page.keyboard.press("Escape");
    return labels.map((s) => s.trim());
  }
  const labels = await page.locator("header nav[aria-label='Main menu'] a, header nav[aria-label='Main menu'] button").allTextContents();
  return labels.map((s) => s.trim());
}
async function accessToken(ctx) {
  const cookies = await ctx.cookies();
  const raw = cookies.filter((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name)).sort((a, b) => a.name.localeCompare(b.name)).map((c) => c.value).join("");
  const json = raw.startsWith("base64-") ? Buffer.from(raw.slice(7), "base64").toString() : decodeURIComponent(raw);
  return JSON.parse(json).access_token;
}
const hdr = (token) => ({ apikey: "emu-anon-key", Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "return=representation" });
async function rest(token, method, path, body) {
  const res = await fetch(`${EMU}/rest/v1/${path}`, { method, headers: hdr(token), body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await res.json(); } catch {}
  return { status: res.status, data };
}
const tbl = async (name) => (await fetch(`${EMU}/__emu/table?name=${name}`)).json();
const inHours = (h) => new Date(Date.now() + h * 3600e3).toISOString();

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const errors = [];
  const track = (page) => { page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`)); page.on("console", (m) => { if (m.type() === "error" && !/status of (400|404|422)|realtime\/v1\/websocket/.test(m.text())) errors.push(`console: ${m.text()}`); }); };

  for (const [label, viewport, mobile] of [["phone", { width: 390, height: 844 }, true], ["desktop", { width: 1280, height: 900 }, false]]) {
    await fetch(`${EMU}/__emu/reset`);
    const suffix = mobile ? "m" : "d";

    // ---------- Guest: landing pages show no price until a rule is active ----------
    const g = await (await browser.newContext({ viewport })).newPage(); track(g);
    await g.goto(`${APP}/en/business`, { waitUntil: "networkidle" });
    const landing = await g.textContent("main");
    ok(`[${label}] Business landing: "Price to be announced", no € amounts, no "fixed monthly price"`, (landing.match(/Price to be announced/g) || []).length === 4 && !/€\s?\d/.test(landing) && !/fixed monthly price/i.test(landing));
    await g.goto(`${APP}/en/business/airbnb`, { waitUntil: "networkidle" });
    ok(`[${label}] Airbnb page: price to be announced`, /Price to be announced/.test(await g.textContent("main")) && !/€\s?\d/.test(await g.textContent("main")));
    await g.screenshot({ path: `${OUT}/f6-${suffix}-landing.png`, fullPage: true });

    // ---------- Admin: services + pricing screens, no active rules ----------
    const actx = await browser.newContext({ viewport }); const a = await actx.newPage(); track(a);
    await signUp(a, "afrongelic.events@gmail.com", "household");
    await a.goto(`${APP}/en/admin/services`, { waitUntil: "networkidle" });
    const svc = await a.textContent("main");
    ok(`[${label}] Admin → Services lists the three services`, ["Find & connect cleaners", "One-off cleaning", "Regular cleaning contract"].every((x) => svc.includes(x)) && !/Emergency|turnover/i.test(svc) && (await a.locator("[data-service]").count()) === 3);
    await a.goto(`${APP}/en/admin/pricing`, { waitUntil: "networkidle" });
    ok(`[${label}] Admin → Pricing: no active rules, nothing is charged`, /No active rules/.test(await a.textContent("main")) && (await a.locator("[data-active-rules='0']").count()) === 1);
    await a.screenshot({ path: `${OUT}/f6-${suffix}-admin-pricing.png`, fullPage: true });

    // ---------- Business (Airbnb) sign-up: no price promised ----------
    const bctx = await browser.newContext({ viewport }); const b = await bctx.newPage(); track(b);
    await b.goto(`${APP}/en/business/signup?type=airbnb`, { waitUntil: "networkidle" });
    await b.fill("input[autocomplete='given-name']", "Ava");
    await b.fill("input[autocomplete='family-name']", "Host");
    await b.fill("input[type=email]", `host-${suffix}@example.com`);
    await b.fill("input[type=password]", "Test-Password-123");
    await b.fill("input[autocomplete='organization']", `Canal Stays ${suffix.toUpperCase()}`);
    await b.getByRole("button", { name: "Next" }).click();
    ok(`[${label}] Sign-up step 2: type cards say "Price to be announced"`, (await b.getByText("Price to be announced").count()) >= 4);
    await b.getByRole("button", { name: "Next" }).click();
    const step3 = await b.textContent("main");
    ok(`[${label}] Sign-up step 3: no monthly amount, "nothing is charged" note`, /Price to be announced/.test(step3) && !/€\s?\d/.test(step3) && /nothing is charged/i.test(step3));
    await b.screenshot({ path: `${OUT}/f6-${suffix}-signup-step3.png`, fullPage: true });
    await b.getByRole("button", { name: "Next" }).click();
    await b.fill("input[autocomplete='street-address']", "Prinsengracht 1");
    await b.fill("input[placeholder='1012 AB']", "1015 DX");
    await b.locator("fieldset input").nth(3).fill("Amsterdam");
    await b.getByRole("button", { name: /Go to my dashboard/ }).click();
    await b.waitForURL(/\/en\/business\/dashboard$/, { timeout: 20000 });
    await b.waitForLoadState("networkidle");
    const bizRow = (await tbl("business_profiles")).find((r) => r.company_name.startsWith("Canal Stays"));
    ok(`[${label}] DB: new business has NO unit price (none set)`, bizRow && (bizRow.unit_price_cents == null));

    // The admin switches the regular-contract service off: its tile then reads "Coming soon".
    const adminCookies = await actx.cookies();
    const rawTok = adminCookies.filter((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name)).sort((x, y) => x.name.localeCompare(y.name)).map((c) => c.value).join("");
    const adminSession = JSON.parse(rawTok.startsWith("base64-") ? Buffer.from(rawTok.slice(7), "base64").toString() : decodeURIComponent(rawTok));
    for (const k of ["contract"]) await rest(adminSession.access_token, "PATCH", `service_catalog?service_key=eq.${k}`, { enabled: false });
    await b.reload({ waitUntil: "networkidle" });

    // ---------- Dashboard tiles ----------
    const dash = await b.textContent("main");
    const tile = (k) => b.locator(`[data-tile='${k}']`);
    ok(`[${label}] Dashboard: Find & connect + One-off tiles open; Regular contract "Coming soon"`,
      (await tile("connect").evaluate((el) => el.tagName)) === "A" && (await tile("oneoff").evaluate((el) => el.tagName)) === "A" && (await tile("contract").evaluate((el) => el.tagName)) === "BUTTON" && (dash.match(/Coming soon/g) || []).length === 1);
    ok(`[${label}] Dashboard: "No charges recorded" + "Nothing to do"`, /No charges recorded/.test(dash) && /Nothing to do/.test(dash) && /recorded at € 0/.test(dash));
    await tile("contract").click();
    await b.waitForSelector("[role=status]", { timeout: 10000 });
    ok(`[${label}] Clicking a "coming soon" tile: server refuses ("not switched on")`, /not switched on/.test(await b.textContent("[role=status]")));
    const bnav = await navLabels(b, mobile);
    ok(`[${label}] Business nav: Dashboard, Cleaners, Requests, Messages, Account`, ["Dashboard", "Cleaners", "Requests", "Messages", "Account"].every((x) => bnav.includes(x)) && !bnav.includes("Jobs"), bnav.join("|"));
    await b.screenshot({ path: `${OUT}/f6-${suffix}-dashboard.png`, fullPage: true });
    await b.goto(`${APP}/en/business/requests`, { waitUntil: "networkidle" });
    const req = await b.textContent("main");
    ok(`[${label}] Requests hub: three blocks, one "Coming soon", "No requests yet"`, (await b.locator("[data-request-block]").count()) === 3 && (req.match(/Coming soon/g) || []).length === 1 && /No requests yet/.test(req));
    await b.screenshot({ path: `${OUT}/f6-${suffix}-requests.png`, fullPage: true });
    for (const path of ["/en/business/work", "/en/business/billing", "/en/business/profile"]) {
      const r = await b.goto(`${APP}${path}`, { waitUntil: "networkidle" });
      ok(`[${label}] ${path} renders for the business`, r.status() === 200 && (await b.locator("nav[aria-label='Business dashboard'] a[aria-current='page']").count()) === 1);
    }
    await b.goto(`${APP}/en/business/billing`, { waitUntil: "networkidle" });
    const bill0 = await b.textContent("main");
    ok(`[${label}] Billing page: € 0,00, no price applies, not an invoice`, /€\s?0[.,]00/.test(bill0) && /No price applies/.test(bill0) && /not an invoice/i.test(bill0));
    const btok = await accessToken(bctx);

    // ---------- Cleaner ----------
    const cctx = await browser.newContext({ viewport }); const c = await cctx.newPage(); track(c);
    await signUp(c, `cl-${suffix}@example.com`, "cleaner");
    await c.fill("input[maxlength='80']", `Noor ${suffix.toUpperCase()}`);
    await c.selectOption("select >> nth=0", "5");
    await c.fill("textarea", "Fast, careful and always on time. Happy to help with one-off cleans.");
    await c.getByRole("button", { name: "Next" }).click();
    await c.getByRole("button", { name: /Regular cleaning/ }).first().click();
    ok(`[${label}] Wizard step 2 shows work-type chips (household ones only for household scope)`, (await c.locator("[data-work-type]").count()) === 3 && (await c.locator("[data-work-type='household_regular'][aria-pressed='true']").count()) === 1);
    await c.getByRole("button", { name: "Next" }).click();
    await c.fill("input[placeholder='1012 AB']", "1012 AB");
    await c.locator("td button").nth(1).click();
    await c.getByRole("button", { name: /Save ad|Publish/ }).click();
    await c.waitForSelector("text=Your ad is live", { timeout: 15000 });
    const cp = (await tbl("cleaner_profiles")).find((r) => r.user_id);
    ok(`[${label}] DB: cleaner work_types = household_regular, no emergency fields`, cp && cp.work_types.includes("household_regular") && !cp.work_types.includes("emergency_cover") && !("emergency_opt_in" in cp), JSON.stringify(cp?.work_types));
    await c.goto(`${APP}/en/work`, { waitUntil: "networkidle" });
    const wtabs = await c.locator("nav[aria-label] a").allTextContents();
    ok(`[${label}] Work page tabs: My jobs, no Emergency or Turnovers`, wtabs.includes("My jobs") && !wtabs.some((x) => /Emergency|Turnovers/.test(x)), wtabs.join("|"));
    const ctok = await accessToken(cctx);
    await rest(ctok, "PATCH", `cleaner_profiles?id=eq.${cp.id}`, { work_scope: "both" });

    // ---------- Business posts a one-off job; the cleaner sends a quotation; the business accepts → work record + € 0 fee event ----------
    const awardOneOff = async (description, inDays) => {
      const job = await rest(btok, "POST", "jobs", { business_id: bizRow.id, status: "published", space_type: "hospitality", postcode: "1015 DX", city: "Amsterdam", frequency: "once", description, start_date: inHours(inDays * 24).slice(0, 10), visit_start: "10:00", visit_hours: 3 });
      const jobId = job.data?.[0]?.id;
      const quote = await rest(ctok, "POST", "rpc/submit_job_quote", { p_job_id: jobId, p_rate_cents: 2600, p_message: "Available that morning." });
      const responseId = (await tbl("job_responses")).find((r) => r.job_id === jobId)?.id;
      const acc = await rest(btok, "POST", "rpc/accept_job_response", { p_response_id: responseId });
      return { jobId, responseId, quote, acc };
    };
    const first = await awardOneOff("Checkout clean, 2 bedrooms", 2);
    ok(`[${label}] Cleaner quotes on the one-off job and the business accepts`, first.quote.data?.result === "sent" && first.acc.data?.result === "accepted", JSON.stringify([first.quote.data, first.acc.data]));
    const work1 = (await tbl("work_records")).find((w) => w.job_id === first.jobId);
    const fee1 = (await tbl("fee_events")).find((e) => e.reference_id === first.responseId);
    ok(`[${label}] DB: work record created (scheduled, business + cleaner linked)`, work1 && work1.business_id === bizRow.id && work1.cleaner_profile_id === cp.id && work1.outcome === "scheduled" && work1.service_key === "oneoff");
    ok(`[${label}] DB: fee event recorded at € 0, model none, status pending`, fee1 && fee1.amount_cents === 0 && fee1.model === "none" && fee1.status === "pending" && fee1.event_type === "quote_accepted");

    // cleaner: My jobs → Done
    await c.goto(`${APP}/en/work?tab=mine`, { waitUntil: "networkidle" });
    ok(`[${label}] Cleaner "My jobs" lists the accepted job with Started/Done`, (await c.locator("[data-my-work]").count()) === 1 && (await c.getByRole("button", { name: "Done" }).count()) === 1);
    await c.getByRole("button", { name: "Done" }).click();
    await c.waitForTimeout(2500);
    await c.goto(`${APP}/en/work?tab=mine`, { waitUntil: "load" });
    await c.waitForSelector("[data-my-work]", { timeout: 15000 });
    ok(`[${label}] Cleaner marked it done`, /Done/.test(await c.locator("[data-my-work]").first().textContent()) && (await tbl("work_records"))[0].outcome === "done");
    await c.screenshot({ path: `${OUT}/f6-${suffix}-cleaner-myjobs.png`, fullPage: true });

    // business: waiting on you → confirm
    await b.goto(`${APP}/en/business/dashboard`, { waitUntil: "networkidle" });
    ok(`[${label}] Dashboard: "1 completed job waiting for your confirmation" + 1 event recorded`, /1 completed job waiting/.test(await b.textContent("[data-waiting]")) && /1 event recorded/.test(await b.textContent("[data-statement]")));
    await b.goto(`${APP}/en/business/work`, { waitUntil: "networkidle" });
    await b.getByRole("button", { name: "Confirm" }).click();
    await b.waitForTimeout(2500);
    await b.goto(`${APP}/en/business/work`, { waitUntil: "load" });
    await b.waitForSelector("[data-work]", { timeout: 15000 });
    ok(`[${label}] Business confirmed the work`, /Confirmed on/.test(await b.textContent("[data-work]")) && Boolean((await tbl("work_records"))[0].business_confirmed_at));
    await b.screenshot({ path: `${OUT}/f6-${suffix}-business-work.png`, fullPage: true });

    // ---------- Admin: fee event visible at € 0; add + activate a per-event rule → next event carries € 10 ----------
    await a.goto(`${APP}/en/admin/fees`, { waitUntil: "networkidle" });
    ok(`[${label}] Admin → Recorded fees shows the € 0 event`, (await a.locator("[data-fee]").count()) === 1 && /€\s?0[.,]00/.test(await a.textContent("[data-fee]")));
    await a.goto(`${APP}/en/admin/pricing`, { waitUntil: "networkidle" });
    await a.selectOption("select >> nth=0", "oneoff");
    await a.selectOption("select >> nth=2", "per_event");
    await a.fill("input[placeholder='0,00']", "10,00");
    await a.getByRole("button", { name: "Save rule" }).click();
    await a.waitForSelector("text=Rule saved", { timeout: 10000 });
    await a.goto(`${APP}/en/admin/pricing`, { waitUntil: "networkidle" });
    ok(`[${label}] New rule is INACTIVE by default (still no active rules)`, (await a.locator("[data-rule]").count()) === 1 && (await a.locator("[data-active-rules='0']").count()) === 1);
    await a.getByRole("button", { name: "Activate" }).click();
    await a.waitForTimeout(1500);
    await a.goto(`${APP}/en/admin/pricing`, { waitUntil: "networkidle" });
    ok(`[${label}] Rule activated: 1 active rule`, (await a.locator("[data-active-rules='1']").count()) === 1);
    const second = await awardOneOff("Second clean, kitchen and bathroom", 30);
    const fee2 = (await tbl("fee_events")).find((e) => e.reference_id === second.responseId);
    ok(`[${label}] DB: second event carries € 10,00 from the active rule (first stays € 0)`, fee2 && fee2.amount_cents === 1000 && fee2.model === "per_event" && fee1.amount_cents === 0);
    await b.goto(`${APP}/en/business/billing`, { waitUntil: "networkidle" });
    const bill = await b.textContent("main");
    ok(`[${label}] Business billing: statement total € 10,00, rule shown, two events, still "not an invoice"`, /€\s?10[.,]00/.test(await b.textContent("[data-statement-total]")) && (await b.locator("[data-fee-event]").count()) === 2 && /Per event/.test(bill) && /not an invoice/i.test(bill));
    await b.screenshot({ path: `${OUT}/f6-${suffix}-billing.png`, fullPage: true });
    await a.goto(`${APP}/en/admin/work`, { waitUntil: "networkidle" });
    ok(`[${label}] Admin → Work done lists both records`, (await a.locator("[data-admin-work]").count()) === 2);

    // ---------- Admin: limit "one-off" to hotels → Airbnb business sees "Not available for your sector" ----------
    await a.goto(`${APP}/en/admin/services`, { waitUntil: "networkidle" });
    const oneoffRow = a.locator("[data-service='oneoff']");
    await oneoffRow.getByRole("button", { name: "Hotels & guesthouses" }).click();
    await oneoffRow.getByRole("button", { name: "Save" }).click();
    await a.waitForSelector("[role=status]", { timeout: 10000 });
    await b.goto(`${APP}/en/business/dashboard`, { waitUntil: "networkidle" });
    ok(`[${label}] Airbnb dashboard: one-off tile now "Not available for your sector"`, (await tile("oneoff").evaluate((el) => el.tagName)) === "BUTTON" && /Not available for your sector/.test(await tile("oneoff").textContent()));
    await oneoffRow.getByRole("button", { name: "Hotels & guesthouses" }).click();
    await oneoffRow.getByRole("button", { name: "Save" }).click();
    await a.waitForTimeout(1000);

    // ---------- Database refusals ----------
    ok(`[${label}] DB: business cannot write fee events or work records directly`, (await rest(btok, "POST", "fee_events", { business_id: bizRow.id, service_key: "oneoff", event_type: "x" })).status >= 400 && (await rest(btok, "PATCH", `work_records?id=eq.${work1.id}`, { outcome: "done" })).status >= 400);
    ok(`[${label}] DB: business/cleaner cannot change the catalogue or pricing rules`, (await rest(btok, "PATCH", "service_catalog?service_key=eq.oneoff", { enabled: true })).status >= 400 && (await rest(ctok, "POST", "pricing_rules", { service_key: "oneoff", model: "per_event", amount_cents: 1, active: true })).status >= 400);
    ok(`[${label}] DB: cleaner cannot confirm work on the business's behalf`, (await rest(ctok, "POST", "rpc/review_work_record", { p_record_id: work1.id, p_ok: true, p_note: "" })).status >= 400);

    await actx.close(); await bctx.close(); await cctx.close(); await g.context().close();
  }

  ok("No unexpected browser errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  fs.writeFileSync(`${OUT}/flow6-results.json`, JSON.stringify(results, null, 2));
  await browser.close();
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
