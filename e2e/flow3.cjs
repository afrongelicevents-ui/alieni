/* Business flow against the stand-in: business signs up (account + profile +
 * units), posts a job, a cleaner responds, business messages the cleaner,
 * both confirm a deal, hotel adds turnovers, cleaner reserves + completes;
 * household emergency request accepted by an opted-in cleaner. */
const { chromium } = require("playwright");
const fs = require("node:fs");
const APP = "http://localhost:3100";
const EMU = "http://localhost:4000";
const OUT = process.env.E2E_OUT || "e2e/out";
const results = [];
function ok(name, pass, detail = "") { results.push({ name, pass, detail }); console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); }
const tbl = async (n) => (await fetch(`${EMU}/__emu/table?name=${n}`)).json();
async function signUp(page, email, role) {
  await page.goto(`${APP}/en/signup?role=${role}`, { waitUntil: "networkidle" });
  await page.fill("input[type=email]", email);
  await page.fill("input[autocomplete='given-name']", email.split("@")[0]);
  await page.fill("input[type=password]", "Test-Password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/en\/(home|profile|admin|business\/dashboard)$/, { timeout: 15000 });
  await page.waitForLoadState("networkidle");
}

(async () => {
  await fetch(`${EMU}/__emu/reset`);
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const errors = [];
  const track = (page) => {
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error" && !/status of (400|404|422)|realtime\/v1\/websocket/.test(m.text())) errors.push(`console: ${m.text()}`); });
  };

  // ---------- Cleaner with emergency opt-in ----------
  const cleanerCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const cleaner = await cleanerCtx.newPage(); track(cleaner);
  await signUp(cleaner, "kofi@example.com", "cleaner");
  await cleaner.goto(`${APP}/en/cleaners/new`, { waitUntil: "networkidle" });
  await cleaner.fill("input[maxlength='80']", "Kofi A.");
  await cleaner.fill("input[maxlength='60']", "Amsterdam");
  await cleaner.getByRole("button", { name: "Next" }).click();
  await cleaner.getByRole("button", { name: /Regular cleaning/ }).first().click();
  await cleaner.getByText("Both", { exact: true }).click();
  await cleaner.getByRole("button", { name: /^Hotels/ }).click();
  await cleaner.getByLabel(/Emergency jobs/).check();
  await cleaner.fill("input[inputmode='decimal'] >> nth=0", "30,00");
  await cleaner.getByRole("button", { name: "Next" }).click();
  await cleaner.fill("input[placeholder='1012 AB']", "1012 AB");
  await cleaner.locator("td button").nth(0).click();
  await cleaner.getByRole("button", { name: /Save ad|Publish/ }).click();
  await cleaner.waitForSelector("text=Your ad is live", { timeout: 15000 });
  const ad = (await tbl("cleaner_profiles"))[0];
  ok("Cleaner: ad with hotel job type and emergency opt-in, no KvK asked", ad?.status === "published" && ad.emergency_opt_in === true && ad.kvk_number == null, JSON.stringify({ jt: ad?.job_types, em: ad?.emergency_rate_cents }));

  // ---------- Business sign-up (signed out) ----------
  const bizCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const biz = await bizCtx.newPage(); track(biz);
  await biz.goto(`${APP}/en/business/signup?type=hotel`, { waitUntil: "networkidle" });
  await biz.fill("input[autocomplete='given-name']", "Anna");
  await biz.fill("input[autocomplete='family-name']", "de Vries");
  await biz.fill("input[type=email]", "hotel@example.com");
  await biz.fill("input[type=password]", "Test-Password-123");
  await biz.fill("input[autocomplete='organization']", "Hotel De Linde");
  await biz.getByRole("button", { name: "Next" }).click(); // type (hotel preselected)
  await biz.getByRole("button", { name: "Next" }).click(); // how many
  await biz.fill("input[type=number]", "24");
  await biz.getByRole("button", { name: "Next" }).click(); // addresses
  await biz.fill("input[autocomplete='street-address']", "Lindelaan 1");
  await biz.fill("input[placeholder='1012 AB']", "1017 AB");
  await biz.locator("fieldset input").nth(3).fill("Amsterdam");
  await biz.getByRole("button", { name: /Go to my dashboard/ }).click();
  await biz.waitForURL(/\/en\/business\/dashboard$/, { timeout: 20000 });
  await biz.waitForLoadState("networkidle");
  const bp = (await tbl("business_profiles"))[0];
  const units = await tbl("business_units");
  ok("Business: account + profile + unit saved", bp?.company_name === "Hotel De Linde" && bp.unit_count === 24 && units.length === 1 && Boolean(units[0].location), JSON.stringify({ type: bp?.business_type, units: units.length }));
  ok("Business: dashboard shows company, 24 rooms × €3,00", /Hotel De Linde/.test(await biz.textContent("main")) && /24/.test(await biz.textContent("main")));
  await biz.screenshot({ path: `${OUT}/f3-01-business-dashboard.png`, fullPage: true });

  // manual turnovers (Phase 1: the calendar lives on its own page)
  const tomorrow = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10);
  await biz.goto(`${APP}/en/business/calendar`, { waitUntil: "networkidle" });
  await biz.fill("input[type=date]", tomorrow);
  await biz.locator("input[type=number][max='50']").fill("3");
  await biz.getByRole("button", { name: "Add" }).first().click();
  await biz.waitForTimeout(1500);
  ok("Business: 3 manual turnovers added to cleaning_slots", (await tbl("cleaning_slots")).length === 3);

  // post a job
  await biz.goto(`${APP}/en/jobs/new`, { waitUntil: "networkidle" });
  await biz.selectOption("select >> nth=0", "hospitality"); // space type the cleaner works in
  await biz.selectOption("select >> nth=1", { index: 1 }); // unit
  await biz.getByLabel("Frequency").selectOption("once");
  await biz.locator("input[type=date]").fill(new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10));
  await biz.fill("textarea", "Daily room turnovers, 24 rooms, 11:00-15:00, linen provided.");
  await biz.getByRole("button", { name: /Post job/ }).click();
  await biz.waitForSelector("text=Your job is ready", { timeout: 15000 });
  const job = (await tbl("jobs"))[0];
  ok("Business: job published", job?.status === "published" && job.city === "Amsterdam", JSON.stringify({ unit: Boolean(job?.unit_id) }));

  // ---------- Cleaner responds ----------
  await cleaner.goto(`${APP}/en/jobs`, { waitUntil: "networkidle" });
  ok("Cleaner: matching job in Work → Business jobs (no sample)", /\/en\/work/.test(cleaner.url()) && /Hotel De Linde/.test(await cleaner.textContent("main")) && !/example/.test(await cleaner.textContent("main")));
  await cleaner.getByRole("button", { name: "Respond to this job" }).click();
  await cleaner.fill("textarea", "Available every day from 11:00. Hotel experience.");
  await cleaner.getByRole("button", { name: "Send response" }).click();
  await cleaner.waitForSelector("text=Response sent", { timeout: 15000 });
  ok("Cleaner: response stored", (await tbl("job_responses")).length === 1);

  // ---------- Business sees response, messages, deal ----------
  await biz.goto(`${APP}/en/jobs`, { waitUntil: "networkidle" });
  ok("Business: sees 1 response with cleaner name", /1 response/.test(await biz.textContent("main")) && /Kofi A\./.test(await biz.textContent("main")));
  await biz.getByRole("button", { name: "Message" }).click();
  await biz.waitForURL(/\/en\/messages\/[0-9a-f-]{36}$/, { timeout: 15000 });
  await biz.waitForLoadState("networkidle");
  await biz.fill("#chat-draft", "Hi Kofi, can you start Monday?");
  await biz.keyboard.press("Enter");
  await biz.waitForTimeout(2000);
  await biz.getByRole("button", { name: /We have a deal/ }).click();
  await biz.waitForTimeout(1500);
  await cleaner.goto(`${APP}/en/messages`, { waitUntil: "networkidle" });
  await cleaner.getByRole("link", { name: /Hotel De Linde/ }).click();
  await cleaner.waitForURL(/\/en\/messages\/[0-9a-f-]{36}$/, { timeout: 15000 });
  await cleaner.waitForLoadState("networkidle");
  await cleaner.getByRole("button", { name: /We have a deal/ }).click();
  await cleaner.waitForTimeout(1500);
  ok("Business ↔ cleaner: connection active", (await tbl("connections"))[0]?.status === "active");

  // ---------- Cleaner sees hotel turnovers, reserves, completes ----------
  await cleaner.goto(`${APP}/en/cleaners/slots`, { waitUntil: "networkidle" });
  ok("Cleaner: sees the hotel's 3 turnover slots in Work → Turnovers", /tab=turnovers/.test(cleaner.url()) && (await cleaner.getByRole("button", { name: "Reserve" }).count()) === 3);
  await cleaner.getByRole("button", { name: "Reserve" }).first().click();
  await cleaner.waitForTimeout(1500);
  const reserved = (await tbl("cleaning_slots")).find((s) => s.status === "reserved");
  ok("Cleaner: slot reserved for them", Boolean(reserved) && reserved.reserved_by === ad.id);
  await cleaner.getByRole("button", { name: /Done/ }).first().click();
  await cleaner.waitForTimeout(2500);
  ok("Cleaner: slot marked done", (await tbl("cleaning_slots")).some((s) => s.status === "done" && s.done_at));
  await biz.goto(`${APP}/en/business/dashboard`, { waitUntil: "networkidle" });
  ok("Business: dashboard shows connected cleaner + done slot", /Kofi A\./.test(await biz.textContent("main")) && /done/i.test(await biz.textContent("main")));

  // ---------- Emergency ----------
  const hhCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const hh = await hhCtx.newPage(); track(hh);
  await signUp(hh, "jansen@example.com", "household");
  await hh.goto(`${APP}/en/emergency`, { waitUntil: "networkidle" });
  await hh.fill("input[autocomplete='street-address']", "Keizersgracht 10");
  await hh.fill("input[placeholder='1012 AB']", "1015 CS");
  await hh.locator("form input").nth(2).fill("Amsterdam");
  const later = new Date(Date.now() + 2 * 36e5), end = new Date(Date.now() + 6 * 36e5);
  const hhmm = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  // the household form is same-day only: late in the evening keep the window before midnight
  const sameDay = (d) => d.getDate() === new Date().getDate();
  await hh.locator("input[type=time]").nth(0).fill(sameDay(later) ? hhmm(later) : hhmm(new Date(Date.now() + 2 * 60e3)));
  await hh.locator("input[type=time]").nth(1).fill(sameDay(end) ? hhmm(end) : "23:59");
  await hh.fill("textarea", "Whole flat after a party: kitchen, bathroom, floors.");
  await hh.getByRole("button", { name: /Send emergency request/ }).click();
  await hh.waitForSelector("text=Searching for a cleaner", { timeout: 15000 });
  const er = (await tbl("emergency_requests"))[0];
  ok("Household: emergency request stored (searching, with address)", er?.status === "searching" && er.address_line === "Keizersgracht 10");
  await cleaner.goto(`${APP}/en/cleaners/emergency`, { waitUntil: "networkidle" });
  ok("Cleaner: sees open request without the address", /Amsterdam \(1015\)/.test(await cleaner.textContent("main")) && !/Keizersgracht/.test(await cleaner.textContent("main")));
  await cleaner.getByRole("button", { name: "Accept this job" }).click();
  await cleaner.waitForTimeout(2000);
  const er2 = (await tbl("emergency_requests"))[0];
  ok("Cleaner: accepted (fee set only now)", er2.status === "accepted" && er2.accepted_by === ad.id && er2.fee_cents === 995);
  ok("Cleaner: sees the address after accepting", /Keizersgracht 10/.test(await cleaner.textContent("main")));
  await hh.goto(`${APP}/en/emergency`, { waitUntil: "networkidle" });
  ok("Household: sees 'Booked' with cleaner name + emergency rate", /Booked/.test(await hh.textContent("main")) && /Kofi A\./.test(await hh.textContent("main")) && /30,00|30\.00/.test(await hh.textContent("main")));
  await hh.screenshot({ path: `${OUT}/f3-02-emergency-booked.png`, fullPage: true });

  ok("No unexpected browser errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  fs.writeFileSync(`${OUT}/flow3-results.json`, JSON.stringify(results, null, 2));
  await browser.close();
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
